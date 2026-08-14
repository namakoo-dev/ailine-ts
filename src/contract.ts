/**
 * The prompt assets (ASSETS.md, the "資産" fourth category).
 *
 * ASSETS.md's boundary line: Python code is the thing being ported; Basic
 * code and prompt strings are carried, not ported. The Basic files under
 * `refs/` and `helpers/` are byte-for-byte copies of the originals. The two
 * strings in THIS file are the prompt half of that category.
 *
 * ★ Honesty note about provenance: the B棚 does not hand over these two
 * strings byte-exactly — ASSETS.md A1 describes CONTRACT as a six-point
 * contract, and nodes/load-helpers.md ① gives the catalog's frame verbatim
 * but elides the usage-example block as "例: ... （11 個の呼び出し例。ASSETS.md
 * 参照）". So CONTRACT's wording and the example lines below are composed
 * here from those descriptions plus the helper signatures in
 * helpers/AiLineHelpers.bas. Functionally load-bearing, not byte-identical
 * to the original.
 */

/**
 * A1. CONTRACT — the constraints the model must honor unconditionally,
 * pinned to the head of the system message so it survives context pressure
 * (nodes/prompt-assembly.md ②).
 *
 * The six points are ASSETS.md A1's list, in its order. Each one is a trap
 * that was actually stepped on:
 *   4. 0-origin cell access — matched to describe-book's 0-origin column
 *      numbering so the description and the code share one coordinate system.
 *   5. queryKey/addNew — 7B writes queryKey and drops addNew (ASSETS.md A6).
 *   6. lettered columns raise silently and abort the whole Sub
 *      (refs/01_value_format.bas, 2026-08-04).
 */
export const CONTRACT = `あなたは LibreOffice Calc の Basic マクロだけを書く。説明・前置き・後書きは書かない。
markdown の柵（\`\`\`）も禁止。出力は .bas の本文だけ。

1. 先頭は必ずこの2行から始める:
   Option VBASupport 1
   Option Explicit
2. 手続きはちょうど1つ。署名は必ず \`Sub Run(oDoc As Object)\`。名前も引数も変えない。
3. \`ThisComponent\` は使わない。対象の文書は引数 oDoc で渡される。1枚目は \`oDoc.Sheets.getByIndex(0)\`。
4. セルは 0 起点で指す: \`oSheet.getCellByPosition(列, 行)\`。見出しは行0、データは行1以降。
5. 数値書式は queryKey / addNew の組で付ける:
   Dim aLocale As New com.sun.star.lang.Locale
   nFmt = oDoc.getNumberFormats().queryKey(sFmt, aLocale, False)
   If nFmt = -1 Then nFmt = oDoc.getNumberFormats().addNew(sFmt, aLocale)
   （queryKey だけで済ませない。-1 は「まだ無い」の意味）
6. 列を文字（"A" 等）で指す API は使わない。静かに例外を投げて Sub ごと止まる。列は必ず数値の列番号で指す。
`;

/**
 * A2. The helper catalog's fixed instructional text.
 *
 * The frame (heading / the three ★ warnings / the 定義済み envelope) is
 * verbatim from nodes/load-helpers.md ①. The example lines are one per
 * callable helper, in the order they appear in helpers/AiLineHelpers.bas;
 * ASSETS.md A2 supplies the first of them literally
 * (「金額で降順に並べ替え」→ Call SortByColumn(oDoc, 1, False)) and states
 * the list is 1:1 with the signatures.
 *
 * ★ The B棚 disagrees with itself on the count: ASSETS.md A2 and
 * nodes/load-helpers.md ④ both say "11 呼び出し例 / 11 helpers", but the
 * shipped helpers/AiLineHelpers.bas actually defines 12 callable Subs plus
 * the internal BoldRange (ASSETS.md A6's own table lists 12 + 1). The 1:1
 * rule wins over the count, so there are 12 lines here — StyleBold is the
 * one the "11" figure drops.
 *
 * Note the coupling ASSETS.md A2 flags as unguarded: adding a helper means
 * hand-editing this list. Nothing mechanically enforces it, here or in the
 * original.
 */
export const HELPER_USAGE_EXAMPLES = [
  "例: 「金額で降順に並べ替え」→ Call SortByColumn(oDoc, 1, False)",
  "例: 「金額の棒グラフを入れて」→ Call InsertBarChart(oDoc, 1)",
  "例: 「A1 と B1 を結合して」→ Call MergeCells(oDoc, 0, 0, 1, 0)",
  "例: 「先頭データ行の前に3行入れて」→ Call InsertRows(oDoc, 1, 3)",
  "例: 「表に罫線を引いて」→ Call DrawTableBorders(oDoc)",
  "例: 「列幅を内容に合わせて」→ Call AutoFitColumns(oDoc)",
  "例: 「表全体を中央揃えに」→ Call AlignCenter(oDoc)",
  "例: 「金額に3桁カンマを付けて」→ Call FormatThousands(oDoc, 1)",
  "例: 「単価表を見て単価を2列目に入れて」→ Call VLookupFromTable(oDoc, 0, 2, \"単価表\")",
  "例: 「部門別の金額をピボットで集計して」→ Call PivotSum(oDoc, 0, 1)",
  "例: 「部門別の集計表を作って」→ Call SummaryTable(oDoc, 0, 1)",
  "例: 「見出し行を太字に」→ Call StyleBold(oDoc, 0, 0, 2, 0)",
];

/** Builds the catalog around the concatenated helper sources. */
export function helperCatalog(sources: string): string {
  return (
    "\n\n## 定義済みヘルパ（★ 呼ぶだけ・再定義しない）\n" +
    "arcane な操作（並べ替え等）は、自分で書かず次のヘルパを使うこと。\n" +
    "★ 呼び方は必ず `Call 名前(引数)` の形（Call を付ける。括弧つきで Call 無しは誤動作する）。\n" +
    "★ ヘルパの中身は絶対に書き写すな（SummaryTable 等が長くても）。必ず `Call 名前(...)` の1行だけで呼ぶ。\n" +
    HELPER_USAGE_EXAMPLES.join("\n") +
    "\n" +
    `--- 定義済み（この通り既に存在する。再定義するな）---\n${sources}\n--- ここまで ---\n`
  );
}
