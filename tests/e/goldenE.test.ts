import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { extractBas } from "../../src/extractBas.js";
import { ollamaGenerate } from "../../src/ollama.js";
import { assemblePrompt } from "../../src/promptAssembly.js";
import { cmdStop } from "../../src/stopCmd.js";
import {
  EMPTY_DIR,
  HELPERS,
  MODEL,
  PKG_ROOT,
  REFS,
  RowSpec,
  Sample,
  clearCrashState,
  columnNumbers,
  killLibreOffice,
  normalizeThroughLibreOffice,
  ollamaReady,
  fmtModes,
  pct,
  readSheet,
  runSample,
  sheetNames,
  wilson,
} from "./_harness.js";

/**
 * GOLDEN.md section E — the probabilistic layer.
 *
 * ★ These are MEASUREMENTS, not pass/fail gates. GOLDEN.md is explicit that
 * the historical figures are one model on one day and that strict
 * reproducibility is not claimed — same prompt, different output is expected
 * at temperature 0.2, not a bug. So each row reports a rate and a Wilson 95%
 * interval; the only thing asserted is that the row can succeed at all, which
 * is a genuine regression gate without pretending determinism.
 *
 * Every row that drives LibreOffice goes through basrun-ts, which uses its
 * own dedicated profile (~/.nagi/lo-profile) and never the user's real one.
 * BASRUN_PROFILE is deliberately left alone.
 */

const N = 5;
const DEMO = (n: string) => path.join(PKG_ROOT, "demo", n);

interface RowResult {
  id: string;
  what: string;
  n: number;
  successes: number;
  historical: string;
  samples: Sample[];
  skipped?: string;
}

const results: RowResult[] = [];
let ready = { ok: false, detail: "not checked" };

/** Fixtures pre-baked through one LibreOffice save — see _harness.ts. */
const normalized: Record<string, string> = {};

beforeAll(async () => {
  ready = await ollamaReady();
  console.log(`\nollama: ${ready.ok ? "OK" : "UNAVAILABLE"} — ${ready.detail}`);
  if (!ready.ok) return;
  for (const name of ["sample.xlsx", "sales.xlsx"]) {
    normalized[name] = await normalizeThroughLibreOffice(DEMO(name));
  }
  console.log("fixtures normalized through LibreOffice\n");
});

async function measure(spec: RowSpec, historical: string, n = N): Promise<void> {
  if (!ready.ok) {
    results.push({ id: spec.id, what: spec.what, n: 0, successes: 0, historical, samples: [], skipped: "ollama unreachable" });
    return;
  }
  const fixture = normalized[path.basename(spec.fixture)] ?? spec.fixture;
  const samples: Sample[] = [];
  for (let i = 0; i < n; i++) {
    const s = await runSample(spec, fixture);
    samples.push(s);
    console.log(`  ${spec.id} #${i + 1}: ${s.success ? "OK " : "NG "} attempts=${s.attempts} ${s.seconds.toFixed(0)}s — ${s.note}`);
    recoverIfWedged(s);
  }
  const successes = samples.filter((s) => s.success).length;
  results.push({ id: spec.id, what: spec.what, n, successes, historical, samples });
}

/**
 * A timed-out apply leaves LibreOffice still executing the runaway macro.
 * Killing the subprocess tree does not reach it — basrun launches it
 * detached — and left alone it poisons every later sample, so clear it and
 * let the next apply bring up a fresh instance.
 */
function recoverIfWedged(s: Sample): void {
  if (!s.modes["打切"]) return;
  const killed = killLibreOffice();
  clearCrashState();
  console.log(`    -> 打ち切り検出: LibreOffice ${killed} 件を PID 指定で落とし、crash 状態を消した`);
}

// ───────────────────────── verifiers ─────────────────────────

/** 金額 (column 2) descending, with no rows lost. */
async function verifySortDesc(book: string): Promise<{ ok: boolean; note: string }> {
  const ws = await readSheet(book);
  const vals = columnNumbers(ws, 2);
  if (vals.length < 5) return { ok: false, note: `金額列に数値が ${vals.length} 件しかない` };
  const desc = vals.every((v, i) => i === 0 || (vals[i - 1] as number) >= v);
  return { ok: desc, note: desc ? `降順 ${vals.join(">")}` : `順序が違う ${vals.join(",")}` };
}

