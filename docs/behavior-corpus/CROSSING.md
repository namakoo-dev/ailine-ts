# CROSSING — 渡河可能性の分類

14 ノードを (あ) 純ロジック=そのまま渡る / (い) 構造は渡るが再設計要 / (う) プラットフォーム結合 の3分類に加え、
第二弾固有の第四分類 **(資産) 移植不要・そのまま運ぶ**（`ASSETS.md` 参照）で分ける。(う) には実装手段を指定せず、
TS 側で満たすべき**挙動要件**だけを書く ── という basrun の CROSSING.md の方針をそのまま踏襲する。

## 内訳

| 分類 | 件数 | ノード |
|---|---|---|
| (あ) 純ロジック | 12 | [[cli-overview]] [[basrun-path-resolution]] [[ollama-generate]] [[load-refs]] [[load-helpers]] [[prompt-assembly]] [[extract-bas]] [[valid-signature]] [[describe-book]] [[diff-snapshots]] [[basrun-apply-invocation]] [[cmd-stop]] |
| (い) 構造は渡るが再設計要 | 2 | [[snapshot]] [[repair-loop]] |
| (う) プラットフォーム結合 | **0** | （下記「★最大の発見」参照） |
| (資産) 移植不要・そのまま運ぶ | 5 種類（CONTRACT・ヘルパカタログ指示文・refs 3ファイル・helpers 1ファイル・demo 3ファイル） | `ASSETS.md` 参照。ノード数に対応しないため件数はここでは資産の"種類数"で数える |

## ★ 最大の発見: (う) がゼロ件

basrun（第一弾）は 18 ノード中 10 件が (う)（UNO/LibreOffice への直接結合）だった。ailine（第二弾）は **(う) が 0 件**。

理由は構造的なもの: **ailine.py 自体は LibreOffice/UNO に一切触れない。** 唯一の実行手段は [[basrun-apply-invocation]] ──
basrun.py をサブプロセスとして呼ぶだけであり、サブプロセス起動はどの言語でも等価にできる標準機能（Node なら `child_process`）。
本物のプラットフォーム結合（UNO ブリッジが Python 同梱インタプリタからしか呼べない、という basrun 側の根本原因）は
**basrun という別レイヤーに既に隔離されており、その渡河可能性は library-basrun が別途扱い済み**。ailine 側は
「LibreOffice を直接操作するコード」を一切持たず、「LibreOfficeを操作する外部プロセスを、生成コード込みで呼び出す」薄い層に徹している。

これは偶然ではなく、basrun の apply-script-contract ノード（文書を引数で渡す、`ThisComponent` に依存しない）という設計そのものが、
呼び出し元（ailine を含む任意のクライアント）を UNO の詳細から切り離すことを目的として作られたため（library-basrun 参照）。
**アーキテクチャの層分けが、移植性そのものを生んだ**、という事実が第二弾の主要な知見。

もう1つの理由: ailine が新たに扱うドメイン（ローカル LLM への HTTP 呼び出し）も、それ自体は言語非依存の標準的なネットワーク I/O
（[[ollama-generate]]）であり、UNO のような特殊ブリッジを必要としない。

---

## (あ) 純ロジック — そのまま渡る

### [[cli-overview]]
`argparse` の2サブコマンド定義・引数解析・ディスパッチは、basrun 版と同じ理由で TS の CLI ライブラリにそのまま移せる。

### [[basrun-path-resolution]]
環境変数優先→候補パス列挙という構造は basrun の office-dir ノードと同型。Node の `fs.existsSync` で等価に実装できる。

### [[ollama-generate]]
`fetch`/`node-fetch`/`http` いずれでも等価な HTTP POST。JSON ボディの形（`model`/`messages`/`stream`/`options`）は Ollama 側の API 契約であり、Python/TS どちらのクライアントでも同一の JSON を送るだけ。タイムアウト・エラーメッセージの文言はそのまま踏襲できる。

### [[load-refs]] / [[load-helpers]]
ディレクトリ走査（`glob("*.bas")`）＋ファイル名昇順ソート＋文字列連結。Node の `fs.readdirSync`+`Array.sort` で等価。**中身の資産（`refs/*.bas`・`helpers/*.bas`）自体は移植せず運ぶ** ── `ASSETS.md` 参照。

### [[prompt-assembly]]
固定順の文字列連結のみ。ロジックに移植の障害は無い。

### [[extract-bas]] / [[valid-signature]]
正規表現1本ずつ。TS の `RegExp` にそのまま移せる（basrun には存在しない種類のノードだが、性質としては basrun の port-open 相当＝標準ライブラリだけで完結する純ロジック）。

