import ExcelJS from "exceljs";
import { cellText } from "./describeBook.js";
import { MAX_COLS, MAX_ROWS } from "./limits.js";
import { chartsCount } from "./zipEntries.js";

/**
 * Per-cell state. The order is the original's tuple order
 * (nodes/snapshot.md ①): value, number format, fill, bold, border, alignment.
 */
export interface CellState {
  value: string | number | boolean | null;
  numFmt: string;
  fill: string | null;
  bold: boolean;
  border: string | null;
  align: string | null;
}

export interface Snapshot {
  sheets: string[];
  charts: number;
  /** key: `${sheet}!${row},${col}` — 1-origin, matching the original's keys. */
  cells: Record<string, CellState>;
  merges: Record<string, string[]>;
  colw: Record<string, Record<string, number>>;
  rowh: Record<string, Record<string, number>>;
}

/**
 * snapshot (い — 構造は渡るが再設計要, CROSSING.md). The no-op guard's eye.
 *
 * ★★ The nine axes below are a REQUIREMENT, not a design choice. From
 * nodes/snapshot.md ② (session 705c3265, 2026-08-10 06:07): during a live
 * demo, a border + column-width task ran correctly — the model called the
 * right helper, the helper worked, LibreOffice really had changed — and the
 * no-op guard reported "変化なし" anyway, because snapshot only recorded
 * value / numfmt / fill / bold at the time. A false negative in the verifier,
 * not a defect in the generator. CROSSING.md is explicit that dropping even
 * one axis reopens that hole:
 *
 *   1 value          2 number format   3 fill
 *   4 bold           5 border          6 merges
 *   7 column width   8 row height      9 horizontal alignment
 *   (+ sheet names and chart count, workbook-level)
 *
 * What CROSSING.md says IS free to redesign is how each axis is read, because
 * exceljs's "unset" representations differ from openpyxl's. Probed against
 * both exceljs-authored and LibreOffice-authored files, they are:
 *
 *   numFmt      undefined when untouched; "General" once LibreOffice saves
 *               -> normalize undefined to "General" so the two agree
 *   fill        undefined when untouched; {pattern:"none"} once styled
 *               -> both normalize to null
 *   border      undefined when untouched; {} once styled
 *               -> null unless a side actually carries a style
 *   alignment   undefined when untouched; LibreOffice writes
 *               {horizontal:"general", ...} on every saved cell
 *               -> "general" normalizes to null, exactly the rule the
 *                  original applied to openpyxl
 *   font.bold   absent unless set
 *
 * Without those four normalizations, the first LibreOffice save of a file
 * would light up every cell as "changed" and the guard would be worthless.
 *
 * The consequence the original also carried (nodes/snapshot.md ③): an
 * explicitly-set default and a never-touched cell are indistinguishable.
 * Harmless for no-op detection, wrong for verifying round-trip idempotence.
 */
export async function snapshot(bookPath: string): Promise<Snapshot> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(bookPath);

  const snap: Snapshot = {
    sheets: wb.worksheets.map((w) => w.name),
    charts: chartsCount(bookPath),
    cells: {},
    merges: {},
    colw: {},
    rowh: {},
  };

  for (const ws of wb.worksheets) {
    const nrow = Math.min(ws.rowCount || 0, MAX_ROWS);
    const ncol = Math.min(ws.columnCount || 0, MAX_COLS);

    for (let r = 1; r <= nrow; r++) {
      const row = ws.getRow(r);
      for (let c = 1; c <= ncol; c++) {
        const cell = row.getCell(c);
        const state: CellState = {
          value: normalizeValue(cell.value),
          numFmt: cell.numFmt ?? "General",
          fill: normalizeFill(cell.fill),
          bold: cell.font?.bold === true,
          border: normalizeBorder(cell.border),
          align: normalizeAlign(cell.alignment),
        };
        // Thin out fully-default cells to keep the map small. ★ This
        // condition IS the axis list restated — a new axis that is not
        // mentioned here can never make a cell survive the filter, so
        // adding an axis means editing this line too
        // (nodes/snapshot.md ③).
        if (
          (state.value === null || state.value === "") &&
          state.fill === null &&
          !state.bold &&
          state.numFmt === "General" &&
          state.border === null &&
          state.align === null
        ) {
          continue;
        }
        snap.cells[`${ws.name}!${r},${c}`] = state;
      }
    }

    snap.merges[ws.name] = [...mergeRanges(ws)].sort();

    // Widths are scanned across the full MAX_COLS window rather than the
    // data extent: a width can be set on a column that holds no data, and
    // 64 getColumn() reads are free.
    const widths: Record<string, number> = {};
    for (let c = 1; c <= MAX_COLS; c++) {
      const col = ws.getColumn(c);
      if (typeof col.width === "number") {
        widths[col.letter] = round2(col.width);
      }
    }
    snap.colw[ws.name] = widths;

    const heights: Record<string, number> = {};
    for (let r = 1; r <= nrow; r++) {
      const h = ws.getRow(r).height;
      if (typeof h === "number") {
        heights[String(r)] = round2(h);
      }
    }
    snap.rowh[ws.name] = heights;
  }

  return snap;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function normalizeValue(v: ExcelJS.CellValue): string | number | boolean | null {
  if (v === null || v === undefined) {
    return null;
  }
  if (typeof v === "number" || typeof v === "boolean") {
    return v;
  }
  if (typeof v === "string") {
    return v;
  }
  // Dates, formulas, rich text, hyperlinks, errors -> their visible text.
  const text = cellText(v);
  return text === "" ? null : text;
}