/** A new sheet beyond the original single sheet. */
async function verifyNewSheet(book: string): Promise<{ ok: boolean; note: string }> {
  const names = await sheetNames(book);
  return { ok: names.length >= 2, note: `シート ${JSON.stringify(names)}` };
}

/** A chart part inside the .xlsx zip. */
async function verifyChart(book: string): Promise<{ ok: boolean; note: string }> {
  const { chartsCount } = await import("../../src/zipEntries.js");
  const c = chartsCount(book);
  return { ok: c >= 1, note: `グラフ ${c} 個` };
}

/** Header row bold — the axis the openpyxl readback checked historically. */
async function verifyHeaderBold(book: string): Promise<{ ok: boolean; note: string }> {
  const ws = await readSheet(book);
  const row = ws.getRow(1);
  const flags: boolean[] = [];
  for (let c = 1; c <= ws.columnCount; c++) {
    flags.push(row.getCell(c).font?.bold === true);
  }
  const all = flags.length > 0 && flags.every(Boolean);
  return { ok: all, note: `見出し太字 ${flags.map((f) => (f ? "1" : "0")).join("")}` };
}

/** Department totals present on some sheet, with the right sums. */
async function verifyPivot(book: string): Promise<{ ok: boolean; note: string }> {
  const expected: Record<string, number> = { 営業: 218000, 開発: 550000, 総務: 112000 };
  const names = await sheetNames(book);
  for (const name of names.slice(1)) {
    const ws = await readSheet(book, name);
    const found: Record<string, number> = {};
    for (let r = 1; r <= ws.rowCount; r++) {
      for (let c = 1; c <= ws.columnCount; c++) {
        const label = ws.getRow(r).getCell(c).value;
        if (typeof label === "string" && label in expected) {
          for (let c2 = c + 1; c2 <= ws.columnCount; c2++) {
            const v = ws.getRow(r).getCell(c2).value;
            if (typeof v === "number") {
              found[label] = v;
              break;
            }
          }
        }
      }
    }
    const hit = Object.entries(expected).every(([k, v]) => found[k] === v);
    if (hit) return { ok: true, note: `${name}: ${JSON.stringify(found)}` };
  }
  return { ok: false, note: `集計シート無し/合計不一致 (シート ${JSON.stringify(names)})` };
}

/** All four borders on the used range, plus at least one column width set. */
async function verifyBordersAndWidth(book: string): Promise<{ ok: boolean; note: string }> {
  const ws = await readSheet(book);
  let bordered = 0;
  let total = 0;
  for (let r = 1; r <= ws.rowCount; r++) {
    for (let c = 1; c <= ws.columnCount; c++) {
      total++;
      const b = ws.getRow(r).getCell(c).border;
      if (b?.left?.style && b?.right?.style && b?.top?.style && b?.bottom?.style) bordered++;
    }
  }
  const widths: number[] = [];
  for (let c = 1; c <= ws.columnCount; c++) {
    const w = ws.getColumn(c).width;
    if (typeof w === "number") widths.push(w);
  }
  const ok = bordered === total && total > 0 && widths.length > 0;
  return { ok, note: `罫線 ${bordered}/${total}セル, 列幅 ${widths.length}列` };
}

// ───────────────────────── the rows ─────────────────────────

const SORT_TASK = "金額の列で降順に並べ替えて";
const SHEET_TASK = "「集計」という名前のシートを新しく作って、A1 に「合計」と書いて";
const CHART_TASK = "金額の棒グラフを1つ入れて";

const WEAK_TASKS: { task: string; verify: RowSpec["verify"]; label: string }[] = [
  { task: SHEET_TASK, verify: verifyNewSheet, label: "新シート" },
  { task: SORT_TASK, verify: verifySortDesc, label: "ソート" },
  { task: CHART_TASK, verify: verifyChart, label: "グラフ" },
];

