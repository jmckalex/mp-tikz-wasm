# 11 — Milestones

Each milestone has a **gate**: a thing that either works or does not. Do not
move on with a gate open — the whole point of the ordering is that each stage
de-risks the next.

## M0 — Foundations

* Repo layout (`docs/03` §2), pinned vendor sources, `SOURCES.lock`.
* `scripts/extract-vendor.sh`, `scripts/apply-patches.sh`, `scripts/verify-pin.sh`.
* Native `ctangle` build; all nine `.w` files tangle.
* `w2c/config.h` shim; all modules compile natively against bare libc.
* **L0 contract harness** (`docs/09` §2) — the highest-value thing in this
  milestone. Port `reference/host_shim_reference.c` into `test/contract/` and
  assert every CONTRACT from `docs/04`.
* CI: build + L0 on Linux and macOS.

**Gate:** `make contract` passes, and `verify-pin.sh` confirms `extensions`,
`make_text` and `mpx_run_dvitomp` exist in the pinned source.

## M1 — `mplib.wasm`, geometry only

* Emscripten build, `mpwasm_api.c` with `new`/`run`/`figure_*`/`free`.
* No VFS yet: `plain.mp` compiled in via `--preload-file`.
* SVG and EPS backends wired, with the drain rule.
* Determinism: fixed seed, frozen date.
* **Measure** cold start and the `plain.mp` parse cost (open question Q2).
* Run `mptrap` early, even if it fails — you want to know now (risk R4).

**Gate:** `beginfig(1); draw fullcircle scaled 100; endfig; end.` produces EPS
byte-identical to the oracle.

## M2 — VFS and bundles

* `find_file` search engine; Emscripten FS integration; MEMFS + NODEFS.
* Bundle manifest format, `build-bundle.py`, the `core` bundle.
* Lazy loading: sync-XHR path first, `Atomics` path second.
* IndexedDB asset cache.

**Gate:** in a browser, `input graph; input boxes;` works, and a second page
load fetches nothing.

## M3 — Text without TeX (tier 0)

* `cm-tfm` and `cm-type1` bundles; `mpost.map`.
* TFM metrics correct; `prologues:=3` glyph outlines correct.
* The SVG post-pass (`docs/07` §3.1).

**Gate:** `label.top("MetaPost",(0,50))` produces SVG with `<use>` glyph
references identical to the oracle. *This is already known to work — it was
verified during scoping — so the gate is about the VFS and bundle plumbing.*

## M4 — `tex.wasm`

* Build pdfTeX in DVI mode (Route A, falling back to Route B).
* kpathsea to wasm; generated `texmf.cnf`; `/texmf` mount.
* `scripts/make-format.mjs` builds `plain.fmt` with the wasm engine itself.
* One instance per invocation; collect DVI, log and exit code.

**Gate:** `tex.wasm` compiles a reference `.tex` to a `.dvi` byte-identical to
the oracle's.

## M5 — The TeX Bridge, plain TeX

* Patch 0001 (`mpx_run_mpto`); `mpwasm_mpto`, `mpwasm_dvitomp`.
* The TS scanner, validated against the C oracle.
* Batch job builder; `.mpx` splitter; L1 + L2 caches.
* `make_text` trampoline; the fixpoint loop.

**Gate:** all seven acceptance tests in `docs/05` §11 pass with plain TeX; a
40-block document runs TeX once.

## M6 — LaTeX

* `latex.fmt` built by `make-format.mjs`; `latex-core` bundle.
* Engine auto-detection (`-tex=`, `%&latex`, `\documentclass` sniff).
* Package-on-demand loading; the `font → package` index.
* TeX error mapping back to file + line + snippet.
* Virtual font (`.vf`) support if needed (open question Q5).

**Gate:** `reference/mpx-samples/latex-math.mp` renders identically to the
oracle, including the amsmath display.

## M7 — The product

* Full TS API (`docs/08`); the worker; progress and log streaming.
* JSON and binary figure backends.
* `runscript` bridge and the `makeText` override.
* The CLI, with `--dvitomp` mode.
* Diagnostics parser.
* Docs site + the CodeMirror live-editor demo.

**Gate:** API frozen, `reference/api.d.ts` matches the implementation, the demo
compiles a LaTeX-labelled figure in the browser from a cold cache.

## M8 — Conformance

* `mptrap` passes.
* The golden corpus (`docs/09` §L2) is byte-clean.
* Differential run over `texmf-dist/metapost/**` triaged to zero unknowns.
* Native fuzzing for 24 h with no crash.
* Full CI matrix green.

**Gate:** all of the above, plus the performance table in the README is real.

## M9 — Hardening and extras

* Size work against the `docs/10` budget.
* PNG (SVG rasterisation first; cairo only if measurements justify it).
* `binary`/`interval` number systems (GMP + MPFR + MPFI to wasm) — optional.
* JSPI variant behind a flag (open question Q4).
* `MetaPostPool` for batch work.
* 1.0 release, LGPL compliance artefacts published.

## Sequencing notes

* M1–M3 are largely independent of M4–M6. If two people are working, split
  there — the interface between them is the `.mpx` chunk format, which is
  already specified and has a real sample in `reference/mpx-samples/`.
* M4 is the schedule risk. Start the `tex.wasm` build spike **during M1**, in
  parallel, so its cost is known before it is on the critical path.
* Do not defer `mptrap` to M8. Run it from M1 and watch it improve.
