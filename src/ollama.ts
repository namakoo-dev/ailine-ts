import { AilineFatalError } from "./errors.js";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export const DEFAULT_MODEL_FALLBACK = "qwen2.5-coder:7b";
const TIMEOUT_MS = 300_000;

/**
 * Read fresh from the environment on every call rather than freezing at
 * import time. basrun-ts/src/config.ts documents why the original's
 * import-time freeze is a Python-specific footgun not worth carrying.
 */
export function ollamaHost(env: NodeJS.ProcessEnv = process.env): string {
  return (env.OLLAMA_HOST && env.OLLAMA_HOST !== "" ? env.OLLAMA_HOST : "http://localhost:11434").replace(/\/+$/, "");
}

/** `--model` default; AILINE_MODEL overrides it (nodes/cli-overview.md). */
export function defaultModel(env: NodeJS.ProcessEnv = process.env): string {
  return env.AILINE_MODEL && env.AILINE_MODEL !== "" ? env.AILINE_MODEL : DEFAULT_MODEL_FALLBACK;
}

/**
 * ollama-generate (あ, CROSSING.md). The whole "never sends data outside this
 * machine" pillar is implemented right here: the host defaults to localhost
 * and nothing else is ever contacted (nodes/ollama-generate.md ②).
 *
 * Fixed parameters are the API contract, carried as-is: num_predict 1600,
 * num_ctx 8192 (CONTRACT + few-shot + helper catalog + task must fit inside
 * it), stream false, 300s timeout.
 *
 * ★ Two failure modes, deliberately opposite (nodes/ollama-generate.md ③):
 *
 *  - Connection failure throws AilineFatalError, which repair-loop does NOT
 *    catch. Retrying a refused connection cannot fix it — that is a different
 *    kind of failure from "the model wrote bad code", and mixing them would
 *    burn all three attempts against a server that is simply not running.
 *    The original's ③ notes Python left it ambiguous whether a timeout is
 *    even the same exception class; the node says to grasp it explicitly in
 *    TS, so timeout, refused connection and non-2xx all land here together.
 *
 *  - A 200 response with no message.content returns "" and is NOT an error.
 *    The empty string flows into extract-bas -> valid-signature, fails the
 *    signature check like any other bad output, and enters the repair loop
 *    through the normal door.
 */
export async function ollamaGenerate(
  model: string,
  messages: ChatMessage[],
  temperature = 0.2,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string> {
  const host = ollamaHost(env);
  const body = JSON.stringify({
    model,
    messages,
    stream: false,
    options: { temperature, num_predict: 1600, num_ctx: 8192 },
  });

  let res: Response;
  try {
    res = await fetch(`${host}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    throw unreachable(host, err);
  }
  if (!res.ok) {
    throw unreachable(host, new Error(`HTTP ${res.status} ${res.statusText}`));
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch (err) {
    throw unreachable(host, err);
  }
  const content = (data as { message?: { content?: unknown } } | null)?.message?.content;
  return typeof content === "string" ? content : "";
}

function unreachable(host: string, err: unknown): AilineFatalError {
  const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  return new AilineFatalError(
    `ollama に繋がらない (${host}): ${detail}\n` + "★ `ollama serve` が動いているか確認。外部送信はしない設計。",
  );
}
