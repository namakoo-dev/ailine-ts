import ExcelJS from "exceljs";
import { MAX_COLS } from "./limits.js";

/**
 * describe-book (あ, CROSSING.md). The document's shape, as the model sees it.
 *
 * ★ Columns are always 0-origin (`列0=商品`). That is not a formatting
 * choice — it is the same coordinate system CONTRACT forces on the generated
 * code (`getCellByPosition(列, 行)`), so nothing has to be translated between
 * the description and the code (nodes/describe-book.md ②). CONTRACT bans
 * lettered columns because they raise silently in UNO; showing the model
 * letters here would be handing it the trap back.
 *
 * exceljs is 1-indexed, so every read below is `+1` and every printed number
 * is `-1`. That offset is the whole port of this unit.
 */
export async function describeBook(bookPath: string): Promise<string> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(bookPath);

  const sheetNames = wb.worksheets.map((w) => w.name);
  const lines = [`シート一覧: ${JSON.stringify(sheetNames)}（1枚目 = ${JSON.stringify(sheetNames[0] ?? "")}）`];

  const ws = wb.worksheets[0];
  // `or 0` in the original: a completely empty sheet has no extent.
  const nrow = ws?.rowCount ?? 0;
  const ncol = ws?.columnCount ?? 0;
  lines.push(`1枚目のデータ範囲: 約 ${nrow} 行 x ${ncol} 列（列は 0 起点で 0..${Math.max(ncol - 1, 0)}）。`);

  const headers: string[] = [];
  if (ws) {
    const row1 = ws.getRow(1);
    for (let c = 1; c <= Math.min(ncol, MAX_COLS); c++) {
      const v = cellText(row1.getCell(c).value);
      // Empty header cells are skipped, so the numbering can have gaps —
      // e.g. "列0=商品, 列2=単価" with no 列1. Intentional
      // (nodes/describe-book.md ③): the model is told what exists, not what
      // does not.
      if (v !== "") {
        headers.push(`列${c - 1}=${v}`);
      }
    }
  }
  if (headers.length > 0) {
    lines.push("行0(見出し): " + headers.join(", "));
  }
  lines.push("行1以降がデータ。");
  return lines.join("\n");
}

/**
 * exceljs hands back richer value objects than openpyxl did (formula results,
 * rich text runs, hyperlinks). Flatten them to the text a human would see.
 */
export function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) {
    return "";
  }
  if (v instanceof Date) {
    return v.toISOString();
  }
  if (typeof v === "object") {
    if ("richText" in v && Array.isArray(v.richText)) {
      return v.richText.map((r) => r.text).join("");
    }
    if ("formula" in v || "sharedFormula" in v) {
      const result = (v as { result?: unknown }).result;
      return result === undefined || result === null ? "" : String(result);
    }
    if ("text" in v && typeof v.text === "string") {
      return v.text;
    }
    if ("error" in v) {
      return String(v.error);
    }
  }
  return String(v);
}
