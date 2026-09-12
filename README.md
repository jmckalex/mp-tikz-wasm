# MetaPost-WASM

**MetaPost in the browser and in Node.** John Hobby's MetaPost (the `mplib`
library maintained by Taco Hoekwater and Luigi Scarso in TeX Live 2025,
MetaPost 2.11) and pdfTeX 1.40 (DVI mode) are compiled to WebAssembly and
wrapped in a TypeScript API. MetaPost source goes in; SVG with real glyph
outlines, EPS/PostScript, and a structured JSON figure model come out —
including `btex … etex` / `verbatimtex … etex` labels typeset by plain TeX
or LaTeX, entirely client-side.

```ts
import { MetaPost } from 'metapost-wasm';

const mp = await MetaPost.create();
const result = await mp.run(`
  verbatimtex \\documentclass{article}\\usepackage{amsmath}\\begin{document} etex
  beginfig(1);
    draw fullcircle scaled 100;
    label.top(btex $\\displaystyle\\int_0^\\infty e^{-x^2}dx=\\frac{\\sqrt\\pi}{2}$ etex, (0,50));
  endfig;
  end.
`);
document.body.innerHTML = result.figures[0].svg;
```

The output is **byte-identical to native `mpost`** from TeX Live 2025 on the
golden corpus (EPS and SVG, plain TeX and LaTeX labels included), because it
*is* MetaPost — the C output is left untouched; every deviation from upstream
lives in a numbered, explained patch in [`patches/`](patches/).

## Try it

```sh
npm run demo            # then open http://localhost:8080/site/
```

The demo (`site/`) is a live editor with a gallery: geometry, labels without
TeX, plain-TeX and LaTeX labels (amsmath, amssymb, tabular), `boxes.mp`,
`graph.mp`, recursion, clipping, JSON output and diagnostics. Everything runs
in a Web Worker; fonts, macro packages and formats are fetched lazily from
static files and cached by the browser.

## What is in the box

| Artifact | Size | What it is |
| --- | --- | --- |
| `dist/mplib.wasm` | 1.2 MB | MetaPost 2.11: interpreter, PostScript + SVG backends, Type 1 font machinery, TFM reader, `scaled`/`double`/`decimal` arithmetic, `mpto` + `dvitomp` |
| `dist/tex.wasm` | 1.1 MB | pdfTeX 1.40.27 in DVI mode (= `tex`, `etex`, `latex`) with kpathsea, zlib, libpng |
| `dist/index.js` + friends | ~60 KB | the TypeScript API, the Worker, the TeX bridge, the CLI |
| `dist/bundles/*` | 25 MB total, fetched per file on demand | `core` (plain.mp, mpost.mp, boxes, graph, format, sarith, metaobj…), `cm-tfm`, `cm-type1`, `tex-plain` (+ `plain.fmt`, `etex.fmt`), `latex-core` (+ `latex.fmt`), `latex-extra` (amsmath, amsfonts, tools, graphics, pgf, xcolor, …) |

The formats (`plain.fmt` 114 KB, `etex.fmt` 128 KB, `latex.fmt` 2.2 MB) are
built **by the wasm engine itself** (`scripts/make-formats.mjs`), so they match
it byte for byte and nothing at runtime depends on a host TeX Live.

## How `btex … etex` works without a subprocess

MetaPost normally shells out to TeX from the middle of its scanner. WebAssembly
cannot do that, so the TeX step is lifted out of the run
([docs/05](docs/05-tex-bridge.md)):

1. the source (and every `input`-ed file) is scanned for `btex`/`verbatimtex`
   blocks with a TypeScript port of `mpto`'s lexer that is tested byte-for-byte
   against the C original;
2. every block not already in the snippet cache is typeset in **one** batched
   pdfTeX run — one DVI page per block;
3. MetaPost's own `dvitomp` (linked into `mplib.wasm`) converts the DVI into
   `.mpx` picture expressions, which are split and cached by content hash
   (engine, format, preceding `verbatimtex` chain, body);
