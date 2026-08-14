import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { basrunPath } from "./basrunPath.js";

export interface ApplyResult {
  ok: boolean;
  /** Failure only: the tail of stdout+stderr. */
  error: string | null;
  /** Always: the full merged output. */
  raw: string;
}

/** basrun/LibreOffice put the real cause at the END of their output. */
const ERROR_TAIL = 800;

/**
 * basrun-apply-invocation (あ, CROSSING.md). Three steps, in order
 * (nodes/basrun-apply-invocation.md ①):
 *
 *  1. Rebuild `workdir/src` from scratch every attempt. ★ Not tidiness:
 *     basrun syncs a DIRECTORY into a Basic library, and a leftover Gen.bas
 *     from the previous attempt keeps living in that library. The repair loop
 *     runs this up to three times, so a stale file would silently cross the
 *     attempts.
 *  2. Copy the helper .bas files in beside the generated Gen.bas. This is
 *     what makes `Call SortByColumn(oDoc, 1, False)` resolve at runtime — the
 *     whole load-helpers design only works because the definitions land in
 *     the SAME library as the generated code.
 *  3. `basrun apply <book> <src> AiLine Gen.Run`. Library and entry are
 *     constants; valid-signature is what earns that
 *     (nodes/valid-signature.md ②). basrun's apply does sync + run + save in
 *     one call — confirmed against basrun-ts/src/applyCmd.ts, whose entry is
 *     `Module.Sub`.
 *
 * The original passed encoding="utf-8", errors="replace" here specifically to
 * dodge a cp932 decode crash on Windows (nodes/basrun-apply-invocation.md ②).
 * Node has no equivalent failure mode — a Buffer decoded as UTF-8 substitutes
 * U+FFFD instead of throwing — so that hazard does not carry over, but the
 * behavior it protected (merge both streams, keep the tail on failure) does.
 *
 * `book` is expected to be the `.out` copy already: making the safe copy is
 * the caller's job (nodes/basrun-apply-invocation.md ③).
 */
export async function basrunApply(
  book: string,
  code: string,
  workdir: string,
  helperFiles: string[] = [],
  env: NodeJS.ProcessEnv = process.env,
  timeoutMs?: number,
): Promise<ApplyResult> {
  const src = path.join(workdir, "src");
  fs.rmSync(src, { recursive: true, force: true });
  fs.mkdirSync(src, { recursive: true });
  for (const hf of helperFiles) {
    fs.copyFileSync(hf, path.join(src, path.basename(hf)));
  }
  fs.writeFileSync(path.join(src, "Gen.bas"), code, "utf-8");

  const cli = basrunPath(env);
  const { status, out } = await run(process.execPath, [cli, "apply", book, src, "AiLine", "Gen.Run"], env, timeoutMs);
  if (status !== 0) {
    return { ok: false, error: out.trim().slice(-ERROR_TAIL), raw: out };
  }
  return { ok: true, error: null, raw: out };
}

/**
 * stop delegation shares this runner (nodes/cmd-stop.md).
 *
 * ★ `timeoutMs` is an addition beyond the behavior corpus, and it defaults to
 * undefined — no timeout — so the shipped path is exactly what the original
 * did (`subprocess.run` with no timeout). It exists because the omission has
 * a real failure mode, hit twice while measuring the E layer: the model
 * generated Basic containing a runaway loop, LibreOffice executed it
 * faithfully, and the apply never returned. soffice sat at 546 seconds of CPU
 * and "Responding: True" — not deadlocked, just never finishing.
 *
 * The no-op guard answers "did it do nothing?". Nothing in the design answers
 * "will it ever come back?". Callers that need to bound that (the E-layer
 * harness does) can opt in; on expiry the child tree is killed and the
 * failure flows into the repair loop as a runtime error, which is the honest
 * classification — the model wrote code that does not terminate.
 */
export function run(
  cmd: string,
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
  timeoutMs?: number,
): Promise<{ status: number; out: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let timer: NodeJS.Timeout | undefined;
    let timedOut = false;

    const done = (status: number, extra = ""): void => {
      if (timer) clearTimeout(timer);
      resolve({ status, out: `${stdout}\n${stderr}${extra}` });
    };

    if (timeoutMs !== undefined) {
      timer = setTimeout(() => {
        timedOut = true;
        if (child.pid !== undefined) killTree(child.pid);
      }, timeoutMs);
    }

    child.stdout.setEncoding("utf-8");
    child.stderr.setEncoding("utf-8");
    child.stdout.on("data", (d: string) => {
      stdout += d;
    });
    child.stderr.on("data", (d: string) => {
      stderr += d;
    });
    child.on("error", (err) => {
      done(-1, `\n${err.message}`);
    });
    child.on("close", (code) => {
      if (timedOut) {
        done(-1, `\n★ ${timeoutMs} ms を超えても終わらないので打ち切った（生成コードが終了しない可能性）。`);
        return;
      }
      done(code ?? -1);
    });
  });
}

/** Killing the direct child is not enough — basrun spawns its own children. */
function killTree(pid: number): void {
  try {
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
    } else {
      process.kill(pid, "SIGKILL");
    }
  } catch {
    /* best effort */
  }
}
