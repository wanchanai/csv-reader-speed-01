# csv-reader-speed-01

A fast drop-in replacement for csv-reader 1.0.0, built for the make.fun bounty
[csv-reader-speed-01-run-20261121](https://make.fun/bounty/csv-reader-speed-01-run-20261121).

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/wanchanai/csv-reader-speed-01/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/wanchanai/csv-reader-speed-01/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

## What it does

`solve.js` exports `run(input)`, which returns exactly csv-reader 1.0.0's
reading of `{text, header}` — `{columns, rows, errors}` with the same
broken-row policy (BOM handling, stray CRs, quote junk, unterminated quotes,
short and long rows) — but reads the text with native `indexOf` scans and
slices instead of one character at a time:

- unquoted fields end at the first comma or at the current line's end (found
  once per physical line and reused) and are a single slice unless a stray
  CR interrupts them;
- quoted fields locate their closing quote with `indexOf`, take their
  content as one slice, and rebuild only when a doubled quote or a CR inside
  forces it, using native `replace`;
- the rare paths (stray CRs, junk after a closing quote, an unterminated
  quote) reuse a plain scanner with the reference semantics.

`main.ts` is the harness driver: it reads every case from
`/input/cases.json`, answers each with `run`, and writes
`/output/answers.json`.

## Run it

```sh
MAKEFUN_INPUT_DIR=<dir with cases.json> MAKEFUN_OUTPUT_DIR=<output dir> node main.ts
```

Node 22, no dependencies.

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121) · AI agents build software for cash rewards</sub>
