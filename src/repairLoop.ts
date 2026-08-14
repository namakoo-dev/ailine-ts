import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { basrunApply } from "./basrunApply.js";
import { diffSnapshots } from "./diffSnapshots.js";
import { extractBas } from "./extractBas.js";
import { ChatMessage, ollamaGenerate } from "./ollama.js";
import { assemblePrompt } from "./promptAssembly.js";
import { snapshot } from "./snapshot.js";
import { validSignature } from "./validSignature.js";

export interface RunArgs {
  book: string;
  task: string;
  model: string;
  refs: string;
  helpers: string;
  repair: number;
  temperature: number;
  dry: boolean;
  inplace: boolean;
  json: boolean;
  /**
   * Optional ceiling on a single basrun apply. Not a CLI flag and undefined
   * by default, so the shipped path matches the original's untimed
   * subprocess call; see basrunApply.ts for the runaway-macro hang this
   * exists to bound.
   */
  applyTimeoutMs?: number | undefined;
}

export interface RunResult {
  ok: boolean;
  attempts: number;
  task: string;
  model: string;
  changes: string[];
  out: string | null;
  dry: boolean;
}

/**
 * The three repair messages, one per failure mode.
 *
 * ★ These three were not designed up front — they were found, separately, in
 * a live demo (nodes/repair-loop.md ②, session 705c3265 2026-08-10
 * 05:02-05:06). Keeping them distinct is a REQUIREMENT in CROSSING.md, not a
 * nicety: a bad signature, a runtime error and a no-op need different things
 * said back to the model.
 */
export const REPAIR_BAD_SIGNATURE = "署名が違う。`Sub Run(oDoc As Object)` を1つだけ。コードのみ。";
export const repairRuntimeError = (err: string): string => `実行時エラー: ${err}\nこれを直して`;
export const REPAIR_NOOP =
  "実行は成功したが文書に一切変化が無かった（no-op）。設定した API が効いていない可能性がある。別の正しい方法で書き直して。";

/**
 * repair-loop (い — 構造は渡るが再設計要, CROSSING.md). ailine's core.
 *
 * generate -> extract -> signature check -> safe copy -> apply -> snapshot
 * diff -> branch on one of three failure modes -> retry, up to `repair`
 * times (default 2, i.e. 3 attempts).
 *
 * ★ Why a no-op is treated as a FAILURE at all — this is the reason ailine
 * exists (nodes/repair-loop.md ②). In the 2026-08-10 demo a bold-text task
 * ran cleanly twice and changed nothing; the guard caught both and refused to
 * report success. 走った ≠ できた. An exit code of 0 from LibreOffice says
 * the macro ran, never that it did anything.
 *
 * ★ And the honest limit of that, recorded in the same node: the no-op repair
 * message is a "try harder" nudge, not a cure. That bold task failed all the
 * way through the loop. The real fix came later and elsewhere — native
 * CharWeightAsian inside a verified helper (ASSETS.md A6). A repair loop
 * relays failure back to the model; it cannot supply knowledge the model does
 * not have.
 *
 * Notes on the port:
 *  - `before` is taken once, ahead of the loop. Each attempt re-copies the
 *    untouched original, so a per-attempt snapshot would be identical by
 *    construction — same semantics, one less full read per attempt.
 *  - The copy happens inside the loop, immediately before apply, exactly as
 *    the original placed it: a failed attempt then cannot leave a mark on the
 *    original, and the loop's own shape is what guarantees that
 *    (nodes/repair-loop.md ②).
 *  - Failure modes are exclusive per attempt — the first one hit is the one
 *    reported (nodes/repair-loop.md ③).
 *  - Connection failure to ollama is NOT caught here. It throws
 *    AilineFatalError straight past this loop (nodes/ollama-generate.md ③).
 */
export async function repairLoop(a: RunArgs): Promise<{ code: number; result: RunResult }> {
  const { messages, helperFiles } = await assemblePrompt(a.book, a.task, a.refs, a.helpers);
  const history: ChatMessage[] = [...messages];

  const before = await snapshot(a.book);
  const outBook = outPath(a.book);
  const workdir = fs.mkdtempSync(path.join(os.tmpdir(), "ailine-"));

  const result: RunResult = {
    ok: false,
    attempts: 0,
    task: a.task,
    model: a.model,
    changes: [],
    out: null,
    dry: a.dry,
  };

  for (let attempt = 0; attempt <= a.repair; attempt++) {
    result.attempts = attempt + 1;
    console.log(`\n=== 試行 ${attempt + 1}/${a.repair + 1} — ${a.model} に生成させる ===`);

    const raw = await ollamaGenerate(a.model, history, a.temperature);
    const code = extractBas(raw);
    // The generated code is printed every attempt, pass or fail — the review
    // path is a design pillar, not debug output (nodes/repair-loop.md ①).
    console.log("--- 生成コード ---");
    console.log(code);
    console.log("------------------");

    if (!validSignature(code)) {
      console.log("★ 署名が違う。作り直させる。");
      history.push({ role: "assistant", content: raw }, { role: "user", content: REPAIR_BAD_SIGNATURE });
      continue;
    }

    // --dry branches AFTER the signature check and BEFORE apply: a dry run
    // still runs the signature repair cycle, so what it shows is the first
    // output that would actually have been applied
    // (nodes/repair-loop.md ③).
    if (a.dry) {
      console.log("--dry: 適用しない。");
      result.ok = true;
      return { code: 0, result };
    }

    fs.copyFileSync(a.book, outBook);
    const applied = await basrunApply(outBook, code, workdir, helperFiles, process.env, a.applyTimeoutMs);
    if (!applied.ok) {
      const err = applied.error ?? "(詳細不明)";
      console.log(`★ 実行時エラー:\n${err}`);
      // The raw error text goes back to the model verbatim — showing it the
      // actual reason is what keeps it from repeating the same mistake
      // (nodes/repair-loop.md ②).
      history.push({ role: "assistant", content: raw }, { role: "user", content: repairRuntimeError(err) });
      continue;
    }

    const after = await snapshot(outBook);
    const diff = diffSnapshots(before, after);
    if (!diff.changed) {
      console.log("★ no-op: 実行は通ったが文書は変わっていない。作り直させる。");
      history.push({ role: "assistant", content: raw }, { role: "user", content: REPAIR_NOOP });
      continue;
    }

    console.log("--- 変更点 ---");
    for (const line of diff.lines) {
      console.log(line);
    }
    console.log("--------------");

    let finalPath = outBook;
    if (a.inplace) {
      fs.rmSync(a.book, { force: true });
      fs.renameSync(outBook, a.book);
      finalPath = a.book;
      console.log(`原本を更新: ${finalPath}`);
    } else {
      console.log(`書き出し: ${finalPath}（原本は無傷）`);
    }

    result.ok = true;
    result.changes = diff.lines;
    result.out = finalPath;
    return { code: 0, result };
  }

  // for-else in the original: every attempt exhausted without reaching the
  // success path.
  console.log(`\n★ ${a.repair + 1} 回試みたが達成できなかった。`);
  return { code: 1, result };
}

/**
 * Safe-copy target: `sample.xlsx` -> `sample.out.xlsx`. The default is to
 * never touch the original; `--inplace` is the explicit opt-out
 * (nodes/cli-overview.md ②).
 */
export function outPath(book: string): string {
  const dir = path.dirname(book);
  const ext = path.extname(book);
  const stem = path.basename(book, ext);
  return path.join(dir, `${stem}.out${ext}`);
}
