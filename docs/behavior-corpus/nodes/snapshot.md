---
name: snapshot
description: "no-op ガードが『何を見て変化したと判定するか』の実体を知りたい瞬間。値だけ見ていると罫線/列幅/結合/中央揃えだけの変更を見逃す、という実際に踏んだ穴がここ"
metadata:
  node_type: library
  type: behavior
  provenance: "ailine.py:78-80,177-223; 一次資料: (internal session log, 2026-08-10 06:07-06:10)"
---

## ①何をするか

```python
def snapshot(path: Path) -> dict:
    wb = openpyxl.load_workbook(path)
    snap = {"sheets": list(wb.sheetnames), "charts": _charts_count(path),
            "cells": {}, "merges": {}, "colw": {}, "rowh": {}}
    for name in wb.sheetnames:
        ws = wb[name]
        nrow = min(ws.max_row or 0, MAX_ROWS)
        ncol = min(ws.max_column or 0, MAX_COLS)
        for r in range(1, nrow + 1):
            for c in range(1, ncol + 1):
                cell = ws.cell(row=r, column=c)
                val = cell.value
                fill = str(cell.fill.start_color.rgb) if cell.fill and cell.fill.patternType else None
                bold = bool(cell.font.bold) if cell.font else False
                numfmt = cell.number_format
                bd = cell.border
                bsig = (bd.left.style, bd.right.style, bd.top.style, bd.bottom.style) if bd else None
                if bsig == (None, None, None, None):
                    bsig = None
                align = cell.alignment.horizontal if cell.alignment else None
                if align == "general":
                    align = None
                if (val in (None, "") and fill is None and not bold
                        and numfmt == "General" and bsig is None and align is None):
                    continue   # 完全な既定セルは記録しない（辞書サイズを抑える）
                snap["cells"][f"{name}!{r},{c}"] = (val, numfmt, fill, bold, bsig, align)
        snap["merges"][name] = sorted(str(rng) for rng in ws.merged_cells.ranges)
        snap["colw"][name] = {k: round(d.width, 2) for k, d in ws.column_dimensions.items() if d.width}
        snap["rowh"][name] = {k: round(d.height, 2) for k, d in ws.row_dimensions.items() if d.height}
    wb.close()
    return snap
```

文書全体の「観測可能な状態」を1つの dict にする。捉えるのは **8 種類**:
1. シート名一覧
2. グラフ数（`_charts_count`: zip 内の `.../charts/chart*.xml` を数える）
3. セルごとの `(値, 数値書式, 背景色, 太字, 罫線シグネチャ, 水平配置)` の6要素タプル ── 「完全な既定状態」のセルは辞書に入れない（差分を軽くするための間引き）
4. シートごとの結合範囲一覧（ソート済み文字列）
5. 列幅（設定されている列のみ）
6. 行高（設定されている行のみ）

## ②なぜそうなっているか（一次資料あり ── 現在の8要素は実測で穴を埋めて到達した形）

★ **この関数の「何を捉えるか」のリストは、一発で正しく設計されたものではない。実際に見逃しが起きて拡張された履歴がある。**

internal session log（2026-08-10 06:07）に記録: デモ中、罫線と列幅の変更タスクで、**モデルは正しくヘルパを呼び、ヘルパも正しく実行された（LibreOffice 側では実際に変わっている）のに、no-op ガードが「変化なし」と誤判定した**。原因は当時の `snapshot` が値・数値書式・背景色・太字**しか**記録していなかったこと（罫線・結合・列幅・行高・水平配置は未対応だった）。

これは basrun 側の stop-office ノードの教訓「設定した ≠ 動く」の**逆側の失敗モード**にあたる ── 「動いた ≠ 検出できた」。ツール自体は正しく動作していたのに、検証（no-op ガード）が節穴で偽陰性（実際は成功なのに失敗と誤判定）を出した。README がこの関数のコメントで「これで『書式のみ・罫線のみ・列幅のみ・結合のみ・中央揃えのみ』の変更も『変化した』と検出でき、no-op 誤検出（＝効いているのに失敗扱い）を防ぐ」と明記しているのは、この実際の事故の直接の言い換え。

修正は同日中（06:08）に反映され、19→22 テストへ拡張、罫線・列幅とも検出できることを再デモで確認済み（06:08-06:10）。

**設計原理として持ち越すべきもの**: no-op ガードの信頼性は「検証対象の操作の種類だけ状態を捉えているか」に**完全に依存する**。新しいヘルパ（例: フォント種類を変える、セル内改行を変える等）を追加するときは、`snapshot` が対応する軸を持っているか毎回確認する必要がある ── 対応していない軸の変更は「実行は成功したのに no-op として誤って修復ループに回される」という偽陰性を生む。

## ③境界条件・エラー時挙動

- `MAX_ROWS=1000`/`MAX_COLS=64` を超える範囲の変更は捕捉されない（[[describe-book]] と定数を共有）。
- 「完全な既定状態」のセル（値なし・塗りなし・太字でない・書式が `General`・罫線なし・配置が既定）は記録しない間引きがある。**この間引き基準自体が捕捉軸を規定する** ── 間引き条件に含まれない新しい軸（例: フォント名）を追加で捉えたい場合、この関数を拡張しない限り検出できない。
- `fill`/`bold`/`bsig`/`align` はいずれも「無ければ `None`」に正規化される（`general` 配置は `None` 扱い等）。これにより「明示的に既定値を設定した」ケースと「一度も触っていない」ケースが**区別されない**（例: 中央揃えを一度設定してから明示的に「標準」に戻した場合と、最初から一度も配置に触っていない場合は、どちらも `align=None` として同一視される）。基本的には無害だが、往復操作の冪等性を厳密に検証したい場合は注意。
- グラフの中身（種類・色・タイトル文字列等）は数だけ見る。「グラフの見た目が変わったが数は同じ」変更は検出されない（実測での確認は無い ── D セクション同様、目視確認の領域）。

## ④他単位への依存

- [[diff-snapshots]] が before/after の2つの `snapshot()` 結果を比較する。
- [[repair-loop]] が apply の直前と直後で1回ずつ呼ぶ。
- `MAX_ROWS`/`MAX_COLS` は [[describe-book]] と共有。

## GOLDEN 対応

- 直接の単体テストは無いが、`snapshot()` は [[diff-snapshots]] の全テストで間接的に呼ばれ検証されている（GOLDEN.md C セクション参照）。