4. MetaPost runs with `extensions=1`, and its `make_text` callback answers
   synchronously from the cache;
5. anything the scan could not see (`scantokens`-generated labels) misses the
   cache, comes back as `nullpicture`, and the run is repeated once the
   snippet has been typeset — the same fixpoint idea as LaTeX cross-references.

A document with forty labels runs TeX once; editing one label runs TeX once
with one page; recompiling an unchanged document runs TeX zero times.

Measured on an M-series Mac, Node 23 (`scripts/smoke-api.mjs`):

| Scenario | Time |
| --- | --- |
| instantiate `mplib.wasm` + load bundles | ~50 ms |
| geometry figure (includes parsing `plain.mp`) | 14 ms |
| `label("MetaPost")` with Type 1 outlines | 6 ms |
| plain TeX `btex` figure, cold cache | ~115 ms (TeX 108 ms) |
| LaTeX + amsmath figure, cold cache | ~185 ms (TeX 175 ms) |
| the same, warm cache | 5 ms |
| 40 labels, cold cache | 62 ms, one TeX run |
| 40 labels with one edited | 91 ms, one TeX run, one page |

## API

See [`src/ts/types.ts`](src/ts/types.ts) (the implemented contract) and
[docs/08](docs/08-javascript-api.md). Highlights:

* `MetaPost.create(options)` — starts a Worker in browsers, runs in-process in
  Node. Options: `bundles`, `bundleBaseUrl`, `texmfDir` (Node), `numberSystem`
  (`scaled` | `double` | `decimal`), `tex` (`auto` | `plain` | `etex` | `latex`
  | `none`), `deterministic`, `runScript`, `makeText`, `onFindFile`, `timeoutMs`.
* `mp.run(source, { format: 'svg' | 'eps' | 'json' | [...], prologues, files,
  internals, jobName })` → `{ status, history, figures[], log, texLog,
  diagnostics[], stats, artifacts }`.
* `figures[i].svg` (glyph outlines, optionally post-processed: number
  compaction, per-figure glyph ids), `.eps`, `.json` (typed knots, pens,
  colours, text runs — see `Figure` in `types.ts`), `.bbox`.
* `diagnostics` carry MetaPost's own help text, file and line; TeX errors are
  mapped back to the `btex` block that caused them.
* `sanitizeSvg(svg)` for `innerHTML` use (MetaPost's `special` can inject
  arbitrary text into the output).
* `MetaPostPool` for batch work; `mp.preload([...])` to warm bundles.

### CLI

```sh
npx mpost-wasm figure.mp                        # figure.1, figure.2 … like mpost
npx mpost-wasm -s 'outputformat="svg"' -s prologues=3 figure.mp
npx mpost-wasm -tex=latex -numbersystem=double figure.mp
```

Accepts the common `mpost` flags (`-interaction`, `-jobname`, `-tex`, `-s`,
`-halt-on-error`, `-recorder`, `-troff` with a warning) and writes outputs to
the current directory with `mpost`'s `outputtemplate` naming.

## Building

Prerequisites: a C compiler, Node ≥ 20, Emscripten (`.emsdk-version` pins
6.0.9), and a TeX Live 2025 installation — it is the *oracle* for the tests and
the source of the texmf files in the bundles.

```sh
./scripts/extract-vendor.sh     # fetch + verify the pinned TeX Live source (vendor/SOURCES.lock)
./scripts/verify-pin.sh         # assert the mplib API the design relies on
make contract                   # native build + the L0 contract harness (46 checks)
scripts/native-texlive.sh       # native web2c pass: generates pdftex's C (once)
npm run build                   # mplib.wasm, tex.wasm, texmf tree, formats, bundles, TypeScript
npm test                        # 179 unit tests (scanner vs the C oracle, mpx, keys, diagnostics)
npm run test:golden             # golden corpus vs native mpost (byte-identical)
```

`make tangle` runs `ctangle` (built from the vendored CWEB) on the patched
copies of the `.w` files in `build/patched`; the vendored tree is never
modified.

