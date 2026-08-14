#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Command, CommanderError } from "commander";
import { AilineError, AilineUsageError } from "./errors.js";
import { defaultModel } from "./ollama.js";
import { RunArgs, repairLoop } from "./repairLoop.js";
import { cmdStop } from "./stopCmd.js";

/**
 * cli-overview (あ, CROSSING.md). Two subcommands, argument shapes lifted
 * from nodes/cli-overview.md's table.
 *
 * Two only, because ailine is a thin skin over a single generate -> apply ->
 * verify pipeline and holds no state of its own; starting and stopping
 * LibreOffice belongs to basrun (nodes/cli-overview.md ②).
 *
 * Split into parse and dispatch the same way basrun-ts is, and for the same
 * reason: `parseArgv` is pure — it never contacts ollama, never opens a
 * document — so argument handling is testable without a live environment.
 * The Python original had no such test; this is one of the holes GOLDEN.md F
 * points at as an opportunity for the port rather than a spec to match.
 */

export type ParsedInvocation =
  | { command: "run"; args: RunArgs }
  | { command: "stop"; args: Record<string, never> }
  | { command: "help" };

interface RawRunOptions {
  model: string;
  refs: string;
  helpers: string;
  repair: string;
  temperature: string;
  dry: boolean;
  inplace: boolean;
  json: boolean;
}

export function buildParser(onParsed: (p: ParsedInvocation) => void, env: NodeJS.ProcessEnv = process.env): Command {
  const program = new Command();
  program.name("ailine").description("自然文のタスクをローカル LLM が LibreOffice Basic に書き起こし、適用し、効いたかを読み戻して確かめる。");
  program.exitOverride();
  program.configureOutput({
    writeErr: () => {
      /* commander's own error text is suppressed; the caller reports. */
    },
  });

  program
    .command("run")
    .description("タスクを生成・適用・検証する")
    .argument("<book>", "対象の文書 (.xlsx / .ods)")
    .argument("<task>", "やりたいことの自然言語タスク")
    // AILINE_MODEL overrides the built-in default; --model overrides both.
    .option("--model <name>", "ollama モデル名", defaultModel(env))
    .option("--refs <dir>", "few-shot 参照ライブラリのディレクトリ", "./refs")
    .option("--helpers <dir>", "検証済みヘルパのディレクトリ", "./helpers")
    .option("--repair <n>", "失敗時の修復（再生成）の最大回数", "2")
    .option("--temperature <f>", "LLM 生成温度", "0.2")
    .option("--dry", "生成して見せるだけ（適用しない・レビュー用）", false)
    .option("--inplace", "原本を上書き（既定はコピー .out に適用）", false)
    .option("--json", "結果を JSON でも標準出力に出す", false)
    .action((book: string, task: string, opts: RawRunOptions) => {
      onParsed({
        command: "run",
        args: {
          book,
          task,
          model: opts.model,
          refs: opts.refs,
          helpers: opts.helpers,
          repair: parseIntOption(opts.repair, "--repair"),
          temperature: parseFloatOption(opts.temperature, "--temperature"),
          dry: opts.dry,
          inplace: opts.inplace,
          json: opts.json,
        },
      });
    });

  program
    .command("stop")
    .description("起動した LibreOffice を落とす（basrun へ委譲）")
    .action(() => {
      onParsed({ command: "stop", args: {} });
    });

  return program;
}

function parseIntOption(raw: string, flag: string): number {
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) {
    throw new AilineUsageError(`${flag} は 0 以上の整数: ${raw}`);
  }
  return n;
}

function parseFloatOption(raw: string, flag: string): number {
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n)) {
    throw new AilineUsageError(`${flag} は数値: ${raw}`);
  }
  return n;
}

/** Pure parse — no ollama, no LibreOffice, no filesystem side effects. */
export function parseArgv(argv: string[], env: NodeJS.ProcessEnv = process.env): ParsedInvocation {
  let result: ParsedInvocation | undefined;
  const program = buildParser((p) => {
    result = p;
  }, env);
  try {
    program.parse(argv, { from: "user" });
  } catch (err) {
    if (err instanceof CommanderError) {
      // ★ commander funnels two different situations into the same
      // 'commander.help' code: the user asking for help, and no subcommand
      // being given at all. They must not exit the same way — argparse
      // exits 0 for the first and 2 for the second
      // (nodes/cli-overview.md ③) — so the two are told apart by whether
      // help was actually requested.
      const helpish = err.code === "commander.helpDisplayed" || err.code === "commander.help" || err.code === "commander.version";
      if (helpish && wantsHelp(argv)) {
        return { command: "help" };
      }
      if (helpish) {
        throw new AilineUsageError(USAGE);
      }
      // Unknown command, unknown option, missing argument: all exit 2.
      throw new AilineUsageError(err.message || "引数が違う");
    }
    throw err;
  }
  if (!result) {
    throw new AilineUsageError(USAGE);
  }
  return result;
}

const USAGE = 'サブコマンドを指定して: ailine run <book> "<task>" / ailine stop';

function wantsHelp(argv: string[]): boolean {
  return argv.some((a) => a === "-h" || a === "--help" || a === "-V" || a === "--version" || a === "help");
}

export async function main(argv: string[] = process.argv.slice(2), env: NodeJS.ProcessEnv = process.env): Promise<number> {
  const parsed = parseArgv(argv, env);
  if (parsed.command === "help") {
    return 0;
  }
  if (parsed.command === "stop") {
    return await cmdStop(env);
  }

  const a = parsed.args;
  // ★ Checked before anything reaches the LLM (nodes/cli-overview.md ③) —
  // a typo in a path should not cost a model round trip to discover.
  if (!fs.existsSync(a.book)) {
    throw new AilineError(`文書が無い: ${path.resolve(a.book)}`);
  }

  const { code, result } = await repairLoop(a);
  if (a.json) {
    // Additive only — the JSON line never influences success or failure
    // (nodes/repair-loop.md ③).
    console.log(JSON.stringify(result));
  }
  return code;
}

async function run(): Promise<void> {
  try {
    process.exitCode = await main();
  } catch (err) {
    if (err instanceof AilineError) {
      console.error(err.message);
      process.exitCode = err.exitCode;
      return;
    }
    throw err;
  }
}

const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  void run();
}
