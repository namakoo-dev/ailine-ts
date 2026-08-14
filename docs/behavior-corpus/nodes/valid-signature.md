---
name: valid-signature
description: "生成コードが『Sub Run(oDoc As Object)』という唯一の呼び出し契約を満たしているかを、実行前にどう機械的に確かめるかを知りたい瞬間"
metadata:
  node_type: library
  type: behavior
  provenance: "ailine.py:151-152"
---

## ①何をするか

```python
def valid_signature(code: str) -> bool:
    return re.search(r"Sub\s+Run\s*\(\s*oDoc\s+As\s+Object\s*\)", code, re.I) is not None
```

正規表現1本で、コード中のどこかに（大文字小文字を無視・空白ゆらぎを許容して）`Sub Run(oDoc As Object)` の並びがあるかを見るだけの真偽判定。

## ②なぜそうなっているか

- basrun の apply-script-contract ノード（`Sub X(oDoc As Object)` という文書を引数で受け取る契約）を、ailine 側の CONTRACT では**関数名まで固定**（常に `Run`）している。呼び出し先が固定なので [[basrun-apply-invocation]] は毎回同じ `Gen.Run` を渡すだけでよく、実行契約が単純化される。
- basrun より一段厳しい制約（basrun は任意の `Module.Sub` を許容、ailine は `Run` 固定）にしているのは、ailine が「毎回1つのタスクにつき1つの生成コードを実行する」という単一目的の道具であり、モジュール/サブ名を LLM に決めさせる自由度は不要などころか誤りの余地を増やすだけだから。
- 正規表現1本の軽量チェックにしているのは、これが実行**前**の最終ゲート（構文解析ではなく文字列パターンマッチ）であり、本当に妥当な Basic 構文かどうかは basrun 経由の実行時にしか確認できない、という役割分担（[[repair-loop]] の「署名エラー」と「実行時エラー」が別の修復メッセージを持つのはこのため）。

## ③境界条件・エラー時挙動

- 空白ゆらぎ（`Sub Run ( oDoc  As  Object )` 等）・大文字小文字ゆらぎ（`sub run(...)`）は許容される。
- 引数名や型が違う場合（`Sub Run(doc As Object)` や `Sub Run(oDoc As Variant)`）は**不一致**として弾かれる ── 実測で `Sub Other(oDoc As Object)`（別名）・`Sub Run()`（引数なし）が共に `False` になることを確認済み（GOLDEN 参照）。
- コード中に**複数の** `Sub` があっても、パターンに一致する `Sub Run(oDoc As Object)` が**どこかに**あれば `True` になる（CONTRACT の「手続きはちょうど1つ」という制約は、この関数自身では検査されない ── 実行時に basrun 側でどう扱われるかは未検証の域）。

## ④他単位への依存

- [[extract-bas]] の出力を受け取る。
- `False` の場合、[[repair-loop]] は「署名が違う」という専用の修復メッセージで LLM にやり直させる（実行には進まない）。

## GOLDEN 対応

- `test_valid_signature`（5 パラメータ: 正例2・負例3）── GOLDEN.md A セクション参照。
