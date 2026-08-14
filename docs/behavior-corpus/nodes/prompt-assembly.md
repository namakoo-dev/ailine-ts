---
name: prompt-assembly
description: "LLM に渡す system/user メッセージが、CONTRACT・few-shot・ヘルパカタログ・文書説明・タスク文から、どの順番でどう組み立つかを知りたい瞬間"
metadata:
  node_type: library
  type: behavior
  provenance: "ailine.py:66-76,306-312"
---

## ①何をするか

```python
system = CONTRACT + load_refs(refs_dir) + helper_catalog
desc = describe_book(book)
user = f"{desc}\n\nタスク:\n{a.task}\n\n`Sub Run(oDoc As Object)` を1つだけ書け。コードのみ。"
msgs = [{"role": "system", "content": system}, {"role": "user", "content": user}]
```

`system` メッセージは 3 資産の**固定順連結**: `CONTRACT`（契約テキスト、`ASSETS.md` 参照）→ [[load-refs]] の出力（few-shot） → [[load-helpers]] の出力（ヘルパカタログ）。

`user` メッセージは [[describe-book]] が生成した文書説明 → 利用者のタスク文（そのまま） → 出力形式の念押し（`Sub Run(oDoc As Object)` を1つだけ・コードのみ）。

この `msgs` が [[repair-loop]] の初回リクエストになり、以降の修復サイクルでは `{"role": "assistant", ...}` / `{"role": "user", ...}` の追記でチャット履歴として伸びていく。

## ②なぜそうなっているか

- `CONTRACT` を先頭固定にしているのは、LLM が**毎回**厳守すべき制約（署名・0起点セル・列を文字で指さない等）を、few-shot やヘルパカタログの分量に関わらず必ず視界の先頭に置くため（コンテキストウィンドウが埋まっても優先度が最も高い情報を失わせない配置）。
- `desc`（文書説明）を `system` でなく `user` に置いているのは、対象文書はタスクごとに変わる**可変情報**であり、固定契約（system）と分離することでプロンプトの再利用性・可読性を保つため（推測: コードコメントにこの意図の明示は無い）。
- 出力形式の念押しを毎回の `user` メッセージ末尾に繰り返しているのは、[[valid-signature]] が機械的に検査する契約（`Sub Run(oDoc As Object)`）を、LLM 側にも繰り返し思い出させるため。

## ③境界条件・エラー時挙動

- `system` の合計サイズは `CONTRACT`（固定・小）＋ `refs/*.bas` 全文（ファイル数に比例）＋ `helpers/*.bas` 全文（ファイル数に比例）で、[[ollama-generate]] の `num_ctx=8192` を超えるとモデル側で古い部分が切り詰められる可能性がある（未検証・現状の資産量では実害の報告は無い）。
- `desc` が空（`describe_book` が例外を投げるほど壊れた文書）の場合の挙動は [[describe-book]] 側の契約に従う（未処理の例外は `cmd_run` を素通りしてプロセスを落とす）。

## ④他単位への依存

- [[load-refs]]・[[load-helpers]]・[[describe-book]] の出力を合成する。
- 合成結果は [[ollama-generate]] へ渡り、[[repair-loop]] が繰り返し呼ぶ。
- `CONTRACT` 本文は言語非依存の資産 ── `ASSETS.md` を参照。