function normalizeFill(fill: ExcelJS.Fill | undefined): string | null {
  if (!fill) {
    return null;
  }
  if (fill.type === "pattern") {
    if (!fill.pattern || fill.pattern === "none") {
      return null;
    }
    return `${fill.pattern}:${colorKey(fill.fgColor)}/${colorKey(fill.bgColor)}`;
  }
  if (fill.type === "gradient") {
    const g = fill as { degree?: number; stops?: { position: number; color: unknown }[] };
    return `gradient:${g.degree ?? ""}:${(g.stops ?? []).map((s) => `${s.position}${colorKey(s.color)}`).join(",")}`;
  }
  return null;
}

/**
 * exceljs types Color as a union (argb | theme+tint | indexed), and the
 * variants are not all reachable through a single typed accessor. Reading
 * defensively also covers colors LibreOffice writes in forms the typings do
 * not describe.
 */
function colorKey(color: unknown): string {
  if (!color || typeof color !== "object") {
    return "";
  }
  const c = color as { argb?: string; theme?: number; tint?: number; indexed?: number };
  if (typeof c.argb === "string") {
    return c.argb;
  }
  if (typeof c.theme === "number") {
    return `theme${c.theme}${typeof c.tint === "number" ? `+${c.tint}` : ""}`;
  }
  if (typeof c.indexed === "number") {
    return `idx${c.indexed}`;
  }
  return "";
}

/**
 * The original's 4-tuple (left, right, top, bottom) styles, flattened to a
 * string. All-unset collapses to null so it compares equal across the
 * "untouched (undefined)" and "styled but borderless ({})" representations.
 */
function normalizeBorder(border: Partial<ExcelJS.Borders> | undefined): string | null {
  if (!border) {
    return null;
  }
  const sides = (["left", "right", "top", "bottom"] as const).map((k) => {
    const side = border[k];
    if (!side || !side.style) {
      return "";
    }
    return `${side.style}${side.color ? `#${colorKey(side.color)}` : ""}`;
  });
  return sides.every((s) => s === "") ? null : sides.join("|");
}

/**
 * "general" is the absence of an alignment, not an alignment — the same
 * normalization the original applied to openpyxl. exceljs's typings do not
 * list "general" among the horizontal values, but LibreOffice writes it on
 * every cell it saves, so the comparison is made on the runtime string.
 */
function normalizeAlign(alignment: Partial<ExcelJS.Alignment> | undefined): string | null {
  const h: string | undefined = alignment?.horizontal;
  if (!h || h === "general") {
    return null;
  }
  return h;
}

/** exceljs exposes merges through the serialized model; fall back defensively. */
function mergeRanges(ws: ExcelJS.Worksheet): string[] {
  try {
    const merges = (ws.model as { merges?: unknown }).merges;
    if (Array.isArray(merges)) {
      return merges.map((m) => String(m));
    }
  } catch {
    /* fall through */
  }
  return [];
}
