# library-ailine — B棚（言語中立の挙動コーパス）

移行実験第二弾 Phase A の成果物。ソース `C:\Dev\ailine`（公開名 ailine、Python 製・自然言語のタスクをローカル LLM が
LibreOffice Basic に書き起こし、[basrun](https://github.com/namakoo-dev/basrun) で文書に適用し、効果を読み戻して検証するツール）から、
**Python ソースを一切見ずに TypeScript 版を実装するための橋**として建設。ソースは読み取り専用
（`git -C C:\Dev\ailine status --porcelain` は変更ゼロのまま）。

第一弾（library-basrun）との違い: ailine の中核価値は**ローカル LLM が絡む確率的な挙動**（自然文→Basic コード生成）であり、
決定論的 pass/fail だけでは書けない。そのため本棚は GOLDEN.md を決定論型（A〜D）と成功率型（E）に分離し、
CROSSING.md には basrun には無かった第四分類「資産（移植不要・そのまま運ぶ）」を追加した。

- 挙動と意図の記述: `nodes/*.md`（14 ノード。1 ノード = 1 単位）
- 言語中立の特性化テスト表: `GOLDEN.md`（決定論型20行 + 確率的行9行）+ `golden/`（フィクスチャ5点）
- 渡河可能性の分類: `CROSSING.md`（あ 12 / い 2 / う **0** ／資産は別枠）
- 資産目録（第四カテゴリ・第二弾固有）: `ASSETS.md`（プロンプト2種＋ few-shot 3ファイル＋検証済みヘルパ1ファイル＋デモ3ファイル）

## 索引（1 ノード 1 行）

- [[cli-overview]] — `run`/`stop` 2サブコマンドの引数構造とディスパッチ
- [[basrun-path-resolution]] — 環境変数 `BASRUN` > 並びディレクトリ探索で `basrun.py` の場所を決める
- [[ollama-generate]] — ローカル LLM (`/api/chat`) への HTTP 契約。外部送信をしない設計の実装点
- [[load-refs]] — few-shot 参照例（`refs/*.bas`）をプロンプトへ連結する
- [[load-helpers]] — arcane な操作を「呼ぶだけ」にするヘルパカタログの組み立て。ContainsHeader 事故からの方向転換の記録
- [[prompt-assembly]] — CONTRACT・few-shot・ヘルパカタログ・文書説明・タスク文を固定順で messages に組む
- [[extract-bas]] — LLM 出力から markdown フェンスを剥がして .bas 本文を取り出す
- [[valid-signature]] — `Sub Run(oDoc As Object)` という唯一の署名契約を実行前に検査する
- [[describe-book]] — 文書の形（シート名・列番号0起点・見出し）を LLM に見せる説明文生成
- [[snapshot]] — no-op ガードの核。9要素（値/書式/色/太字/罫線/結合/列幅/行高/配置）を捉える。捕捉漏れの実際の事故と修正の記録
- [[diff-snapshots]] — before/after の snapshot を比較し、変化の有無と人間向け差分行を出す
- [[basrun-apply-invocation]] — 生成コード＋ヘルパを同じライブラリへ同梱し basrun apply を呼ぶ。cp932 事故の回避
- [[repair-loop]] — 生成→検証→適用→no-op判定→3失敗モード別修復、のオーケストレーション全体。ailine の中核
- [[cmd-stop]] — basrun stop への薄い委譲

## 検査結果サマリ

- ノード数: **14**
- 単位分類（CROSSING.md）: あ 12 / い 2 / う **0**（basrun は う10 だった ── プラットフォーム結合が既に basrun 層に隔離済みという構造的な発見）
- 資産（ASSETS.md、CROSSING.md の第四分類）: **5種類**（CONTRACT・ヘルパカタログ指示文・`refs/*.bas` 3ファイル・`helpers/AiLineHelpers.bas` 1ファイル11+1サブ・`demo/*.xlsx` 3ファイル）。うち移植不要の言語中立資産（デモ除く）は4種類。
- GOLDEN 行数: 決定論型 **20行**（A7 + B4 + C8 + D1 = 20、全て pytest 状態M）＋ 確率的行 **9行**（E1〜E9、全て一次資料の実測アンカー付き）
- pytest 実測数: **20 件**（`python -m pytest tests --collect-only -q` で確認。`tests/test_ailine.py` 単体、README の「純ロジックのユニットテスト20件は緑」と一致）
- GOLDEN 決定論型20行が pytest 20件と**過不足なく一対一対応**（basrun は22件中20件対応で2件の余剰行があったのに対し、ailine は完全一致）
- pytest でカバーされない既知の穴: [[repair-loop]] の通し実行・[[basrun-apply-invocation]]・[[ollama-generate]]・[[basrun-path-resolution]]・[[cli-overview]] の argparse 直接検証・[[cmd-stop]]（詳細は GOLDEN.md F セクション）
- 異文字混入チェック: 済み（下記コマンド、ゼロ件）
- LF/CRLF チェック: 済み（全ノード・GOLDEN.md/CROSSING.md/ASSETS.md とも LF、書き込みは Write/Edit ツール経由でエンコーディング事故なし。golden/ の4つの `.bas` コピーはソースと `diff` でバイト一致を確認済み）
- wiki リンク整合性: 済み（node 間リンクは全て `nodes/` 配下の14ファイル名と過不足なく一致。library-basrun 側のノード名への言及は意図的に地の文にし、wiki リンク記法は使っていない ── 別ライブラリの名前空間を this-repo の `[[...]]` と混同しないため）

## 一次資料（設計時会話）からの裏取り箇所

`recall.py search "<語>"` で見つかった、設計判断の「なぜ」を裏付ける会話。中心となるのは internal session log
（2026-08-10〜11、ailine の実地デモ・basrun_spike 直後の設計判断そのものの記録）。1トピックあたり数分の検索に留め、
深追いはしなかった。

- [[load-helpers]]: few-shot だけでは `ContainsHeader` 取り違えが直らず、arcane 操作をヘルパへ閉じ込める方針へ転換した経緯（internal session log, 2026-08-10 04:49-05:29）
- [[snapshot]]: 罫線・列幅の変更が no-op ガードに検出されなかった実際の事故と、9要素への拡張による修正（internal session log, 2026-08-10 06:07-06:10）
- [[repair-loop]]: 3つの失敗モード（署名エラー・実行時エラー・no-op）が実地デモで別々に観測された記録。太字タスクが no-op として正しく検出されたが最終的に成立しなかった限界の記録（internal session log, 2026-08-10 05:02-05:06）
- GOLDEN.md E セクション（E1〜E9 全行）: 苦手層 few-shot 効果（0%→67%）・ヘルパ化前後のソート成功率・太字の native 化・DataPilot 一発成功、の実測列（internal session log, 2026-08-10 04:40〜06:16、2026-08-11 00:38-00:51）
- 太字の「環境不可」誤断とその訂正（`CharWeightAsian` 発見）は、ナギの記憶 `project_basrun_ai_line.md` にも系譜として記録されている既知の教材 ── 本棚では ASSETS.md（A6）と GOLDEN.md（E6）の両方から参照。

見つからなかった/深追いしなかった箇所はコード内コメント・README・docstring のみを根拠とし、本文中に「推測:」と明記してある
（[[prompt-assembly]] の system/user 分離理由、[[cmd-stop]] の戻り値非対称の設計意図、等）。

## 検証環境

- `python -m pytest tests --collect-only -q`（`C:\Dev\ailine` にて）: 20 件収集を確認。
- `git -C C:\Dev\ailine status --porcelain`: 空（本作業を通じてソース無変更）。
- `diff` によるバイト一致確認: `golden/01_value_format.bas` / `02_new_sheet.bas` / `05_cell_color.bas` / `AiLineHelpers.bas` の4ファイルが、それぞれのソース（`C:\Dev\ailine\refs\*` / `helpers\AiLineHelpers.bas`）と完全一致。
