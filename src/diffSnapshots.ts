import { CellState, Snapshot } from "./snapshot.js";

export interface DiffResult {
  /** The no-op guard's verdict. */
  changed: boolean;
  /** Human-readable diff, printed every run — the review path. */
  lines: string[];
}

/** Per-sheet cell lines are capped, then collapsed to a count. */
const MAX_CELL_LINES = 12;

/**
 * diff-snapshots (あ, CROSSING.md).
 *
 * Pure comparison over snapshot's output — it never touches a spreadsheet
 * library, which is why CROSSING.md leaves it in (あ) even though snapshot
 * itself is (い): change how the state is READ and this stays intact, as long
 * as the shape holds.
 *
 * ★ Plain OR across every axis (nodes/diff-snapshots.md ②). No weighting: a
 * one-cell tweak and a rebuilt chart are equally "changed", because the
 * question this answers is "did anything happen at all", not "how much". The
 * OR is the direct lesson of the border-only miss recorded in
 * nodes/snapshot.md ② — any axis is enough on its own.
 *
 * The 12-line cap exists for the review path, not for correctness: a
 * whole-sheet reformat would otherwise bury the console in diff lines and
 * make the output harder to review, not easier
 * (nodes/diff-snapshots.md ②).
 *
 * `changed === false` guarantees `lines === []`, so repair-loop can print the
 * diff unconditionally (nodes/diff-snapshots.md ②).
 */
export function diffSnapshots(before: Snapshot, after: Snapshot): DiffResult {
  const lines: string[] = [];

  const added = after.sheets.filter((s) => !before.sheets.includes(s));
  const removed = before.sheets.filter((s) => !after.sheets.includes(s));
  for (const s of added) {
    lines.push(`＊シート追加: ${s}`);
  }
  for (const s of removed) {
    lines.push(`＊シート削除: ${s}`);
  }

  const chartsChanged = before.charts !== after.charts;
  if (chartsChanged) {
    lines.push(`＊グラフ数: ${before.charts} -> ${after.charts}`);
  }

  // Sheets present on either side; a sheet that only exists after still gets
  // its merges/dimensions compared against an empty baseline.
  const sheetNames = [...new Set([...before.sheets, ...after.sheets])];

  let mergeChanges = 0;
  for (const name of sheetNames) {
    const b = new Set(before.merges[name] ?? []);
    const a = new Set(after.merges[name] ?? []);
    // Added and removed are listed separately and are exempt from the cell
    // cap — merges change far less often than cells
    // (nodes/diff-snapshots.md ③).
    for (const rng of [...a].filter((x) => !b.has(x)).sort()) {
      lines.push(`＊結合追加: ${name}!${rng}`);
      mergeChanges++;
    }
    for (const rng of [...b].filter((x) => !a.has(x)).sort()) {
      lines.push(`＊結合解除: ${name}!${rng}`);
      mergeChanges++;
    }
  }

  let dimChanges = 0;
  for (const name of sheetNames) {
    // Sheet-level granularity only: which column went from what to what is
    // not reported, because in practice the interesting question about a
    // width is whether it moved (nodes/diff-snapshots.md ③).
    if (!sameNumberMap(before.colw[name], after.colw[name])) {
      lines.push(`＊列幅変更: ${name}`);
      dimChanges++;
    }
    if (!sameNumberMap(before.rowh[name], after.rowh[name])) {
      lines.push(`＊行高変更: ${name}`);
      dimChanges++;
    }
  }

  const cellKeys = [...new Set([...Object.keys(before.cells), ...Object.keys(after.cells)])].sort();
  let cellChanges = 0;
  let shown = 0;
  for (const key of cellKeys) {
    const b = before.cells[key];
    const a = after.cells[key];
    if (sameCell(b, a)) {
      continue;
    }
    cellChanges++;
    if (shown < MAX_CELL_LINES) {
      lines.push(`＊${key}: ${fmtCell(b)} -> ${fmtCell(a)}`);
      shown++;
    }
  }
  if (cellChanges > shown) {
    lines.push(`…ほか ${cellChanges - shown} セル`);
  }

  const changed =
    added.length > 0 || removed.length > 0 || chartsChanged || mergeChanges > 0 || dimChanges > 0 || cellChanges > 0;
  return { changed, lines };
}

function sameNumberMap(b: Record<string, number> | undefined, a: Record<string, number> | undefined): boolean {
  const bb = b ?? {};
  const aa = a ?? {};
  const keys = new Set([...Object.keys(bb), ...Object.keys(aa)]);
  for (const k of keys) {
    if (bb[k] !== aa[k]) {
      return false;
    }
  }
  return true;
}

function sameCell(b: CellState | undefined, a: CellState | undefined): boolean {
  if (b === undefined || a === undefined) {
    return b === a;
  }
  return (
    b.value === a.value &&
    b.numFmt === a.numFmt &&
    b.fill === a.fill &&
    b.bold === a.bold &&
    b.border === a.border &&
    b.align === a.align
  );
}

/** Renders only the axes that carry something, so the value stays readable. */
function fmtCell(s: CellState | undefined): string {
  if (s === undefined) {
    return "(なし)";
  }
  const parts = [`値=${s.value === null ? "" : String(s.value)}`];
  if (s.numFmt !== "General") {
    parts.push(`書式=${s.numFmt}`);
  }
  if (s.fill !== null) {
    parts.push(`色=${s.fill}`);
  }
  if (s.bold) {
    parts.push("太字");
  }
  if (s.border !== null) {
    parts.push(`罫線=${s.border}`);
  }
  if (s.align !== null) {
    parts.push(`配置=${s.align}`);
  }
  return parts.join(" ");
}
