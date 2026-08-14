# ASSETS — 言語中立の資産目録（第四カテゴリ）

第一弾（library-basrun）の CROSSING.md は「あ/い/う」の3分類だった。第二弾（ailine）で追加する第四分類がこれ:
**資産＝TS へ「移植」するのではなく「そのまま運ぶ」もの**。プロンプトテンプレート・few-shot 例（Basic コード）・検証済みヘルパ（Basic コード）は、
ailine 側の実装言語（Python → TS）に依存しない。**Basic のコードは LibreOffice の中で走り続ける** ── ホスト言語を Python から TS に替えても、
これらのファイルの中身は一切書き換える必要が無い。境界線は明確: **Python コード（ailine.py）＝ポート対象。Basic コード＋プロンプト文字列＝そのまま運ぶ対象。**

## 内訳

| 資産 | 種別 | 件数/量 |
|---|---|---|
| CONTRACT（system prompt 契約） | プロンプトテンプレート | 1（文字列定数） |
| ヘルパカタログ指示文（呼び方の警告・11例の呼び出し例） | プロンプトテンプレート | 1（文字列生成ロジックの中の固定部分） |
| `refs/*.bas` | few-shot 例（Basic） | 3 ファイル |
| `helpers/AiLineHelpers.bas` | 検証済みヘルパ（Basic） | 1 ファイル・11 呼び出し可能 Sub + 内部 1 Sub |
| `demo/*.xlsx` | 手動デモ用フィクスチャ | 3 ファイル |

---

## A1. CONTRACT（system prompt 契約テキスト）

- **役割**: LLM に毎回・無条件で守らせる制約の全文。`Option VBASupport 1`/`Option Explicit` の強制、`Sub Run(oDoc As Object)` という唯一の署名、`ThisComponent` 禁止、0起点セルアクセス、数値書式の `queryKey`/`addNew` パターン、列を文字で指すな、の6項目。
- **依存**: 無し（自己完結した文字列定数）。ただし内容は basrun 側の apply-script-contract ノード（library-basrun。`ThisComponent` 禁止の直接の理由）と `refs/01_value_format.bas`（列番号の罠の直接の理由）を前提知識として要約している。
- **出典**: `C:\Dev\ailine\ailine.py:66-76`
- **TS 移植時の扱い**: 文字列をそのまま TS 側の定数として持ち越す。**内容を Basic の知識に基づいて書き換える必要はゼロ**（プロンプトの受け手は常に同じ Basic インタプリタ）。

## A2. ヘルパカタログ指示文（呼び方の警告＋使用例11本）

- **役割**: 「ヘルパは呼ぶだけ・書き写すな・`Call` 必須」という強い禁止と、自然文タスク→ヘルパ呼び出しの対応例11本（例: 「金額で降順に並べ替え」→ `Call SortByColumn(oDoc, 1, False)`）。[[load-helpers]] のノードが実装するロジックの中の**固定テキスト部分**。
- **依存**: A6（`helpers/AiLineHelpers.bas`）の関数シグネチャと1対1対応。ヘルパを増減したら、この使用例リストも同時に更新する必要がある（現状はコード内にハードコードされており、機械的な同期保証は無い ── ★ TS 移植時の改善候補: シグネチャから使用例を自動生成する等）。
- **出典**: `C:\Dev\ailine\ailine.py:123-142`

## A3〜A5. `refs/*.bas`（few-shot 参照例）

| ファイル | 教える内容 | 埋め込まれた罠の教訓 |
|---|---|---|
| `01_value_format.bas` | セルの読み書き・四則演算・数値書式（`queryKey`/`addNew`） | 列を文字("A")で指すと静かに例外で落ちる（2026-08-04 に実際に踏んだ） |
| `02_new_sheet.bas` | 新シート作成 `insertNewByName` の冪等パターン（`hasByName` で存在確認してから作る） | （罠というより定石の提示） |
| `05_cell_color.bas` | 条件付き背景色 `CellBackColor` | 色は必ず `&HRRGGBB&` 16進リテラルで。`RGB()` は `VBASupport 1` 下で BGR になり赤と青が入れ替わる（実測で確認済みの罠） |

- **依存**: A1（CONTRACT）が「この3例は正しい書き方の参考」と前置きして渡す。ファイル自体は独立して動作する（basrun で個別に動作検証可能）。
- **出典**: `C:\Dev\ailine\refs\01_value_format.bas` / `02_new_sheet.bas` / `05_cell_color.bas`（全文は各ファイル）
- **運用ルール（README 明記）**: 「追加する参照は、必ず basrun で動作検証してから置くこと。動かない例は few-shot を毒する」── これは資産の**追加手順**そのものであり、TS 版でも同じ運用ルールを維持すべき（ここは移植でなく継承すべき「作り方」の資産）。
- **TS 移植時の扱い**: ファイルをそのままコピーするだけ。中身を書き換える理由が無い。

## A6. `helpers/AiLineHelpers.bas`（検証済みヘルパ 11 + 内部 1）

