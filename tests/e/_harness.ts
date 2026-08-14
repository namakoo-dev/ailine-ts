import ExcelJS from "exceljs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { basrunApply } from "../../src/basrunApply.js";
import { RunArgs, repairLoop } from "../../src/repairLoop.js";

export const PKG_ROOT = path.resolve(import.meta.dirname, "..", "..");
export const REFS = path.join(PKG_ROOT, "refs");
export const HELPERS = path.join(PKG_ROOT, "helpers");
/** An empty directory, for the ablation rows that run without refs/helpers. */
export const EMPTY_DIR = (() => {
  const d = path.join(os.tmpdir(), "ailine-e-empty");
  fs.mkdirSync(d, { recursive: true });
  return d;
})();

export const MODEL = process.env.AILINE_MODEL || "qwen2.5-coder:7b";

/** Is ollama up, and is the model pulled? Checked fresh, per run. */
export async function ollamaReady(model = MODEL): Promise<{ ok: boolean; detail: string }> {
  try {
    const res = await fetch("http://localhost:11434/api/tags", { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` };
    const data = (await res.json()) as { models?: { name?: string }[] };
    const names = (data.models ?? []).map((m) => m.name ?? "");
    if (!names.includes(model)) return { ok: false, detail: `${model} not pulled (have: ${names.join(", ")})` };
    return { ok: true, detail: `${names.length} models, ${model} present` };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}

const NOOP_MACRO = "Option VBASupport 1\nOption Explicit\n\nSub Run(oDoc As Object)\nEnd Sub\n";

/**
 * ★ Runs one empty macro through LibreOffice and keeps the result.
 *
 * Necessary, and worth stating plainly: LibreOffice materializes row heights
 * (and sometimes column widths) on its FIRST save of a book that was authored
 * elsewhere. Those are two of snapshot's nine axes, so the first apply against
 * a freshly authored book reports 変化あり even for a macro that does
 * literally nothing — measured directly in tests/noopProbe.mjs:
 *
 *   pass1-fresh-book:       changed=true   ["＊行高変更: Sheet"]
 *   pass2-already-LO-saved: changed=false  []
 *
 * This is inherited from the original, not introduced by the port: openpyxl's
 * row_dimensions is likewise empty until something writes an explicit height.
 * Normalizing the fixture through one LibreOffice round trip first is what
 * makes a no-op measurement mean anything.
 */
export async function normalizeThroughLibreOffice(src: string): Promise<string> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ailine-e-norm-"));
  const book = path.join(dir, path.basename(src));
  fs.copyFileSync(src, book);
  const r = await basrunApply(book, NOOP_MACRO, dir, []);
  if (!r.ok) {
    throw new Error(`normalization apply failed: ${r.error}`);
  }
  return book;
}

export interface Sample {
  ok: boolean;
  /** The pipeline said it changed the document AND the readback agrees. */
  success: boolean;
  attempts: number;
  note: string;
  seconds: number;
  /** Which of the three repair-loop failure modes fired, and how often. */
  modes: Record<string, number>;
}

/**
 * Which failure mode each attempt hit, recovered from the loop's own console
 * output. Worth the effort on the ablation rows: "0/6" says the weak layer
 * failed, but only the breakdown says whether it failed at the signature gate
 * (the model could not even produce the right shape) or as a no-op (it ran
 * and did nothing) — and those are completely different diagnoses.
 */
export function failureModes(logs: string[]): Record<string, number> {
  const modes: Record<string, number> = {};
  const bump = (k: string) => void (modes[k] = (modes[k] ?? 0) + 1);
  for (const line of logs) {
    if (line.includes("署名が違う。作り直させる")) bump("署名");
    // Checked before 実行時: a timeout surfaces THROUGH the runtime-error
    // branch, and the two want telling apart.
    else if (line.includes("終わらないので打ち切った")) bump("打切");
    else if (line.includes("実行時エラー:")) bump("実行時");
    else if (line.includes("no-op: 実行は通った")) bump("no-op");
  }
  return modes;
}

export function fmtModes(modes: Record<string, number>): string {
  const parts = Object.entries(modes).map(([k, v]) => `${k}${v}`);
  return parts.length ? parts.join("/") : "—";
}

export interface RowSpec {
  id: string;
  what: string;
  fixture: string;
  task: string;
  refs: string;
  helpers: string;
  /** Mechanical readback: did the document actually end up correct? */
  verify: (outBook: string, changed: boolean) => Promise<{ ok: boolean; note: string }>;
}

/** One full generate -> apply -> verify cycle against a private copy. */
export async function runSample(spec: RowSpec, normalizedFixture: string): Promise<Sample> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ailine-e-"));
  const book = path.join(dir, path.basename(normalizedFixture));
  fs.copyFileSync(normalizedFixture, book);

  const args: RunArgs = {
    book,
    task: spec.task,
    model: MODEL,
    refs: spec.refs,
    helpers: spec.helpers,
    repair: 2,
    temperature: 0.2,
    dry: false,
    inplace: false,
    json: false,
    // ★ Test-side only; the CLI never sets this. Twice while measuring, the
    // model produced Basic with a loop that never ends, LibreOffice executed
    // it faithfully, and the untimed apply hung the whole suite. 120s is far
    // above the slowest healthy apply observed (~25s).
    applyTimeoutMs: 120_000,
  };

  const started = Date.now();
  const logs: string[] = [];
  const realLog = console.log;
  console.log = (...a: unknown[]) => void logs.push(a.map(String).join(" "));
  let result;
  try {
    result = await repairLoop(args);
  } finally {
    console.log = realLog;
  }
  const seconds = (Date.now() - started) / 1000;
  const modes = failureModes(logs);

  if (!result.result.ok || !result.result.out) {
    return {
      ok: false,
      success: false,
      attempts: result.result.attempts,
      note: `全試行失敗 [${fmtModes(modes)}]`,
      seconds,
      modes,
    };
  }
  const verdict = await spec.verify(result.result.out, true);
  // A pipeline "success" whose readback disagrees is the interesting case:
  // the guard saw a change, but not the RIGHT change.
  const note = verdict.ok ? verdict.note : `適用は通ったが検証NG: ${verdict.note}`;
  return { ok: true, success: verdict.ok, attempts: result.result.attempts, note, seconds, modes };
}

/**
 * Force-kill any LibreOffice, by PID.
 *
 * Killing the timed-out apply's process tree does not reach soffice: basrun
 * launches it detached, so it keeps spinning on the runaway macro and
 * poisons every later sample. This clears it between rows.
 *
 * ★ By PID, never by image name. `taskkill /IM` has taken out unrelated
 * processes on this machine before.
 */
export function killLibreOffice(): number {
  if (process.platform !== "win32") return 0;
  const list = spawnSync("powershell", [
    "-NoProfile",
    "-Command",
    "(Get-Process -Name soffice,soffice.bin -ErrorAction SilentlyContinue).Id -join ','",
  ]);
  const pids = String(list.stdout ?? "")
    .trim()
    .split(",")
    .map((s) => Number.parseInt(s, 10))
    .filter((n) => Number.isInteger(n) && n > 0);
  for (const pid of pids) {
    spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
  }
  return pids.length;
}

/** LibreOffice keeps crash-recovery state that can block the next start. */
export function clearCrashState(): void {
  const profile = process.env.BASRUN_PROFILE || path.join(os.homedir(), ".nagi", "lo-profile");
  fs.rmSync(path.join(profile, "crash"), { recursive: true, force: true });
  fs.rmSync(path.join(profile, ".lock"), { force: true });
}

/** Wilson score interval — the right one for small n and rates near 0 or 1. */
export function wilson(k: number, n: number, z = 1.96): [number, number] {
  if (n === 0) return [0, 0];
  const p = k / n;
  const denom = 1 + (z * z) / n;
  const centre = p + (z * z) / (2 * n);
  const spread = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [Math.max(0, (centre - spread) / denom), Math.min(1, (centre + spread) / denom)];
}

export function pct(x: number): string {
  return `${(x * 100).toFixed(0)}%`;
}

// ─── readback verifiers (exceljs, independent of the pipeline's own diff) ───

export async function readSheet(book: string, sheetName?: string): Promise<ExcelJS.Worksheet> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(book);
  const ws = sheetName ? wb.getWorksheet(sheetName) : wb.worksheets[0];
  if (!ws) throw new Error(`sheet not found: ${sheetName ?? "(first)"}`);
  return ws;
}

export async function sheetNames(book: string): Promise<string[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(book);
  return wb.worksheets.map((w) => w.name);
}

/** Column values below the header row, as numbers. */
export function columnNumbers(ws: ExcelJS.Worksheet, col: number): number[] {
  const out: number[] = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const v = ws.getRow(r).getCell(col).value;
    if (typeof v === "number") out.push(v);
  }
  return out;
}
