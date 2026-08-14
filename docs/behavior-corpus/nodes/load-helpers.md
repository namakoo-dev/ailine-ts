---
name: load-helpers
description: "arcane な操作（ソート・グラフ・ピボット等）が、なぜモデルに『書かせず呼ばせる』設計になっているか、その配線を知りたい瞬間"
metadata:
  node_type: library
  type: behavior
  provenance: "ailine.py:115-143; 一次資料: (internal session log, 2026-08-10 04:49-05:29)"
---

## ①何をするか

```python
def load_helpers(helpers_dir: Path) -> tuple:
    files = sorted(helpers_dir.glob("*.bas")) if helpers_dir.is_dir() else []
    if not files:
        return "", []
    srcs = "\n".join(f.read_text(encoding="utf-8").strip() for f in files)
    catalog = (
        "\n\n## 定義済みヘルパ（★ 呼ぶだけ・再定義しない）\n"
        "arcane な操作（並べ替え等）は、自分で書かず次のヘルパを使うこと。\n"
        "★ 呼び方は必ず `Call 名前(引数)` の形（Call を付ける。括弧つきで Call 無しは誤動作する）。\n"
        "★ ヘルパの中身は絶対に書き写すな（SummaryTable 等が長くても）。必ず `Call 名前(...)` の1行だけで呼ぶ。\n"
        "例: ... （11 個の呼び出し例。ASSETS.md 参照）\n"
        f"--- 定義済み（この通り既に存在する。再定義するな）---\n{srcs}\n--- ここまで ---\n")
    return catalog, files
```

戻り値は `(catalog: str, files: list[Path])` のタプル。`catalog` はプロンプトに追記する文字列、`files` は [[basrun-apply-invocation]] が生成コードと同じライブラリへ同梱コピーする実体パスのリスト。

`load_refs`（[[load-refs]]）との構造上の違いはここ: refs は「別タスクの参考」として**渡すだけ**（LLM は真似て書き直す）。helpers は**呼び出し先そのもの**として実行時に同じ Basic ライブラリへ同梱される ── だからカタログには「中身を書き写すな、`Call` の1行だけで呼べ」という強い禁止が入っている。

## ②なぜそうなっているか（一次資料あり）

★ **この設計自体が実測に基づく方向転換の産物**。internal session log（2026-08-10）に記録がある。

**発端（04:49）**: few-shot 追加（[[load-refs]]）で苦手層は 0%→67% まで上がったが、ソート操作だけ 7B が `ContainsHeader` の真偽を毎回のように取り違えた。**API 自体は正しく選べている**のに、真偽値 1 個の判断でだけ滑る ── 知識欠落ではなく「もっともらしい方に引っ張られる」判断ミスと診断された（05:21 の言語化）。

**方向転換（05:23）**: 「ユーザ体験は自然文で頼むままで、確度だけ機械的に保証する」ため、arcane な判断（`ContainsHeader` のような、コメントで警告しても効かない類の判断）を**モデルの視界から完全に外す**方針に切り替えた。モデルには「列と向きを選んで `Call SortByColumn(oDoc, 1, False)` と書くだけ」をさせる ── 難所自体に触れないので原理的に滑りようがない。

**実証（05:27-05:29）**: ヘルパ化後、`ContainsHeader` の取り違えは完全に消えた（完全降順を実機描画で確認）。「難所はヘルパの中に隠れていて、モデルは触れない＝滑れない」という設計原理がここで確立し、以後グラフ・VLOOKUP・ピボット・太字など計 11 本のヘルパへ拡張された（README のヘルパ表・`ASSETS.md` 参照）。

## ③境界条件・エラー時挙動

- `helpers_dir` が無い/空なら `("", [])` を返す ── ヘルパ無しでも動く（ただし arcane 層の確度低下は避けられない、という [[repair-loop]]/GOLDEN の確率的行に直結）。
- カタログ文字列にはヘルパの**全ソースをそのまま埋め込む**（LibreOffice Basic の `Call` は「同じライブラリ内であること」を要求し、モデルへの事前告知としてもソース全文提示が最も誤解を生まない、という判断。トークン消費とのトレードオフだが、11 本のヘルパは比較的小さく `num_ctx=8192` に収まる範囲 ── [[ollama-generate]] 参照）。
- 「呼び方は括弧つき `Call` 必須（`Call` 無しは誤動作する）」はカタログ文中の警告としてのみ存在し、生成コード側でこの規約違反を機械的に検知する仕組みは無い（[[valid-signature]] は `Sub Run` の署名しか見ない ── 既知の未検証域）。

## ④他単位への依存

- 実際の 11 ヘルパ（`SortByColumn`/`InsertBarChart`/`MergeCells`/`InsertRows`/`DrawTableBorders`/`AutoFitColumns`/`AlignCenter`/`FormatThousands`/`VLookupFromTable`/`PivotSum`/`SummaryTable`、内部専用 `BoldRange` を含めば計 12 サブ）の中身と個々の落とし穴は `ASSETS.md` を参照。
- [[prompt-assembly]] が `catalog` を末尾に連結する。
- `files` は [[basrun-apply-invocation]] が `Gen.bas` と同じ `src/` ディレクトリへコピーする。
- GOLDEN の確率的行（E セクション）に、ヘルパ化前後の成功率差が記録されている。
