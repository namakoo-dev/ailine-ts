import path from "node:path";
import { describe, expect, it } from "vitest";
import { diffSnapshots } from "../../src/diffSnapshots.js";
import { CellState, Snapshot, snapshot } from "../../src/snapshot.js";
import { Mutate, makeBook, tmpDir } from "./_book.js";

/**
 * Axis ablation — proving the nine axes are load-bearing, not decorative.
 *
 * CROSSING.md states the requirement plainly: "9要素のうちどれか1つでも欠け
 * ると、その軸だけの変更が no-op ガードで検出されない". GOLDEN.md C proves
 * that the current implementation DOES detect each axis. It cannot prove the
 * converse — that removing an axis breaks detection — because a test suite
 * only sees the code that exists.
 *
 * So: take a real snapshot, delete one axis from it, and re-run the same
 * diff. If the verdict flips to "unchanged", that axis was the only thing
 * standing between the guard and a false negative.
 *
 * This also reproduces GOLDEN.md E8/E9 deterministically and offline. E8 is
 * the 2026-08-10 incident: a border + column-width change applied correctly
 * and reported as 「変化なし」 by a snapshot that recorded only value /
 * numfmt / fill / bold. E9 is the same scenario after the fix. Both were
 * recorded as one-off manual demo observations; here they are a test.
 */

type Axis = "value" | "numFmt" | "fill" | "bold" | "border" | "align" | "merges" | "colw" | "rowh" | "charts";

/** The pre-fix snapshot: the four axes it recorded before 2026-08-10 06:08. */
const PRE_FIX_MISSING: Axis[] = ["border", "align", "merges", "colw", "rowh"];

/**
 * Returns a snapshot with the named axes neutralized, as if the
 * implementation had never captured them.
 *
 * Cells are re-thinned afterwards: the real snapshot drops fully-default
 * cells, so a cell that only survived BECAUSE of the dropped axis must
 * disappear too — otherwise it would show up as an added key and leak the
 * change back in through the wrong door.
 */
function degrade(s: Snapshot, drop: Axis[]): Snapshot {
  const has = (a: Axis) => drop.includes(a);
  const cells: Record<string, CellState> = {};
  for (const [key, c] of Object.entries(s.cells)) {
    const d: CellState = {
      value: has("value") ? null : c.value,
      numFmt: has("numFmt") ? "General" : c.numFmt,
      fill: has("fill") ? null : c.fill,
      bold: has("bold") ? false : c.bold,
      border: has("border") ? null : c.border,
      align: has("align") ? null : c.align,
    };
    const isDefault =
      (d.value === null || d.value === "") &&
      d.numFmt === "General" &&
      d.fill === null &&
      !d.bold &&
      d.border === null &&
      d.align === null;
    if (!isDefault) {
      cells[key] = d;
    }
  }
  const blank = <T>(src: Record<string, T>, empty: T): Record<string, T> =>
    Object.fromEntries(Object.keys(src).map((k) => [k, empty]));
  return {
    sheets: s.sheets,
    charts: has("charts") ? 0 : s.charts,
    cells,
    merges: has("merges") ? blank(s.merges, [] as string[]) : s.merges,
    colw: has("colw") ? blank(s.colw, {} as Record<string, number>) : s.colw,
    rowh: has("rowh") ? blank(s.rowh, {} as Record<string, number>) : s.rowh,
  };
}

async function pair(mutate: Mutate, rows?: (string | number)[][]) {
  const dir = tmpDir();
  const before = await snapshot(await makeBook(path.join(dir, "before.xlsx"), undefined, rows));
  const after = await snapshot(await makeBook(path.join(dir, "after.xlsx"), mutate, rows));
  return { before, after };
}

/** Row 3 holds only a label, so B3/C3 can be merged without losing a value. */
const ROWS_WITH_BLANKS: (string | number)[][] = [
  ["商品", "金額", "在庫"],
  ["りんご", 1200, 8],
  ["合計"],
];

const CASES: { axis: Axis; label: string; mutate: Mutate; rows?: (string | number)[][] }[] = [
  { axis: "value", label: "セル値", mutate: (ws) => void (ws.getRow(2).getCell(1).value = "new") },
  { axis: "numFmt", label: "数値書式", mutate: (ws) => void (ws.getRow(2).getCell(2).numFmt = "#,##0") },
  {
    axis: "fill",
    label: "背景色",
    mutate: (ws) => void (ws.getRow(2).getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFCCCC" } }),
  },
  { axis: "bold", label: "太字", mutate: (ws) => void (ws.getRow(1).getCell(1).font = { bold: true }) },
  {
    axis: "border",
    label: "罫線",
    mutate: (ws) => void (ws.getRow(2).getCell(1).border = { top: { style: "thin" }, left: { style: "thin" } }),
  },
  { axis: "align", label: "水平配置", mutate: (ws) => void (ws.getRow(2).getCell(1).alignment = { horizontal: "center" }) },
  { axis: "merges", label: "結合", mutate: (ws) => ws.mergeCells("B3:C3"), rows: ROWS_WITH_BLANKS },
  { axis: "colw", label: "列幅", mutate: (ws) => void (ws.getColumn(1).width = 30) },
  { axis: "rowh", label: "行高", mutate: (ws) => void (ws.getRow(1).height = 40) },
];

describe("snapshot — every axis is load-bearing", () => {
  it.each(CASES)("$label ($axis): detected with the axis, MISSED without it", async ({ axis, mutate, rows }) => {
    const { before, after } = await pair(mutate, rows);

    // With all nine axes: detected.
    expect(diffSnapshots(before, after).changed).toBe(true);

    // With this one axis removed: the change becomes invisible. That is the
    // false negative CROSSING.md warns about, made concrete.
    const blind = diffSnapshots(degrade(before, [axis]), degrade(after, [axis]));
    expect(blind.changed).toBe(false);
    expect(blind.lines).toEqual([]);
  });
});

describe("GOLDEN E8/E9 — the 2026-08-10 no-op guard incident, reproduced offline", () => {
  it("E8: the pre-fix snapshot reports a border+width change as 変化なし", async () => {
    const { before, after } = await pair((ws) => {
      ws.getRow(2).getCell(1).border = { top: { style: "thin" }, left: { style: "thin" } };
      ws.getColumn(1).width = 30;
    });
    const prefix = diffSnapshots(degrade(before, PRE_FIX_MISSING), degrade(after, PRE_FIX_MISSING));
    expect(prefix.changed).toBe(false); // ← the false negative, as recorded
  });

  it("E9: the shipped snapshot reports the same change as 変化あり", async () => {
    const { before, after } = await pair((ws) => {
      ws.getRow(2).getCell(1).border = { top: { style: "thin" }, left: { style: "thin" } };
      ws.getColumn(1).width = 30;
    });
    const { changed, lines } = diffSnapshots(before, after);
    expect(changed).toBe(true);
    expect(lines.join("\n")).toContain("列幅");
    expect(lines.join("\n")).toContain("罫線");
  });

  it("chart count is captured, so a chart insertion is never a no-op", async () => {
    // exceljs cannot author a chart, so this asserts the axis rather than a
    // round trip: a snapshot differing only in chart count is 変化あり.
    const { before } = await pair(() => {});
    const withChart: Snapshot = { ...before, charts: 1 };
    expect(diffSnapshots(before, withChart).changed).toBe(true);
    expect(diffSnapshots(before, degrade(withChart, ["charts"])).changed).toBe(false);
  });
});