### [[describe-book]]
`sheetnames`/`max_row`/`max_column`/セル値の読み取りという、xlsx ライブラリ間でほぼ普遍的に存在する最小限の API のみを使う。TS 側（例: `exceljs`）でも `worksheet.rowCount`/`columnCount`/`getCell(r,c).value` のような対応する呼び出しへ**1:1で機械的に置き換えられる**（判断を伴う再設計は不要）。0起点の列番号表現という**意図**（[[describe-book]] ノード②参照）はそのまま持ち越すこと。

### [[diff-snapshots]]
[[snapshot]] が返す dict（キー文字列＋タプル値）を集合演算・辞書比較するだけの純粋な比較ロジック。openpyxl には一切触れない。**[[snapshot]] 自体が (い) でも、その出力を消費するこのノードは影響を受けない**（入力の「形」さえ同じであれば、生成元の実装がどう変わろうと比較アルゴリズムは無傷で持ち越せる）。

### [[basrun-apply-invocation]]
basrun の sync-cmd/pull-cmd ノードと同型の「薄い委譲」。サブプロセス起動＋引数構築＋作業ディレクトリの使い捨て、というロジック自体に移植の障害は無い。encoding 対策（`errors="replace"`）は Node 側でも文字コード変換の相当処置（`iconv-lite` 等、または単純に UTF-8 に統一）で踏襲できる。

### [[cmd-stop]]
[[basrun-path-resolution]] への薄い委譲のみ。

---

## (い) 構造は渡るが再設計要

### [[snapshot]]
**捉えるべき状態の種類（値・数値書式・背景色・太字・罫線・結合・列幅・行高・水平配置の9要素）という「仕様」はそのまま持ち越す必須要件**（[[snapshot]] ノード②の一次資料が示す通り、この列挙が1つでも欠けると no-op ガードに偽陰性の穴が開くことが実証済み）。
ただし個々の要素の**取得方法**は openpyxl 固有の API（`cell.fill.start_color.rgb`・`cell.border.left.style` 等）に強く依存しており、TS 側のライブラリ（`exceljs` 等）が持つ異なるオブジェクトモデルへ**判断を伴う再設計**が必要:
- fill/border/alignment の「未設定」表現がライブラリごとに異なる（`None` か既定値オブジェクトか）ため、[[snapshot]] が行っている正規化（`general`→`None`、`(None,None,None,None)`→`None` 等）を TS 側のモデルに合わせて作り直す必要がある。
- 「完全な既定セルは記録しない」という間引き条件も、対象ライブラリの「既定値」の定義に合わせて再設計する。
**要件（絶対に落としてはいけない）**: 9要素のうちどれか1つでも欠けると、その軸だけの変更が no-op ガードで検出されない（[[snapshot]] の一次資料にある実際の事故の再現）。TS 版で要素を追加削除する場合は、対応する GOLDEN.md C セクションの回帰テストも同数だけ用意すること。

### [[repair-loop]]
「生成→署名検証→（コピー→）適用→ no-op 判定→3種の失敗モード別修復メッセージ→リトライ」という**制御フローの形と順序**はそのまま持ち越せる。ただし内部で呼ぶ [[snapshot]] が (い) であるため、その差し替えが完了してからでないとこのノードの中身（before/after の取得箇所）を確定できない、という依存関係がある。basrun の apply-cmd ノードと同じ理由付け（構成要素の1つが再設計対象だと、それを呼ぶオーケストレーターも re-design 対象として扱う）。**要件**: 3つの失敗モード（署名エラー・実行時エラー・no-op）を区別し、それぞれ異なる修復メッセージで LLM にフィードバックすること（[[repair-loop]] ノード②の一次資料が、この区別自体が実測から生まれた設計であることを示す）。

---

## 移植の優先順位（示唆）

1. (あ) の 12 ノードは着手障壁が低く、先に固めて CLI の骨格とパイプラインの配線を作れる。
2. (資産) の5種類（`ASSETS.md`）はコピーするだけで済み、実装作業としては最軽量。ただし**先に用意しておかないと** [[load-refs]]/[[load-helpers]] の単体テストが書けない（basrun の golden/ フィクスチャと同じ役割）。
3. (い) の2ノードのうち [[snapshot]] を先に確定させること ── [[repair-loop]] はこれに依存する。[[snapshot]] の再設計では、9要素の**列挙**（何を捉えるか）を要件として固定し、**取得方法**（どう取るか）だけを TS 側ライブラリに合わせて自由に選べる、という切り分けを維持すること。
4. (う) が0件という結果自体が、**basrun の渡河（library-basrun）を先に済ませておいたことの直接的な配当**である。ailine 単体の TS 移植は、basrun の TS 版（またはサブプロセスとして呼び続ける Python 版 basrun）さえ用意できれば、UNO の知識を一切必要としない。
