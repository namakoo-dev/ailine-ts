---
name: cmd-stop
description: "ailine stop が実際に何をするか（basrun への薄い委譲）を知りたい瞬間"
metadata:
  node_type: library
  type: behavior
  provenance: "ailine.py:385-387"
---

## ①何をするか

```python
def cmd_stop(a: argparse.Namespace) -> int:
    subprocess.run([sys.executable, str(basrun_path()), "stop"], encoding="utf-8", errors="replace")
    return 0
```

`basrun stop` をサブプロセスとして呼ぶだけ。basrun 側の `stop` の実際の挙動（接続先だけを terminate し、実際に閉じるまで待つ・冪等）は library-basrun の stop-office ノードを参照 ── **ailine はこの契約を再実装せず、そのまま消費するだけ**。

## ②なぜそうなっているか

- basrun 側で既に「利用者の既定プロファイルを絶対に使わない」「冪等性」といった安全設計（実害の記録があって固められた契約）が確立しているため、ailine 側で車輪の再発明をする理由が無い。薄い委譲がそのまま正しい設計になる。

## ③境界条件・エラー時挙動

- 戻り値は常に `0`（`subprocess.run` の結果コードを見ていない）。basrun 側の `stop` が失敗しても ailine の `cmd_stop` は成功として振る舞う ── [[cli-overview]] の他の設計（`run` は basrun apply の失敗を厳密に伝播する）と非対称。TS 移植時に改善余地がある箇所として記録。

## ④他単位への依存

- [[basrun-path-resolution]] でパスを解決する。
- basrun 側の `stop` の実際の契約は library-basrun の stop-office ノードを参照。
