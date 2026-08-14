import path from "node:path";
import { describe, expect, it } from "vitest";
import { diffSnapshots } from "../../src/diffSnapshots.js";
import { Mutate, makeBook, tmpDir } from "./_book.js";
import { snapshot } from "../../src/snapshot.js";

/**
 * GOLDEN.md section C — the no-op guard. Eight of the original's twenty tests
 * live here, which is the corpus's own way of saying this is the unit the
 * whole tool exists for.
 *
 * ★ C4 / C5 / C8 (fill-only, border-only, alignment-only) are regression
 * tests for a real incident: on 2026-08-10 a border + column-width change was
 * applied correctly and reported as "変化なし", because snapshot was only
 * recording value / numfmt / fill / bold at the time (nodes/snapshot.md ②).
 * Each of these rows pins one axis that was missing.
 */

/** Builds base and mutated books, snapshots both, returns the diff. */
async function diffOf(mutate: Mutate) {
  const dir = tmpDir();
  const before = await makeBook(path.join(dir, "before.xlsx"));
  const after = await makeBook(path.join(dir, "after.xlsx"), mutate);
  return diffSnapshots(await snapshot(before), await snapshot(after));
}

describe("GOLDEN C — diff-snapshots", () => {
  it("C1: a single changed cell value is detected and shown", async () => {
    const { changed, lines } = await diffOf((ws) => {
      ws.getRow(1).getCell(3).value = "new";
    });
    expect(changed).toBe(true);
    expect(lines.join("\n")).toContain("new");
  });

  it("C2: snapshotting an unchanged document twice is a no-op", async () => {
    const book = await makeBook(path.join(tmpDir(), "b.xlsx"));
    const { changed, lines } = diffSnapshots(await snapshot(book), await snapshot(book));
    expect(changed).toBe(false);
    expect(lines).toEqual([]);
  });

  it("C3: a new sheet is detected and named", async () => {
    const { changed, lines } = await diffOf((_ws, wb) => {
      wb.addWorksheet("集計");
    });
    expect(changed).toBe(true);
    expect(lines.join("\n")).toContain("集計");
  });

  it("C4: a fill-only change is detected", async () => {
    const { changed } = await diffOf((ws) => {
      ws.getRow(2).getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFCCCC" } };
    });
    expect(changed).toBe(true);
  });

  it("C5: a border-only change is detected", async () => {
    const { changed } = await diffOf((ws) => {
      ws.getRow(2).getCell(1).border = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      };
    });
    expect(changed).toBe(true);
  });

  it("C6: a merge is detected and labelled 結合", async () => {
    const { changed, lines } = await diffOf((ws) => {
      ws.mergeCells("A1:B1");
    });
    expect(changed).toBe(true);
    expect(lines.join("\n")).toContain("結合");
  });

  it("C7: a column-width change is detected and labelled 列幅", async () => {
    const { changed, lines } = await diffOf((ws) => {
      ws.getColumn(1).width = 30;
    });
    expect(changed).toBe(true);
    expect(lines.join("\n")).toContain("列幅");
  });

  it("C8: an alignment-only change is detected", async () => {
    const { changed } = await diffOf((ws) => {
      ws.getRow(2).getCell(1).alignment = { horizontal: "center" };
    });
    expect(changed).toBe(true);
  });
});
