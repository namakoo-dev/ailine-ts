# GOLDEN — 言語中立の特性化テスト表

ailine.py の pytest スイート（20件、全て `tests/test_ailine.py` 単体・`ollama`/LibreOffice 不要な純ロジック層のみ）と、
README・docstring・一次資料（recall session）から読み取れる「実測で確認済み」の記述を、**Python 固有の内部構造を使わず、
外から観測可能な入出力**の形に変換した表。TS 版はこの表の Then 列を満たせば、実装手段（クラス構成・関数分割等）は問わず
「同じ挙動」とみなせる。

★ **basrun との構造的な違い**: basrun の GOLDEN は「決定論的 pass/fail」で全行を書けた（UNO API の挙動は再現性がある）。
ailine は**中核の価値そのものが確率的**（ローカル LLM がタスクをどう Basic に書き起こすか）。そのため本表は
**決定論型（A〜D）**と**成功率型（E）**を明確に分離する。決定論型は pytest 相当のテストで機械検証できる。
成功率型は「入力プロンプト → 期待される検証通過の観測方法 → 過去の実測成功率（出典つき）」の形で書き、
**厳密な再現性を主張しない**（同じプロンプトでも LLM は毎回同じ出力をするとは限らない。温度 0.2 でも決定論ではない）。

statuses（決定論型 A〜D）: **M**=機械的に自動検証済み（pytest green）／**D**=README/docstring に記載されるが自動テストとしては未切り出し／**未**=宣言も自動化も無い、意図的な既知の穴。

statuses（確率的行 E）: 実測件数と出典（recall session アンカー）を必ず併記する。**「動く」と「毎回同じ結果になる」は別**である点を、この節全体の前提として明記する。

---

## A. コード抽出・署名検証（[[extract-bas]] [[valid-signature]]）

| # | Given | When | Then | 対応 pytest | 状態 |
|---|---|---|---|---|---|
| A1 | \`\`\`basic フェンス付きの LLM 出力（中身は `Option Explicit` から始まる） | `extract_bas(raw)` | 戻り値は `Option Explicit` から始まり、フェンス記号 `` ``` `` を含まない | `test_extract_bas_strips_markdown_fence` | M |
| A2 | フェンス無しの生テキスト（`Sub Run(...)...`） | `extract_bas(raw)` | 戻り値は入力と完全一致（そのまま通過） | `test_extract_bas_passthrough_without_fence` | M |
| A3 | `"Sub Run(oDoc As Object)\nEnd Sub"` | `valid_signature(code)` | `True` | `test_valid_signature` param1 | M |
| A4 | `"sub run( oDoc as object )"`（大文字小文字・空白ゆらぎ） | `valid_signature(code)` | `True` | `test_valid_signature` param2 | M |
| A5 | `"Sub Run()\nEnd Sub"`（引数なし） | `valid_signature(code)` | `False` | `test_valid_signature` param3 | M |
| A6 | `"Sub Other(oDoc As Object)"`（別名） | `valid_signature(code)` | `False` | `test_valid_signature` param4 | M |
| A7 | `"' コメントだけ"` | `valid_signature(code)` | `False` | `test_valid_signature` param5 | M |

## B. 参照・ヘルパ読み込み（[[load-refs]] [[load-helpers]]）

| # | Given | When | Then | 対応 pytest | 状態 |
|---|---|---|---|---|---|
| B1 | `ailine.DEFAULT_REFS`（実在する `refs/` ディレクトリ、golden/ に同一内容のコピー有り） | `load_refs(dir)` | 戻り値の文字列に `"Sub Run(oDoc As Object)"` と `"参考"` を含む | `test_load_refs_bundles_examples` | M |
| B2 | 存在しないディレクトリ | `load_refs(dir)` | `""` | `test_load_refs_missing_dir_is_empty` | M |
| B3 | `ailine.DEFAULT_HELPERS`（実在する `helpers/` ディレクトリ、golden/ に同一内容のコピー有り） | `load_helpers(dir)` | `catalog` に `"SortByColumn"` と `"InsertBarChart"` と `"Call"` を含む。`files` は `.bas` で終わるパスを1件以上含む | `test_load_helpers_catalog_and_files` | M |
| B4 | 存在しないディレクトリ | `load_helpers(dir)` | `("", [])` | `test_load_helpers_missing_dir` | M |

