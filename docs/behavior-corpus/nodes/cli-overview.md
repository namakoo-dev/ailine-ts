---
name: cli-overview
description: "ailine を CLI として叩く時、2つのサブコマンドがそれぞれ何を受け取り何を返すかを知りたい瞬間の入口"
metadata:
  node_type: library
  type: behavior
  provenance: "ailine.py:390-414"
---

## ①何をするか

`ailine.py` は単一ファイルの CLI ツール。`argparse` のサブコマンドとして 2 つを持つ:

```
ailine run  <book> "<task>" [--model] [--refs] [--helpers] [--repair N]
                             [--temperature F] [--dry] [--inplace] [--json]
ailine stop                  起動した LibreOffice を落とす（basrun へ委譲）
```

エントリポイントは `main()`（basrun と同型のディスパッチ）:

```python
def main(argv=None) -> int:
    a = build_parser().parse_args(argv)
    return a.func(a)
```

### `run` の引数

| 引数 | 型 | 既定 | 意味 |
|---|---|---|---|
| `book`（位置） | str | 必須 | 対象の文書（`.xlsx` / `.ods`） |
| `task`（位置） | str | 必須 | やりたいことの自然言語タスク |
| `--model` | str | `qwen2.5-coder:7b`（環境変数 `AILINE_MODEL` で上書き可） | ollama モデル名 |
| `--refs` | str, optional | `None`（未指定なら `./refs`） | few-shot 参照ライブラリのディレクトリ |
| `--helpers` | str, optional | `None`（未指定なら `./helpers`） | 検証済みヘルパのディレクトリ |
| `--repair` | int | `2` | 失敗時の修復（再生成）の最大回数 |
| `--temperature` | float | `0.2` | LLM 生成温度 |
| `--dry` | flag | False | 生成して見せるだけ（適用しない・レビュー用） |
| `--inplace` | flag | False | 原本を上書き（既定はコピー `.out` に適用） |
| `--json` | flag | False | 結果を JSON でも標準出力に出す |

`stop` は引数無し。`basrun stop` を呼ぶだけ（[[cmd-stop]] 参照）。

## ②なぜそうなっているか

- サブコマンドが 2 つしか無いのは、ailine が「生成 → 適用 → 検証」という単一パイプラインの薄い皮であり、状態を持たない（LibreOffice の起動/停止は basrun 側に委譲）ため。
- `--repair` が既定 2（＝最大 3 回試行）なのは、[[repair-loop]] の実測（署名エラー・実行時エラー・no-op の 3 失敗モードそれぞれが 1 回の修復メッセージで直ることが多い）に基づく。無限リトライにしない理由は「効かない指示を繰り返しても直らない」という素朴な経験則。
- `--dry` と `--inplace` の両方を用意しているのは、レビュー導線（README の設計思想の柱の1つ）を CLI レベルで担保するため。**既定はコピー安全側**（`--inplace` を明示しない限り原本は触らない）。

## ③境界条件・エラー時挙動

- `book` が実在しないパスなら `run` は `sys.exit(f"文書が無い: {book}")` で即終了（LLM 呼び出しより前）。
- サブコマンド未指定は `argparse` 標準動作で失敗、終了コード 2（basrun と同型）。
- 単体テストとしての argparse 直接検証は無い（basrun の `test_subcommands_parse_minimal_argv_without_error` に相当するテストは ailine 側には存在しない ── [[repair-loop]] の GOLDEN 対応参照、既知の穴）。

## ④他単位への依存

- `run` は [[prompt-assembly]] → [[repair-loop]] へ委譲する。
- `stop` は [[cmd-stop]] へ委譲する。
- `--refs`/`--helpers` の既定パスは [[load-refs]]/[[load-helpers]] が消費する。