## Patches to upstream

Every patch is a unified diff in `patches/`, applied by
`scripts/apply-patches.sh`, with a comment in the code explaining why:

| # | File | Why |
| --- | --- | --- |
| 0001 | `mpxout.w` | expose `mpx_run_mpto()` — the `mpto` step alone, without spawning TeX |
| 0002 | `mpxout.w` | compile out `fork`/`execvp` (`MPWASM_NO_SPAWN`) |
| 0003 | `psout.w` | **upstream bug:** `mp_read_psname_table` kept a `static` flag; the second `MP` instance in a process never read the font map and crashed in the Type 1 code |
| 0004 | `mp.w` | **upstream bug:** the `extensions=1` scanner never matched an `etex` at the end of a line |
| 0005 | `svgout.w` | **upstream bug:** `stroke-miterlimit` for `filldraw` objects was read through the wrong struct type (uninitialised memory) |
| 0006 | `psout.w` | font subset tags hashed in `unsigned long`; made explicitly 64-bit so wasm32 output equals the 64-bit binaries' |
| 0007 | `mpxout.w` | `mpto`'s prologue used a bare `%` in a printf format (glibc printed it, BSD dropped it, musl printed nothing) |
| 0008 | `mp.w` | the `extensions=1` scanner required a space before `etex`; `mpto` accepts any non-letter, and TeX Live's own `texnum.mp` writes `btex$-$etex` |
| 0009 | `psout.w`, `mp.w` | record the `prologues`/`mpprocset` internals per figure at shipout time, so deferred rendering matches immediate rendering |

0003, 0004, 0005 and 0007 are genuine upstream defects worth reporting.

## Status against the plan

| Milestone | State |
| --- | --- |
| M0 foundations, contract harness | done — `make contract`: 46 checks |
| M1 `mplib.wasm` | done — 1.2 MB, geometry byte-identical to the oracle |
| M2 VFS + bundles | done — lazy MEMFS nodes, manifests, ls-R for kpathsea |
| M3 tier-0 text (TFM + Type 1) | done |
| M4 `tex.wasm` | done — pdfTeX DVI mode; DVI identical to the oracle's modulo the timestamp comment |
| M5 TeX bridge, plain TeX | done — batched, cached, fixpoint |
| M6 LaTeX | done — `latex.fmt` built by the wasm engine; amsmath sample byte-identical |
| M7 API, worker, CLI, JSON backend | done (worker mode does not yet support the `runScript`/`makeText` callbacks; they force in-process mode) |
| M8 conformance | golden corpus 15/15 byte-identical; `mtrap.mp` output files identical to native MetaPost 2.11 (see [docs/14](docs/14-implementation-notes.md) §4); the interactive `trap.mp` half needs `errorstopmode` terminal input and is not applicable to the library |
| M9 hardening | PNG, `binary`/`interval` number systems, IndexedDB cache and JSPI are not done |

Out of scope, as planned: troff mode, XeTeX/LuaTeX as the `btex` engine, PDF
as a native output, interactive error recovery.

## Licence

MetaPost itself is public domain; the shipped `mplib.wasm` also contains
`avl.c` (LGPL-3+) and decNumber (ICU licence), so the wasm binary is
distributed under **LGPL-3.0-or-later** with the sources, the patches and a
reproducible build (`make wasm`) in this repository. pdfTeX and kpathsea are
GPL; `tex.wasm` is distributed under the GPL. The TeX macro packages and
fonts in the bundles keep their own licences (LPPL, Knuth's, AMS).

## Repository map

`START-HERE.md` and `docs/` are the design ([docs/14](docs/14-implementation-notes.md) records what was built and learned); `src/c` the C shim; `src/ts` the
library, worker and CLI; `site/` the demo; `test/contract` the native harness;
`test/unit` vitest; `test/golden` the oracle corpus; `scripts/` the build
pipeline; `bundles/texmf.cnf` the kpathsea configuration inside the VFS.