## C. no-op ガード（[[snapshot]] [[diff-snapshots]]）── ailine の存在理由そのものの機械検証

固定具: `_book(tmp_path, rows)` が `openpyxl.Workbook()` に `rows` を `append` して保存する最小フィクスチャ生成（テスト内の局所ヘルパ、golden/fixture.xlsx はその代表例の1つ:  A1:C2 = `商品,金額,在庫` / `りんご,1200,8`）。

| # | Given（前提・変更） | When | Then（`diff_snapshots` の結果） | 対応 pytest | 状態 |
|---|---|---|---|---|---|
| C1 | セル値を1つ書き換える（例: `(1,3)` に `"new"`） | `snapshot()` を前後で取り `diff_snapshots(before, after)` | `changed=True`。差分行に変更後の値（`"new"`）を含む | `test_diff_detects_value_change` | M |
| C2 | 何も変えない（同一文書を2回 snapshot） | 同上 | `changed=False` かつ `lines == []`（no-op を正しく no-op と判定） | `test_diff_noop_when_unchanged` | M |
| C3 | 新しいシート（`"集計"`）を作る | 同上 | `changed=True`。差分行にシート名 `"集計"` を含む | `test_diff_detects_new_sheet` | M |
| C4 | 値は変えず背景色だけ変える（`PatternFill`） | 同上 | `changed=True` | `test_diff_detects_fill_only_change` | M |
| C5 | 値は変えず罫線だけ変える（`Border`/`Side`） | 同上 | `changed=True` | `test_diff_detects_border_only_change` | M |
| C6 | セルを結合する（`merge_cells("A1:B1")`） | 同上 | `changed=True`。差分行に `"結合"` を含む | `test_diff_detects_merge` | M |
| C7 | 列幅を変える（`column_dimensions["A"].width = 30`） | 同上 | `changed=True`。差分行に `"列幅"` を含む | `test_diff_detects_colwidth` | M |
| C8 | 値は変えず水平配置だけ変える（`Alignment(horizontal="center")`） | 同上 | `changed=True` | `test_diff_detects_align_only_change` | M |

**C4/C5/C8（書式のみ・罫線のみ・配置のみの変更検出）は、[[snapshot]] のノードに記録した実際の事故（2026-08-10、罫線/列幅変更が no-op と誤判定された）の直接の回帰防止テスト。**

## D. 文書説明（[[describe-book]]）

| # | Given | When | Then | 対応 pytest | 状態 |
|---|---|---|---|---|---|
| D1 | 1シート、見出し行 `商品,金額,在庫` + データ1行 | `describe_book(path)` | 戻り値の文字列に `"列0=商品"` `"列1=金額"` `"シート一覧"` を含む | `test_describe_book_lists_headers` | M |

---

## E. 生成品質（確率的・成功率型）── LLM が絡む挙動。決定論では書けない

各行の形式: **入力プロンプトの性質 → 観測方法（何をもって「通った」とするか） → 実測成功率 → 出典（recall アンカー）**。
出典は全て `recall.py search "<語>"` で見つけた internal session log（2026-08-10 〜 2026-08-11、ailine 設計時の実演記録）から。
**再現性の注意**: これらの数値は特定のモデル（`qwen2.5-coder:7b`）・特定の日時の実測であり、モデル差し替えや ollama バージョン差で変わりうる。TS 移植時の目標値としてではなく「この設計判断が何によって正当化されたか」の記録として読むこと。

