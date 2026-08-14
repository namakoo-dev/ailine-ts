---
name: basrun-apply-invocation
description: "生成した .bas をどうやって実際の文書に適用するか（basrun への委譲の中身）を知りたい瞬間。cp932 事故の回避もここ"
metadata:
  node_type: library
  type: behavior
  provenance: "ailine.py:279-295"
---

## ①何をするか

```python
def basrun_apply(book: Path, code: str, workdir: Path, helper_files=()) -> tuple:
    src = workdir / "src"
    if src.exists():
        shutil.rmtree(src)
    src.mkdir(parents=True)
    for hf in helper_files:
        shutil.copy2(hf, src / hf.name)
    (src / "Gen.bas").write_text(code, encoding="utf-8")
    p = subprocess.run(
        [sys.executable, str(basrun_path()), "apply", str(book), str(src), "AiLine", "Gen.Run"],
        capture_output=True, text=True, encoding="utf-8", errors="replace")
    raw = (p.stdout or "") + "\n" + (p.stderr or "")
    if p.returncode != 0:
        return False, raw.strip()[-800:], raw
    return True, None, raw
```

処理は3段:
1. `workdir/src` を**毎回作り直す**（既存があれば `rmtree` してから `mkdir`）── 前回試行の残骸を持ち越さない。
2. [[load-helpers]] が返した `helper_files` を同じ `src/` にコピーし、生成コードを `Gen.bas` として書き出す ── これで basrun からは「1つのライブラリ（`AiLine`）に複数モジュール（`Gen` + ヘルパ群）がある」状態に見える。
3. `basrun apply <book> <src> AiLine Gen.Run` をサブプロセスとして呼ぶ（basrun 側の契約は library-basrun の apply-cmd/apply-script-contract ノードを参照）。呼び出すのは常に固定で `AiLine` ライブラリの `Gen.Run`（[[valid-signature]] が保証する署名と対応）。

戻り値は `(ok: bool, error_or_None: str|None, raw_output: str)`。`error_or_None` は失敗時のみ、標準出力+標準エラーの**末尾800文字**（basrun/LibreOffice のエラーメッセージは冒頭より末尾に核心があることが多いという経験則）。

## ②なぜそうなっているか

- `encoding="utf-8", errors="replace"` を明示しているのは、Windows 環境での既定コンソールエンコーディング（cp932）と、LibreOffice/basrun 側が UTF-8 で出す出力の不一致による**文字化け例外**（デコード失敗でプロセス自体がクラッシュする事故）を避けるため。コードコメントに「★ cp932 事故を避ける」と明記されている ── basrun 側にも同種の cp932 対策（library-basrun 参照）があり、パターンが呼び出し元まで伝播している。
- `src` を毎回作り直すのは、[[repair-loop]] が複数回試行する際に**前回の Gen.bas が残って混線する**事故を防ぐため（basrun の同期はディレクトリ単位の差分同期であり、古いファイルを消し忘れるとライブラリに残り続ける ── library-basrun の obasync-dependency-contract ノードの双方向差分同期の性質と対応）。
- ヘルパを毎回同梱コピーしているのは、[[load-helpers]] のノードで確立した設計原理（arcane な操作はヘルパに閉じ込め、モデルは `Call` するだけ）を**実行時にも成立させる**ため ── 生成コードから `Call SortByColumn(...)` が呼べるのは、同じライブラリに `SortByColumn` の定義が実際に存在するから。

## ③境界条件・エラー時挙動

- `book` はこの関数の呼び出し前に、[[repair-loop]] が既にコピー（`.out.xlsx`）を作った**後**の状態で渡される（コピー安全は呼び出し側の責務 ── [[repair-loop]] 参照。この関数自体は「渡された book をそのまま処理する」だけで、原本か複製かを区別しない）。
- basrun 自体の失敗理由（LibreOffice が起動していない・Module.Sub 形式エラー・実行時エラー等）は区別されず、すべて `ok=False` の1本にまとまる。[[repair-loop]] 側もこれを一律「実行時エラー」として扱い、原因別の修復メッセージは出さない（basrun 側が返すエラーメッセージの生テキストをそのまま LLM に見せることで対処している）。
- サブプロセス自体の起動失敗（`basrun_path()` が返すパスに実体が無い等）はここでは捕捉されない ── `subprocess.run` が `FileNotFoundError` を送出し、[[repair-loop]] を素通りしてプロセスを落とす（未処理）。

## ④他単位への依存

- [[basrun-path-resolution]] で解決したパスを使う。
- basrun 自体の apply 契約（同期→実行→保存、`Sub X(oDoc As Object)` 呼び出し規約）は library-basrun の apply-cmd/apply-script-contract ノードを参照 ── **ailine はこの契約を消費するだけで、再実装していない**。
- [[repair-loop]] が唯一の呼び出し元。