**設計原理**（[[load-helpers]] ノードの一次資料参照）: arcane な UNO 操作（判断を伴う・コメントで警告しても LLM が滑る類のもの）を人間が検証済みのコードに閉じ込め、LLM には `Call 名前(引数)` の1行だけを書かせる。README・CONTRACT・カタログ指示文（A2）が三重に「中身を書き写すな」と警告している。

| ヘルパ | 隠している難所 | 内部依存 |
|---|---|---|
| `SortByColumn(oDoc, col, ascending)` | 範囲検出・`SortFields`・`ContainsHeader=False`（7B がここを滑った実例あり） | 無し |
| `InsertBarChart(oDoc, valCol)` | タイトル・軸・系列色の自動導出。データラベル無しの清潔な既定 | 無し |
| `MergeCells(oDoc, c1, r1, c2, r2)` | 範囲を渡さず単一セルに merge する誤りを封じる | 無し |
| `InsertRows(oDoc, atRow, count)` | `Rows.insertByIndex`・0起点位置 | 無し |
| `DrawTableBorders(oDoc)` | データ範囲自動検出・`TableBorder2` 格子 | 無し |
| `AutoFitColumns(oDoc)` | 使用列自動検出・`OptimalWidth` | 無し |
| `AlignCenter(oDoc)` | `HoriJustify`（`CharHorizontalAlignment` は段落用で Calc セルに効かない罠） | 無し |
| `FormatThousands(oDoc, col)` | `queryKey` の `-1` を `addNew` で拾う・Locale 構築（7B が `addNew` を落として滑る） | 無し |
| `VLookupFromTable(oDoc, keyCol, resultCol, lookupSheet)` | Basic 側で照合（`=VLOOKUP` 数式はこの経路で `#VALUE!`）。参照表は列0=キー/列1=値 | 無し |
| `PivotSum(oDoc, groupCol, valueCol)` | 本物の DataPilot を新「ピボット」シートに | 無し |
| `SummaryTable(oDoc, groupCol, valueCol)` | 普通の表として集計（DataPilot の再描画による書式撥ねを回避） | `BoldRange`（内部）を呼ぶ |
| `StyleBold(oDoc, c1, r1, c2, r2)` | native 太字（`CharWeight`+`CharWeightAsian`+`CharWeightComplex`） | `BoldRange`（内部）を呼ぶ |
| `BoldRange`（内部・カタログに載らない） | セル範囲へ3種の CharWeight を当てる共通処理 | `StyleBold`/`SummaryTable` から呼ばれる |

- **依存**: [[basrun-apply-invocation]] が生成コードと同じ `src/` ディレクトリへ毎回コピーする（basrun 経由で同一ライブラリとして LibreOffice に同期される）。
- **出典**: `C:\Dev\ailine\helpers\AiLineHelpers.bas`（全 434 行）
- **一次資料（設計の転換点）**: `SortByColumn` の `ContainsHeader` 取り違えが few-shot だけでは直らなかった実測（internal session log, 2026-08-10 04:49-05:29）が、この「呼ぶだけヘルパ」方式そのものの発端。`StyleBold`/`SummaryTable` の native 太字対応は internal session log, 2026-08-11 00:38-00:51（当初「環境不可」と誤断していたものを Namakoo の「後付け以外に本当に方法は？」という押しで訂正した経緯つき ── memory `project_basrun_ai_line.md` にも記録）。
- **TS 移植時の扱い**: ファイルをそのままコピーするだけ。**11+1 個の Sub の中身は Basic のまま**、TS 側は「同じライブラリへ同梱コピーして `Call` させる」という配線（[[basrun-apply-invocation]] の構造）だけを再実装すればよい。

## demo/*.xlsx（手動デモ用フィクスチャ）

| ファイル | 形 | 用途（README 記載） |
|---|---|---|
| `sample.xlsx` | 商品×金額×在庫×売上×原価（6行5列、1シート） | 基本デモ（README コマンド例で直接使用） |
| `sales.xlsx` | 部門×金額（7行2列） | ピボット/集計向きデモ |
| `lookup.xlsx` | 「明細」（商品×数量×単価、単価は空欄）＋「単価表」（商品×単価の2列参照表） | VLOOKUP（`VLookupFromTable` ヘルパ）向きデモ |

- **役割**: pytest には使われない（pytest は `tmp_path` 上で `openpyxl` により最小構成を都度生成 ── `tests/test_ailine.py` の `_book()` ヘルパ参照）。**人間が CLI を手で叩いて試す時の題材**として README のコマンド例が直接参照する。
- **性質**: 資産ではあるが「そのまま運ぶ」対象というより「開発者体験を保つための添付データ」に近い。移植時は同等の意味を持つ最小デモファイルを TS 側でも用意すればよく、内容の一致自体には強い意味は無い（低優先度の資産）。
- **出典**: `C:\Dev\ailine\demo\sample.xlsx` / `sales.xlsx` / `lookup.xlsx`
