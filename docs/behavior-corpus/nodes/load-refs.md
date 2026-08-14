---
name: load-refs
description: "few-shot 参照例（refs/*.bas）が、どんな形でプロンプトに連結されるかを知りたい瞬間"
metadata:
  node_type: library
  type: behavior
  provenance: "ailine.py:103-112"
---

## ①何をするか

```python
def load_refs(refs_dir: Path) -> str:
    if not refs_dir.is_dir():
        return ""
    chunks = []
    for f in sorted(refs_dir.glob("*.bas")):
        chunks.append(f"--- 参考例: {f.stem} ---\n{f.read_text(encoding='utf-8').strip()}")
    if not chunks:
        return ""
    return "\n\nこれらは正しい書き方の参考（別タスク）:\n" + "\n".join(chunks) + "\n--- 参考ここまで ---\n"
```

`refs_dir` 配下の `*.bas` を**ファイル名昇順**で読み、`--- 参考例: <stem> ---` の見出し付きで連結する。ディレクトリが無い/空なら空文字列（プロンプトへの影響ゼロ）。

## ②なぜそうなっているか

- few-shot 例をファイル置くだけで追加できる設計にしているのは、README に明記された運用ルール「**追加する参照は、必ず basrun で動作検証してから置くこと。動かない例は few-shot を毒する**」を支える ── コード変更ゼロで実験できることが、検証サイクルを回す前提になっている。
- ファイル名昇順にしているのは決定論性（同じ `refs/` の中身なら毎回同じプロンプトになる ── LLM 出力の再現性の土台）。
- 見出し形式「別タスク」と明示しているのは、LLM が few-shot 例をそのまま今回のタスクの答えと混同しないための注意書き。

## ③境界条件・エラー時挙動

- 空ディレクトリと非存在ディレクトリは同じ扱い（空文字列）── 呼び出し側で分岐する必要が無い。
- 読み込みエンコーディングは `utf-8` 固定。BOM 付き `.bas` や CRLF 改行の扱いは未検証（`.strip()` は前後の空白のみ除去、内部の改行コードはそのまま連結される）。

## ④他単位への依存

- 実際に同梱されている few-shot 資産の中身は `ASSETS.md`（`refs/01_value_format.bas` / `02_new_sheet.bas` / `05_cell_color.bas`）を参照。
- [[prompt-assembly]] が `CONTRACT` の直後に連結する。
