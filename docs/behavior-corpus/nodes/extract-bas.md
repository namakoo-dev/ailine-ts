---
name: extract-bas
description: "LLM の生の返答（markdown コードフェンス付きかもしれない）から、実行可能な .bas 本文だけを取り出す最小のロジックを知りたい瞬間"
metadata:
  node_type: library
  type: behavior
  provenance: "ailine.py:146-148"
---

## ①何をするか

```python
def extract_bas(text: str) -> str:
    m = re.search(r"```(?:\w+)?\s*(.*?)```", text, re.S)
    return (m.group(1) if m else text).strip()
```

正規表現で最初のコードフェンス（\`\`\`basic ... \`\`\` や \`\`\` ... \`\`\` のような言語タグ有無どちらも）を探し、中身だけを `.strip()` して返す。フェンスが無ければ、テキスト全体をそのまま（strip のみ）返す。

## ②なぜそうなっているか

- LLM（特に対話向けにチューニングされたモデル）は「コードだけ出せ」と指示しても markdown フェンスで包んで返すことがある、という実務上のありふれた振る舞いへの対処。フェンス**有り無し両対応**にしているのは、CONTRACT で「markdown 柵は禁止」と明示していても従わない場合があるため（保険）。
- `re.S`（DOTALL）フラグで複数行にまたがるコードも1回のマッチで拾える。
- 非貪欲マッチ `.*?` により、複数のフェンスブロックがあっても最初の1つだけを拾う（2個目以降を誤って連結しない）。

## ③境界条件・エラー時挙動

- フェンスが**複数個**ある応答（例: 説明文中に別のコード片が混ざる）では最初のフェンスの中身だけを採用する。CONTRACT が「出力は .bas のコードだけ」と厳命しているため、通常はこのケースは起きない想定。
- 言語タグ（`basic` 等）は無視される（`(?:\w+)?` は非キャプチャ・任意）。
- フェンスの直後の改行・空白は `.strip()` で吸収されるため、返り値の先頭/末尾に余分な空行は残らない。

## ④他単位への依存

- [[ollama-generate]] の生出力を受け取る。
- 結果は [[valid-signature]] へ渡って署名検査され、[[basrun-apply-invocation]] が `Gen.bas` としてそのまま書き出す。

## GOLDEN 対応

- `test_extract_bas_strips_markdown_fence` / `test_extract_bas_passthrough_without_fence` ── GOLDEN.md A セクション参照。
