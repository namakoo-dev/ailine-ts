---
name: repair-loop
description: "『生成→適用→検証→ダメなら直す』のオーケストレーション全体（何回まで・どの失敗にどのメッセージを返すか・コピー安全とレビュー導線がどこに配線されているか）を知りたい瞬間。ailine の中核"
metadata:
  node_type: library
  type: behavior
  provenance: "ailine.py:302-382; 一次資料: (internal session log, 2026-08-10 05:02-05:06)"
---

## ①何をするか

`cmd_run` は `run` サブコマンドのハンドラであり、ailine のパイプライン全体（生成→検証→適用→no-op 判定→修復）を1つの `for attempt in range(a.repair + 1)` ループで実装する。

```
for attempt in 0..repair:
    raw = ollama_generate(...)                 # [[ollama-generate]]
    code = extract_bas(raw)                     # [[extract-bas]]
    print(code)                                  # レビュー導線: 生成コードは毎回表示
    if not valid_signature(code):                # [[valid-signature]]
        修復メッセージA を messages に追記して continue
    if dry:
        表示して終了（適用しない）
    book をコピーして out_book を作る            # コピー安全
    ok, err = basrun_apply(out_book, code, ...)  # [[basrun-apply-invocation]]
    if not ok:
        修復メッセージB（err 本文込み）を追記して continue
    after = snapshot(out_book); changed = diff_snapshots(before, after)  # [[snapshot]] [[diff-snapshots]]
    if not changed:
        修復メッセージC を追記して continue
    差分を表示（レビュー導線）
    if inplace: out_book を book に move
    break
else:
    「N 回試みたが達成できなかった」
```

ループの `else`（`for`-`else`、`break` されずにループが尽きた場合）で最終失敗メッセージを出す ── Python 特有の構文だが、意味は「全試行が尽きても成功条件（`break` に到達）を満たせなかった」。

## ②なぜそうなっているか（一次資料あり ── 3つの失敗モードは設計時に別々に発見された）

★ internal session log（2026-08-10 05:02-05:06）の実地デモで、**3種類の異なる失敗モード**が実際に観測され、それぞれに専用の修復メッセージを持つ設計へ到達した:

1. **署名エラー**（05:02 実演前から想定済み）── LLM が `Sub Run(oDoc As Object)` 以外の形で書いてしまう。修復メッセージ: 「署名が違う。`Sub Run(oDoc As Object)` を1つだけ。コードのみ。」
2. **実行時エラー** ── basrun/LibreOffice 側が構文/API エラーで落ちる。修復メッセージには**エラー本文をそのまま含める**（「実行時エラー: {err}\nこれを直して」）── LLM に生の失敗理由を見せることで、次の試行で同じ間違いを避けさせる設計。
3. **no-op**（★ 最重要・basrun_spike の中核発見） ── 05:03 の実演: 「太字タスク（xlsx に出ない）を両試行とも no-op として検出し、**偽の成功を報告せず**」。これが README 冒頭の「走った ≠ できた」という ailine 全体の存在理由に直結する失敗モード。修復メッセージは「実行は成功したが文書に一切変化が無かった（no-op）。設定した API が効いていない可能性がある。別の正しい方法で書き直して。」── **これ自体は「もっと粘れ」という一般論の指示であり、[[load-helpers]] のノードで確立した「arcane な判断はヘルパに閉じ込める」という根治策とは別の、その場しのぎの再試行**である点に注意（no-op の原因が「そもそも xlsx に出せない」種類（太字の openpyxl 後付け撤去以前の状態など）だった場合、この修復メッセージだけでは直らない ── 実際、太字タスクは 2 回とも no-op のまま失敗した実演記録がある。太字の恒久解決は CONTRACT/ヘルパ側の native 対応であり、このループの修復メッセージでは救えなかった、という正直な限界）。

**コピー安全**（`shutil.copy2(book, out_book)` を basrun 呼び出し**直前**に、試行のたびに再実行する）は、「原本は触らず `.out.xlsx` に適用する」という README の柱をループ内部の各試行でも一貫させるための配置 ── 失敗した試行の痕跡が原本に残らないことを、ループの構造そのもので保証している。

## ③境界条件・エラー時挙動

- `--dry` は**署名検証の後・適用の前**で分岐する。つまり `--dry` でも署名エラーの修復サイクルは回る（生成された最初の妥当なコードが表示対象になる）。
- `a.repair=2`（既定）なら最大 3 回試行（`range(3)`）。3回とも失敗したら `for`-`else` に落ちて非0の終了コードで終わる。
- 各失敗モードの修復メッセージは `messages` リストに `assistant`（前回の生出力）→`user`（修復指示）の対で追記され、[[ollama-generate]] への次回リクエストは**会話履歴として蓄積**される（毎回ゼロから聞き直すのではない ── LLM が自分の前回の誤りを認識できる形）。
- `--json` フラグは、結果 dict（`ok`/`attempts`/`task`/`model`/`changes`/`out` 等）を標準出力の最後に1行 JSON として追加出力するだけで、成功/失敗の判定自体には影響しない。
- 3つの失敗モードは**排他的に1つずつ**しか処理されない（1試行につき最初に引っかかった失敗だけが報告される。例: 署名も実行時エラーもある場合、署名エラーの修復が先に発動し、実行時エラーの検出まで到達しない）。

## ④他単位への依存

- [[ollama-generate]]・[[extract-bas]]・[[valid-signature]]・[[basrun-apply-invocation]]・[[snapshot]]・[[diff-snapshots]] を、この順序で1つのループに組み上げる、ailine の中核オーケストレーション。
- [[prompt-assembly]] が組み立てた初期 `msgs` を受け取って開始する。
- [[cli-overview]] の `run` サブコマンドから呼ばれる唯一の実体。

## GOLDEN 対応

- 個々の構成要素（[[extract-bas]]・[[valid-signature]]・[[diff-snapshots]] 等）は pytest で機械検証されているが、**このループ自体（3失敗モードの分岐・修復メッセージの内容・`--repair` 回数制御・`--dry`/`--inplace` の分岐）を通しで検証する自動テストは無い**（README 冒頭に「純ロジックのユニットテスト20件は緑。…実機 LibreOffice を通した自動の通し試験はこれから」と明記された既知の穴）。GOLDEN.md E セクション（確率的行）が、この穴を埋める唯一の記録（実機デモの実測ログからの成功率）。
