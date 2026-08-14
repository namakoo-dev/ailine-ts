// Regenerates demo/*.xlsx. ASSETS.md treats the demo books as attached data
// for the developer experience rather than an asset to carry byte-for-byte —
// "同等の意味を持つ最小デモファイル" is enough — so they are generated here
// from the shapes ASSETS.md documents instead of being copied.
//
//   sample.xlsx  商品×金額×在庫×売上×原価 (6行5列, 1シート)  README's command example
//   sales.xlsx   部門×金額 (7行2列)                            pivot / summary demos
//   lookup.xlsx  明細(商品×数量×単価, 単価は空欄) + 単価表      VLookupFromTable demo
//
// Run: node tests/makeDemo.mjs
import ExcelJS from "exceljs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const demo = (name) => path.join(ROOT, "demo", name);

async function write(file, sheets) {
  const wb = new ExcelJS.Workbook();
  for (const [name, rows] of Object.entries(sheets)) {
    const ws = wb.addWorksheet(name);
    for (const row of rows) ws.addRow(row);
  }
  await wb.xlsx.writeFile(file);
  console.log("wrote", file);
}

await write(demo("sample.xlsx"), {
  Sheet: [
    ["商品", "金額", "在庫", "売上", "原価"],
    ["りんご", 1200, 8, 9600, 7200],
    ["みかん", 800, 24, 19200, 13440],
    ["ぶどう", 2400, 3, 7200, 5040],
    ["もも", 1800, 12, 21600, 16200],
    ["なし", 1500, 6, 9000, 6300],
  ],
});

await write(demo("sales.xlsx"), {
  Sheet: [
    ["部門", "金額"],
    ["営業", 120000],
    ["開発", 340000],
    ["営業", 98000],
    ["総務", 45000],
    ["開発", 210000],
    ["総務", 67000],
  ],
});

await write(demo("lookup.xlsx"), {
  明細: [
    ["商品", "数量", "単価"],
    ["りんご", 3, null],
    ["みかん", 12, null],
    ["ぶどう", 2, null],
  ],
  単価表: [
    ["りんご", 1200],
    ["みかん", 800],
    ["ぶどう", 2400],
  ],
});
