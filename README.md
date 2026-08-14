# ailine-ts

TypeScript port of `ailine` — describe what you want done to a spreadsheet in
plain Japanese, a **local** LLM writes the LibreOffice Basic for it,
[`basrun`](https://github.com/namakoo-dev/basrun) applies it, and the document
is read back before and after to prove the macro actually did something.

Nothing leaves the machine. The model runs under `ollama` on localhost.

## 走った ≠ できた

That last step is the point of the tool. A macro that runs without raising is
not a macro that changed anything — LibreOffice will happily execute a
property assignment that lands nowhere and exit 0. So every run snapshots the
document before and after and compares **nine axes**:

| | | |
|---|---|---|
| cell value | number format | fill colour |
| bold | border (4 sides) | merged ranges |
| column width | row height | horizontal alignment |

plus sheet names and chart count. If nothing moved on any of them, the run is
a **no-op** — reported as a failure and fed back to the model, never as
success.

The axis list is not negotiable, and it was not arrived at cleanly: on
2026-08-10 a border + column-width change was applied correctly and reported
as 「変化なし」, because the guard was only watching value / format / fill /
bold at the time. Drop any one axis and that hole reopens — which
`tests/unit/axisAblation.test.ts` demonstrates by deleting each axis in turn
and watching the verdict flip to "unchanged".

## Commands

```
ailine run <book> "<task>" [options]
ailine stop                          shut the LibreOffice instance down
```

| option | default | |
|---|---|---|
| `--model <name>` | `qwen2.5-coder:7b` | `AILINE_MODEL` overrides the default |
| `--refs <dir>` | `./refs` | few-shot examples |
| `--helpers <dir>` | `./helpers` | verified helper macros |
| `--repair <n>` | `2` | repair retries, so 3 attempts total |
| `--temperature <f>` | `0.2` | |
| `--dry` | off | generate and show only, do not apply |
| `--inplace` | off | overwrite the original; default writes `<book>.out.<ext>` |
| `--json` | off | also print the result as one JSON line |

Env: `OLLAMA_HOST` (default `http://localhost:11434`), `AILINE_MODEL`,
`BASRUN_TS` (path to `basrun-ts`'s `dist/cli.js`; otherwise a sibling
directory is searched).

```bash
ailine run demo/sample.xlsx "金額で降順に並べ替えて"
ailine run demo/sales.xlsx  "部門ごとに金額を合計した集計表を作って" --json
ailine stop
```

## How a run goes

```
CONTRACT + refs (few-shot) + helper catalog        -> system
document description + your task                   -> user
        |
   ollama /api/chat  (localhost, stream:false)
        |
   strip markdown fence -> check `Sub Run(oDoc As Object)`
        |
   copy book -> book.out.xlsx, helpers + Gen.bas -> workdir/src
        |
   basrun apply <book.out> <src> AiLine Gen.Run
        |
   snapshot before/after -> diff -> changed?
```

Three failure modes, three different things said back to the model, up to
`--repair` times: **bad signature**, **runtime error** (the raw error text is
handed back verbatim), and **no-op**. The conversation accumulates — the model
sees its own previous attempt, it is never asked again from scratch.

## Call, don't write

`helpers/AiLineHelpers.bas` holds twelve verified macros the model may only
*call*. This exists because few-shot examples were not enough: 7B picked the
right sorting API every time and then flipped `ContainsHeader` to `True` on
roughly half of attempts — a judgment slip on one boolean, immune to comments
warning about it. Putting the arcane decision inside a helper the human
verified once removes it from the model's view entirely, and it cannot slip on
a decision it never touches.

Same reasoning for charts, pivots, VLOOKUP, native bold
(`CharWeight` + `CharWeightAsian` + `CharWeightComplex` — Japanese text does
not bold without the Asian variant).

Adding a few-shot example to `refs/`? **Verify it through basrun first.** A
broken example poisons every prompt that follows.

## Known limitation: a macro that never returns

The no-op guard answers *did it do nothing?*. Nothing in the design answers
*will it ever come back?*.

Twice while measuring the E layer, the model generated Basic containing a loop
that never terminates. LibreOffice executed it faithfully — `soffice.bin` at
546 seconds of CPU, `Responding: True`, not deadlocked, simply never
finishing — and because the apply subprocess has no timeout, the whole run
hung indefinitely. `ailine stop` then hangs too, since it waits for an
instance that will not close.

The shipped default keeps the original's behavior (no timeout). Callers that
need to bound it can pass `applyTimeoutMs` to `repairLoop`; on expiry the
child tree is killed and the failure enters the repair loop as a runtime
error, which is the honest classification — the model wrote code that does not
terminate. `tests/e/` sets it to 120s and force-kills a wedged LibreOffice by
PID between samples.

**Recommended before any unattended use**: give it a real timeout, and surface
it as a CLI flag.

## Known limitation: the first save

LibreOffice materializes row heights (sometimes column widths) the first time
it saves a book authored elsewhere. Those are two of the nine axes, so the
first apply against a fresh book reports 変化あり even for a macro that does
nothing at all:

```
pass1-fresh-book:       changed=true   ["＊行高変更: Sheet"]
pass2-already-LO-saved: changed=false  []
```

(`node tests/noopProbe.mjs` measures this.) The no-op guard is exact from the
second apply onward. This is inherited from the original rather than
introduced here — openpyxl's `row_dimensions` is likewise empty until
something writes an explicit height — and it is left as-is because the nine
axes are a hard requirement; dropping row height to paper over it would open a
real hole. `tests/e/_harness.ts` normalizes fixtures through one LibreOffice
round trip before measuring anything that depends on the guard.

## Tests

```
npm run typecheck
npm test          # unit — pure logic, no ollama, no LibreOffice
npm run test:e    # GOLDEN E — needs a live ollama and LibreOffice
```

`tests/unit/` covers all 20 deterministic rows of the behavior corpus, plus
the units the Python original never tested (argument parsing, basrun
resolution, the ollama contract, the repair loop with the LLM mocked) and the
axis ablation described above.

`tests/e/` is the probabilistic layer: real model, real LibreOffice, N samples
per row, reported as a rate with a Wilson 95% interval. These are
measurements, not gates — the same prompt does not produce the same output
twice at temperature 0.2, and the suite does not pretend otherwise. It asserts
only that each row can succeed at all.

## Provenance

Phase C artifact of a migration experiment: written entirely from
`library-ailine` — a language-neutral behavior corpus of node docs, a golden
characterization table and fixtures — without reading the Python original's
source. Source comments point back to specific nodes (`nodes/<name>.md`)
rather than re-explaining the "why" inline.

`refs/*.bas` and `helpers/AiLineHelpers.bas` are byte-for-byte copies of the
originals, not ports. They are Basic; they run inside LibreOffice; changing
the host language from Python to TypeScript gives no reason to touch a line of
them.

`basrun-ts` is a dependency, invoked as a subprocess. This project contains no
UNO code at all — that coupling lives one layer down, which is what made this
port possible without any LibreOffice knowledge.
