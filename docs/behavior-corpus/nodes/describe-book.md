---
name: describe-book
description: "LLM に文書の形（シート名・見出し・列番号）をどう見せているかを知りたい瞬間。列を文字でなく数字で渡す理由もここ"
metadata:
  node_type: library
  type: behavior
  provenance: "ailine.py:78-80,159-174"
---

## ①何をするか

```python
MAX_ROWS = 1000
MAX_COLS = 64

def describe_book(path: Path) -> str:
    wb = openpyxl.load_workbook(path, read_only=True)
    lines = [f"シート一覧: {wb.sheetnames}（1枚目 = {wb.sheetnames[0]!r}）"]
    ws = wb[wb.sheetnames[0]]
    nrow, ncol = ws.max_row or 0, ws.max_column or 0
    lines.append(f"1枚目のデータ範囲: 約 {nrow} 行 x {ncol} 列（列は 0 起点で 0..{max(ncol-1,0)}）。")
    headers = []
    for c in range(1, min(ncol, MAX_COLS) + 1):
        v = ws.cell(row=1, column=1 + (c - 1)).value
        if v not in (None, ""):
            headers.append(f"列{c-1}={v}")
    if headers:
        lines.append("行0(見出し): " + ", ".join(headers))
    lines.append("行1以降がデータ。")
    wb.close()
    return "\n".join(lines)
```

対象文書（`read_only=True` で開く ── 説明生成だけなので書き込み不要）の1枚目シートについて、(1) 全シート名一覧、(2) おおよそのデータ範囲（行数×列数）、(3) 見出し行（行0）の**列番号=値**という形の一覧、を3行程度のテキストにまとめる。

**列番号は常に 0 起点**で表現する（`列0=商品` のように）。これは CONTRACT が LLM に要求する `getCellByPosition(列, 行)` の座標系（0起点）と完全に一致させるための意図的な選択。

## ②なぜそうなっているか

- 列を「A」「B」のような文字でなく数字で見せているのは、CONTRACT 自体が「列を文字("A")で指す API は使わない（例外で静かに止まる）」と明記する UNO/Basic 側の実際の罠（`refs/01_value_format.bas` のコメント参照 ── `Cells(Rows.Count, "A").End(xlUp)` 相当が静かに例外を投げる）と対応させるため。LLM に見せる説明と、LLM が書くコードの座標系を統一することで、説明→コードの変換過程での取り違えを構造的に防いでいる。
- `MAX_ROWS=1000`/`MAX_COLS=64` の上限は、病的に巨大な文書で説明生成やヘッダ走査が暴走しないための安全弁（実際の見出し検出ループは `min(ncol, MAX_COLS)` で頭打ち）。
- `read_only=True` で開いているのは、この関数が文書の**内容を変えない**（[[snapshot]] とは異なり before/after の対にならない、1回だけの読み取り）ことの表明。

## ③境界条件・エラー時挙動

- `max_row`/`max_column` が `None`（完全に空のシート）の場合は `0` にフォールバックする（`or 0`）。
- 見出し行に値が無い列（`None` または空文字列）はヘッダ一覧から**省かれる**（連番が飛ぶ可能性がある ── 例: 列0と列2に値があり列1が空なら「列0=商品, 列2=単価」と表示され、LLM は列1の存在を見出しからは知り得ない。実データの値そのものからは推測できる可能性はあるが、この関数の責務外）。
- 見出し行が全て空の場合、「行0(見出し)」の行自体が出力されない（`if headers:` のガード）。

## ④他単位への依存

- [[prompt-assembly]] が `user` メッセージの先頭に埋め込む。
- MAX_ROWS/MAX_COLS の定数は [[snapshot]] とも共有される（同じファイル冒頭で定義）。

## GOLDEN 対応

- `test_describe_book_lists_headers` ── GOLDEN.md D セクション参照。