/** E1/E2 are historically a rate over the three weak task types, not one task. */
async function measureWeakLayer(id: string, what: string, refs: string, helpers: string, historical: string, reps: number) {
  if (!ready.ok) {
    results.push({ id, what, n: 0, successes: 0, historical, samples: [], skipped: "ollama unreachable" });
    return;
  }
  const samples: Sample[] = [];
  for (let rep = 0; rep < reps; rep++) {
    for (const t of WEAK_TASKS) {
      const spec: RowSpec = { id: `${id}/${t.label}`, what, fixture: DEMO("sample.xlsx"), task: t.task, refs, helpers, verify: t.verify };
      const s = await runSample(spec, normalized["sample.xlsx"] as string);
      samples.push(s);
      console.log(`  ${id} ${t.label} #${rep + 1}: ${s.success ? "OK " : "NG "} attempts=${s.attempts} ${s.seconds.toFixed(0)}s — ${s.note}`);
      recoverIfWedged(s);
    }
  }
  results.push({ id, what, n: samples.length, successes: samples.filter((s) => s.success).length, historical, samples });
}

describe("GOLDEN E — probabilistic layer (real ollama + real LibreOffice)", () => {
  it("E1: no few-shot, no helpers — the weak layer", async () => {
    await measureWeakLayer("E1", "few-shot 無し・ヘルパ無し／苦手層3種", EMPTY_DIR, EMPTY_DIR, "0% (0/3)", 2);
    expect(results.at(-1)?.n).toBeGreaterThan(0);
  });

  it("E2: few-shot only, still no helpers", async () => {
    await measureWeakLayer("E2", "few-shot 有り・ヘルパ無し／苦手層3種", REFS, EMPTY_DIR, "67% (2/3)", 2);
    expect(results.at(-1)?.n).toBeGreaterThan(0);
  });

  it("E3: sort without helpers — does the model slip on ContainsHeader?", async () => {
    // Generation only: this row inspects the CODE, so it needs no LibreOffice
    // at all. The historical observation is that roughly half the attempts
    // wrote ContainsHeader=True (wrong; it must be False).
    if (!ready.ok) {
      results.push({ id: "E3", what: "ソート生成の ContainsHeader 誤り率", n: 0, successes: 0, historical: "約半分が True に滑る", samples: [], skipped: "ollama unreachable" });
      return;
    }
    // ★ Three outcomes, not two. The historical observation was that the
    // model picked the right sorting API and then flipped one boolean. "Did
    // not write ContainsHeader at all" is a THIRD outcome — the model took a
    // different route entirely — and folding it in with the slip would make
    // the number look like a regression against the B棚 figure when it is
    // actually measuring something else.
    const samples: Sample[] = [];
    const buckets: Record<string, number> = { "False(正)": 0, "True(誤)": 0, "sortAPI/未指定": 0, "sortAPI不使用": 0 };
    for (let i = 0; i < N; i++) {
      const started = Date.now();
      const { messages } = await assemblePrompt(normalized["sample.xlsx"] as string, SORT_TASK, REFS, EMPTY_DIR);
      const code = extractBas(await ollamaGenerate(MODEL, messages, 0.2));
      const m = /ContainsHeader\s*=\s*(True|False)/i.exec(code);
      const usesSortApi = /SortField|SortDescriptor|createSortDescriptor|\.sort\s*\(/i.test(code);
      let bucket: string;
      if (m) bucket = m[1]?.toLowerCase() === "false" ? "False(正)" : "True(誤)";
      else bucket = usesSortApi ? "sortAPI/未指定" : "sortAPI不使用";
      buckets[bucket] = (buckets[bucket] ?? 0) + 1;
      const correct = bucket === "False(正)";
      samples.push({ ok: true, success: correct, attempts: 1, note: bucket, seconds: (Date.now() - started) / 1000, modes: {} });
      console.log(`  E3 #${i + 1}: ${correct ? "OK " : "NG "} — ${bucket}`);
    }
    console.log(`  E3 内訳: ${JSON.stringify(buckets)}`);
    results.push({
      id: "E3",
      what: "ソート生成の ContainsHeader 正答率（ヘルパ無し）",
      n: N,
      successes: samples.filter((s) => s.success).length,
      historical: "約半分が True に滑る",
      samples,
    });
    expect(samples).toHaveLength(N);
  });

  it("E4: sort WITH the helper — the design that fixed E3", async () => {
    await measure(
      { id: "E4", what: "ソート（ヘルパ方式）", fixture: DEMO("sample.xlsx"), task: SORT_TASK, refs: REFS, helpers: HELPERS, verify: verifySortDesc },
      "完全降順を確認",
    );
    expect(results.at(-1)?.successes).toBeGreaterThan(0);
  });

  it("E6: native bold via StyleBold/SummaryTable", async () => {
    await measure(
      {
        id: "E6",
        what: "太字（native 対応後）",
        fixture: DEMO("sample.xlsx"),
        task: "見出し行（行0）を太字にして",
        refs: REFS,
        helpers: HELPERS,
        verify: verifyHeaderBold,
      },
      "native 太字が成立",
    );
    expect(results.at(-1)?.successes).toBeGreaterThan(0);
  });

  it("E7: pivot via PivotSum/SummaryTable — the most arcane UNO corner", async () => {
    await measure(
      {
        id: "E7",
        what: "ピボット集計（ヘルパ方式）",
        fixture: DEMO("sales.xlsx"),
        task: "部門ごとに金額を合計した集計表を作って",
        refs: REFS,
        helpers: HELPERS,
        verify: verifyPivot,
      },
      "一発で成立",
    );
    expect(results.at(-1)?.successes).toBeGreaterThan(0);
  });

  it("E9: the 9-axis no-op guard on a border + column-width change", async () => {
    await measure(
      {
        id: "E9",
        what: "罫線・列幅（snapshot 修正後）",
        fixture: DEMO("sample.xlsx"),
        task: "表全体に格子の罫線を引いて、列幅を内容に合わせて",
        refs: REFS,
        helpers: HELPERS,
        verify: verifyBordersAndWidth,
      },
      "罫線・列幅とも changed=True",
    );
    expect(results.at(-1)?.successes).toBeGreaterThan(0);
  });
});

afterAll(async () => {
  const rows = results.map((r) => {
    if (r.skipped) return `| ${r.id} | 未実行 | — | — | ${r.historical} | — | — | ${r.skipped} |`;
    const [lo, hi] = wilson(r.successes, r.n);
    const secs = r.samples.reduce((a, s) => a + s.seconds, 0);
    const modes: Record<string, number> = {};
    for (const s of r.samples) {
      for (const [k, v] of Object.entries(s.modes)) modes[k] = (modes[k] ?? 0) + v;
    }
    return `| ${r.id} | ${r.n} | ${r.successes} | ${pct(r.successes / r.n)} [${pct(lo)}, ${pct(hi)}] | ${r.historical} | ${fmtModes(modes)} | ${secs.toFixed(0)}s | ${r.what} |`;
  });
  console.log(
    "\n\n=== GOLDEN E 実測 ===\n" +
      `model=${MODEL}  temperature=0.2  repair=2\n` +
      "修復モード列は全試行の内訳（署名エラー/実行時エラー/no-op の発生回数）\n\n" +
      "| # | n | 成功 | 実測 (Wilson 95%CI) | B棚の実測 | 修復モード | 所要 | 内容 |\n" +
      "|---|---|---|---|---|---|---|---|\n" +
      rows.join("\n") +
      "\n",
  );
  // Per-sample detail, so a rate can always be traced back to what happened.
  console.log("=== サンプル詳細 ===");
  for (const r of results) {
    for (const [i, s] of r.samples.entries()) {
      console.log(`${r.id} #${i + 1}: ${s.success ? "OK" : "NG"} attempts=${s.attempts} ${s.seconds.toFixed(0)}s — ${s.note}`);
    }
  }
  // Always hand LibreOffice back, even if a row threw.
  await cmdStop();
});
