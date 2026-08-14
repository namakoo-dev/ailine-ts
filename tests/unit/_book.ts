import ExcelJS from "exceljs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * The TS counterpart of the original suite's local `_book(tmp_path, rows)`
 * helper: build a minimal workbook on the fly rather than shipping fixtures.
 *
 * The default rows are the same shape as golden/fixture.xlsx
 * (A1:C2 = 商品,金額,在庫 / りんご,1200,8), which GOLDEN.md's C section names
 * as the representative fixture.
 *
 * Both sides of every C-row comparison are built from scratch by this
 * function, one of them with a mutation applied. That keeps the mutation the
 * ONLY difference between the two files — if the base were instead loaded,
 * mutated and re-saved, any incidental change exceljs makes during a
 * round-trip would show up in the diff and a test could pass for the wrong
 * reason.
 */
export const DEFAULT_ROWS: (string | number)[][] = [
  ["商品", "金額", "在庫"],
  ["りんご", 1200, 8],
];

export type Mutate = (ws: ExcelJS.Worksheet, wb: ExcelJS.Workbook) => void;

export async function makeBook(filePath: string, mutate?: Mutate, rows: (string | number)[][] = DEFAULT_ROWS): Promise<string> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sheet");
  for (const row of rows) {
    ws.addRow(row);
  }
  mutate?.(ws, wb);
  await wb.xlsx.writeFile(filePath);
  return filePath;
}

export function tmpDir(prefix = "ailine-test-"): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/** Repo root, so tests can reach the shipped refs/ and helpers/ directories. */
export const PKG_ROOT = path.resolve(import.meta.dirname, "..", "..");
