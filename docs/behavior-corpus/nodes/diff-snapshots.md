---
name: diff-snapshots
description: "no-op ガードの判定本体（変化した/していない）と、人が読める差分表示が、それぞれ何を根拠にしているかを知りたい瞬間"
metadata:
  node_type: library
  type: behavior
  provenance: "ailine.py:226-272"
---

## ①何をするか

```python
def diff_snapshots(before: dict, after: dict) -> tuple:
    lines = []
    added = [s for s in after["sheets"] if s not in before["sheets"]]
    removed = [s for s in before["sheets"] if s not in after["sheets"]]
    # ... シート追加/削除、グラフ数、結合、列幅/行高、セル の5系統を個別に集計 ...
    changed = bool(added or removed or (after["charts"] != before["charts"])
                   or merge_changes or dim_changes or cell_changes)
    return changed, lines
```

戻り値は `(changed: bool, lines: list[str])`。`changed` が no-op ガードの判定本体（[[repair-loop]] がこれを見て「実行は成功したが変化が無い」を検出する）。`lines` は人間向けの差分表示（[[repair-loop]] が毎回コンソールに出す・レビュー導線の核）。

[[snapshot]] が捉える 6 軸（シート・グラフ・結合・列幅/行高・セル）を**個別に**集計し、いずれか1つでも差があれば `changed=True`。セルの差分表示は**最大12件**まで個別行を出し、それを超えたら「…ほか N セル」で件数のみに切り替える（大量差分でログが埋まるのを防ぐ）。

## ②なぜそうなっているか

- 「6 軸のどれか1つでも変化していれば True」という**OR 判定**にしているのは、[[snapshot]] のノードで記録した実際の事故（罫線だけの変更が no-op と誤判定された）を踏まえ、**どの軸の変化も見逃さない**ことを最優先にした設計。逆に「何がどれだけ変わったか」の重み付けはしていない（1セルの微修正もグラフ全部作り直しも同じ「変化あり」として扱う ── no-op ガードの目的は「何もしていない」の検出であって、変更量の評価ではないため）。
- セル差分の12件上限は、README/CLI が「差分を見て正しいか人が判断する」というレビュー導線を重視する設計（README「★検証をループに」参照）である一方、大量置換タスク（例: 全セルの書式変更）でコンソールが埋まって**逆にレビューしにくくなる**ことを避けるための実務的な妥協。
- 変化していない場合 `lines == []` を保証する（`test_diff_noop_when_unchanged` で検証済み）── [[repair-loop]] が「変化なし」の場合に空の差分表示をそのまま出しても違和感が無いようにするため。

## ③境界条件・エラー時挙動

- シートの**追加**と**削除**は別々に集計される（同時に起きても両方カウントされる）。
- 列幅/行高の差分表示は「シート名単位」（`＊列幅変更: Sheet` のように）で、どの列が何から何に変わったかまでは出さない（セル差分ほど細かくない ── 実務上、列幅は数値そのものより「変わったかどうか」の関心が中心という判断）。
- 結合セルの差分は「追加された結合」「解除された結合」を集合差分（`before - after` / `after - before`）で個別に列挙する（12件上限の対象外 ── 結合の変更頻度は通常セルより低いという前提での設計、ただし大量結合の場合の挙動は未検証）。

## ④他単位への依存

- [[snapshot]] の出力を2つ受け取る唯一の消費者。
- `changed` は [[repair-loop]] の no-op ガード判定に、`lines` はコンソール表示とレビュー導線に使われる。

## GOLDEN 対応

- `test_diff_detects_value_change` / `test_diff_noop_when_unchanged` / `test_diff_detects_new_sheet` / `test_diff_detects_fill_only_change` / `test_diff_detects_border_only_change` / `test_diff_detects_merge` / `test_diff_detects_colwidth` / `test_diff_detects_align_only_change` ── GOLDEN.md C セクション、8 件全て対応。ailine の pytest スイート20件中8件（4割）がこのノードに集中しており、no-op ガードが実験全体で最も重点的に機械検証されている単位であることを示す。