| # | 入力プロンプトの性質 | 観測方法 | 実測 | 出典（アンカー@日時） |
|---|---|---|---|---|
| E1 | few-shot 無し（[[load-refs]]/[[load-helpers]] 導入前）、苦手層タスク（新シート・ソート・グラフ） | 生成コードを basrun 適用し、no-op ガード＋目視で正しさ判定 | **0%**（苦手層3種とも失敗） | (internal session log, 2026-08-10 04:40) |
| E2 | 苦手層タスクに few-shot 1本ずつ（[[load-refs]]）を追加 | 同上 | **67%**（新シート・グラフは一発成功、ソートのみ残存） | (internal session log, 2026-08-10 04:49) |
| E3 | ソートタスク（few-shot 有り、ヘルパ導入前）、7B に生の `SortField`/`ContainsHeader` を書かせる | 生成コードの `ContainsHeader` 値を目視検査 | **約半分**の試行で `ContainsHeader=True`（誤り。正しくは `False`）に滑る。API 選択自体は正しい（知識でなく判断のミス） | (internal session log, 2026-08-10 04:49, 05:21) |
| E4 | ソートタスク（[[load-helpers]] のヘルパ方式導入後）、モデルは `Call SortByColumn(oDoc, 1, False)` の1行のみ書く | 実機描画で並び順を目視確認 | **完全降順を確認**（`ContainsHeader` の取り違えは構造的に発生し得ない ── モデルが arcane な判断に触れないため） | (internal session log, 2026-08-10 05:27-05:29) |
| E5 | 太字タスク（native 対応前、openpyxl 後付けも撤去済みの状態） | no-op ガードで検出 | **両試行とも no-op として正しく失敗検出**（偽の成功を報告しなかった＝設計は機能した）。ただし修復ループでは太字自体は最終的に成立しなかった（[[repair-loop]] の限界として記録） | (internal session log, 2026-08-10 05:03-05:04) |
| E6 | 太字タスク（`StyleBold`/`SummaryTable` ヘルパ導入後、`CharWeightAsian` 対応後） | openpyxl 読み戻し＋実機描画の両方で確認 | 日本語太字を含め **native 太字が成立**（当初「環境不可」と誤断していたが、`CharWeight`+`CharWeightAsian`+`CharWeightComplex` の直接指定で解決） | (internal session log, 2026-08-11 00:38-00:51) |
| E7 | ピボット集計タスク（`PivotSum` ヘルパ、DataPilot は UNO で最も arcane とされていた） | 実機描画で部門別合計・総計行を目視確認 | **一発で成立**（ヘルパ化前の予想では「高難度」だったが、ヘルパとして固定した後の初回呼び出しは成功） | (internal session log, 2026-08-10 06:16) |
| E8 | 罫線・列幅変更タスク（[[snapshot]] のバグ修正**前**） | no-op ガードの判定 | ヘルパは正しく実行され LibreOffice 側は実際に変わっていたが、**no-op ガードが誤って「変化なし」と判定**（検証側の欠陥、生成側の欠陥ではない） | (internal session log, 2026-08-10 06:07) |
| E9 | 罫線・列幅変更タスク（[[snapshot]] のバグ修正**後**） | no-op ガードの判定＋実機描画 | 罫線・列幅とも正しく `changed=True` として検出 | (internal session log, 2026-08-10 06:08-06:10) |

---

## F. カバレッジまとめ

- pytest 収集数: **20 件**（`python -m pytest tests --collect-only -q` で実測確認済み、`test_ailine.py` 単体。README の「純ロジックのユニットテスト20件」と一致）。
- 上表 A〜D で pytest 直結（状態 M）の行: **20 行全て**（A×7 + B×4 + C×8 + D×1 = 20。ailine の pytest は基本ロジック層を漏れなく機械検証している）。
- pytest でカバーされない既知の穴（宣言はあるが自動検証は無い）:
  - **[[repair-loop]] の通し実行**（生成→適用→no-op判定→修復サイクル全体）── README 冒頭に明記「実機 LibreOffice を通した自動の通し試験はこれから」。E セクションの実測は手動デモの記録であり、pytest ではない。
  - **[[basrun-apply-invocation]]**（basrun へのサブプロセス呼び出し、cp932 対策込み）── 単体テスト無し。
  - **[[ollama-generate]]**（HTTP 呼び出し・接続失敗時のメッセージ）── 単体テスト無し（モック無しで ollama サーバに依存するため）。
  - **[[basrun-path-resolution]]**（環境変数/並び探索の優先順位）── 単体テスト無し。
  - **[[cli-overview]] の argparse 検証**（basrun の `test_subcommands_parse_minimal_argv_without_error` に相当するテスト）── ailine には存在しない。
  - **[[cmd-stop]]** ── 単体テスト無し（basrun 側の `stop` は library-basrun でテスト済みだが、ailine 側の薄い委譲自体は未検証）。
- TS 移植時の指針: 状態 M の行（A〜D の 20 行）は pytest 相当のテストで最低限再現すること。E セクション（確率的）は「同じ設計判断（few-shot・ヘルパ方式・no-op ガードの捕捉軸）を持ち越せば同種の効果が期待できる」という**示唆**として扱い、数値そのものの再現を保証と誤解しないこと。上記「カバーされない既知の穴」は、Python 版に無いカバレッジとして TS 版が超える好機（basrun の GOLDEN と同じ指針）。
