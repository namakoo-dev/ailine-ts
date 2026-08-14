---
name: basrun-path-resolution
description: "ailine が basrun.py をどこから見つけるかを知りたい瞬間（環境変数を通していない・checkout の並びが違う、で落ちた時）"
metadata:
  node_type: library
  type: behavior
  provenance: "ailine.py:53-64"
---

## ①何をするか

```python
def basrun_path() -> Path:
    env = os.environ.get("BASRUN")
    if env:
        return Path(env)
    for name in ("basrun", "nagi-bas"):
        p = HERE.parent / name / "basrun.py"
        if p.exists():
            return p
    sys.exit("basrun.py が見つからない: ...")
```

優先順位は 3 段:

1. 環境変数 `BASRUN` が設定されていれば、そのパスをそのまま返す（存在確認はしない ── 呼び出し側の `subprocess.run` が失敗すればそこで分かる）。
2. `ailine` と**並び**の `basrun/basrun.py`（公開 repo 名）。
3. `ailine` と並びの `nagi-bas/basrun.py`（作者ローカルの旧ディレクトリ名 ── 実在する開発環境の残骸で、公開版では意味を持たないが害も無いので残している）。
4. どれも無ければ `sys.exit()` で、clone 手順込みのメッセージを出して終了。

## ②なぜそうなっているか

- ailine は basrun に依存するが、basrun を bundle しない（別 repo・別ライセンス管理）。**「並びに clone する」がデフォルトの想定構成**であり、環境変数はそれを上書きする脱出口。
- `env` を存在確認しないのは、basrun 自体は「LibreOffice を実際に駆動できるか」で初めて意味のある失敗が起きるツールであり、ここで先取りしてチェックしても二重の失敗メッセージになるだけだから（実際の失敗は [[basrun-apply-invocation]] の subprocess 呼び出し側で拾われる）。

## ③境界条件・エラー時挙動

- 候補が両方存在する場合（`basrun` と `nagi-bas` が両方あるローカル環境）は `basrun` が優先される（タプルの並び順）。
- エラーメッセージには実際に探した場所は含まれない（basrun 側の office-python ノード相当の「探索したディレクトリを含む」という厳密さは無い ── 既知の非対称、TS 移植時に改善余地）。

## ④他単位への依存

- [[basrun-apply-invocation]] が呼ぶ唯一の消費者。
- [[cmd-stop]] も同じ関数を呼ぶ。
