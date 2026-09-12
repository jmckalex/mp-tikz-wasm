# MetaPost-WASM

**MetaPost and TikZ in the browser and in Node.** John Hobby's MetaPost (the
`mplib` library maintained by Taco Hoekwater and Luigi Scarso in TeX Live 2025,
MetaPost 2.11), pdfTeX 1.40 (DVI mode), LuaTeX 1.21 (DVI mode) and dvisvgm
3.4.3 are compiled to WebAssembly and wrapped in a TypeScript API. MetaPost source goes in; SVG with
real glyph outlines, EPS/PostScript, and a structured JSON figure model come
out — including `btex … etex` / `verbatimtex … etex` labels typeset by plain
TeX or LaTeX. Whole LaTeX documents go in too — `\documentclass[tikz]{standalone}`,
pgfplots, Latin Modern, TikZ graph drawing under LuaTeX — and come out as one
SVG per page, entirely client-side.

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

```ts
const tikz = await mp.latex(String.raw`
  \documentclass[tikz,border=2pt]{standalone}
  \usetikzlibrary{shadings}
  \begin{document}\begin{tikzpicture}
    \shade[ball color=blue!60] (0,0) circle (1);
    \node at (0,-1.4) {$e^{i\pi}+1=0$};
  \end{tikzpicture}\end{document}`);
document.body.innerHTML = tikz.pages[0];
```

The output is **byte-identical to native TeX Live 2025** on the golden corpora
— `mpost` for MetaPost (EPS and SVG, plain TeX and LaTeX labels included) and
`latex` + `dvisvgm` for TikZ — because it *is* MetaPost, pdfTeX and dvisvgm;
the C output is left untouched, and every deviation from upstream lives in a
numbered, explained patch in [`patches/`](patches/).

LuaTeX is a second engine, `luatex.wasm` (4.2 MB, fetched on demand): LuaTeX 1.21 in
DVI mode with TeX Live's `dvilualatex`/`dviluatex` formats, for TikZ's `graphdrawing`
library, `\directlua` and `luacode`. `engine: 'auto'` (the default in the tags and the
CLI) picks it whenever a document needs it; a graph-drawing golden case is byte-identical
to native `dvilualatex` + `dvisvgm`. No OpenType font loader is bundled, so text is set
in the Type 1 fonts and `fontspec` is not available.

The strongest test is the complete PGF/TikZ manual from TeX Live 2025: all 1181
pages, every library it documents, typeset through the API to a DVI byte-identical
to native `latex`, with all 1181 SVG pages matching native dvisvgm (after
normalising dvisvgm's own run-to-run glyph aliasing, which makes two native runs
differ too). `node scripts/stress-pgfmanual.mjs` reproduces it.

## Try it

```sh
npm run demo            # then open http://localhost:8080/site/
```

The demo (`site/`) is a live editor with two galleries: MetaPost (geometry,
labels without TeX, plain-TeX and LaTeX labels, `boxes.mp`, `graph.mp`,
recursion, clipping, JSON output, diagnostics) and TikZ/LaTeX (plots, nodes
and edges, shadings and patterns, pgfplots, Latin Modern text, trees, and
graph drawing under LuaTeX). `site/tags.html` shows the drop-in tags and
`site/guide.html` is the feature guide. Everything runs in a Web Worker;
fonts, macro packages, formats and engines are fetched lazily from static
files and cached by the browser.

## What is in the box

| Artifact | Size | What it is |
| --- | --- | --- |
| `dist/mplib.wasm` | 1.2 MB | MetaPost 2.11: interpreter, PostScript + SVG backends, Type 1 font machinery, TFM reader, `scaled`/`double`/`decimal` arithmetic, `mpto` + `dvitomp` |
| `dist/tex.wasm` | 1.1 MB | pdfTeX 1.40.27 in DVI mode (= `tex`, `etex`, `latex`) with kpathsea, zlib, libpng |
| `dist/dvisvgm.wasm` | 2.6 MB | dvisvgm 3.4.3 with FreeType, potrace, clipper, woff2/brotli and PGF's special handlers (no Ghostscript) |
| `dist/luatex.wasm` | 4.2 MB, fetched on demand | LuaTeX 1.21.0 in DVI mode (= `dvilualatex`, `dviluatex`) with Lua 5.3, pplib, zziplib, the fontforge-derived font loader, kpathsea and our patched mplib; no C FFI |
| `dist/index.js` + friends | ~70 KB | the TypeScript API, the Worker, the TeX bridge, the CLI, `auto.js` (the tag renderer) |
| `dist/bundles/*` | 47 MB total, fetched per file on demand | `core` (plain.mp, mpost.mp, boxes, graph, format, sarith, metaobj…), `cm-tfm`, `cm-type1`, `ps-fonts` (the 35 standard PostScript fonts as URW Type 1), `lm-fonts` (Latin Modern, T1/TS1), `tex-plain` (+ `plain.fmt`, `etex.fmt`), `latex-core` (+ `latex.fmt`), `latex-extra` (pgf/TikZ with all libraries, pgfplots, amsmath, amsfonts, tools, graphics, xcolor, standalone, geometry, booktabs, mathtools, …) `luatex` (the DVI-mode LuaTeX formats) |

The formats (`plain.fmt` 114 KB, `etex.fmt` 128 KB, `latex.fmt` 2.2 MB,
`tikz.fmt` 5.8 MB; `dviluatex.fmt` 1.2 MB and `dvilualatex.fmt` 6.2 MB by
`luatex.wasm`) are built **by the wasm engines themselves**
(`scripts/make-formats.mjs`), so they match them byte for byte and nothing at
runtime depends on a host TeX Live.

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

## TikZ and whole LaTeX documents

`mp.latex(source, options)` takes the other road: the document is typeset by
`tex.wasm` (`latex.fmt`, or `etex.fmt` for plain TeX with `engine: 'plain'`)
or by `luatex.wasm` (`engine: 'lualatex' | 'luatex'`; `engine: 'auto'` picks
LuaTeX whenever the source uses graphdrawing, `\directlua`, luacode or
pgfplots' `contour lua`), and every DVI page is converted by `dvisvgm.wasm` — the reference converter,
with its PGF special handlers, FreeType glyph outlines and potrace. The
library prepends `\def\pgfsysdriver{pgfsys-dvisvgm.def}` so PGF draws with
SVG specials rather than the dvips PostScript ones (which need Ghostscript);
`pgfDriver: 'auto'` turns that off. Shadings become gradients, patterns become
patterns, clipping, opacity and pgfplots all survive. Options: `engine`,
`files`, `pages`, `fonts: 'paths' | 'woff2'`, `bbox`, `dvisvgmArgs`.
Results: `pages[]` (SVG strings), `log`, `texLog`, `dvisvgmLog`, `diagnostics`
(TeX errors with document line numbers, package warnings), `stats`.

### Drop-in tags (the tikzjax replacement)

One script turns diagram tags into SVGs, with no other code on the page:

```html
<script type="module" src="https://your-host/metapost-wasm/dist/auto.js"></script>

<script type="text/tikz" data-libraries="arrows.meta,calc">
  \begin{tikzpicture} \draw[->] (0,0) -- (2,1) node[right] {$x$}; \end{tikzpicture}
</script>
<script type="text/metapost">draw fullcircle scaled 50; label(btex $\pi$ etex, origin);</script>

<tikz-diagram data-libraries="shadings">\shade[ball color=red] (0,0) circle (1);</tikz-diagram>
<tikz-diagram data-gdlibraries="layered">\graph[layered layout]{a -> {b, c} -> d};</tikz-diagram>
<metapost-diagram>draw unitsquare scaled 40;</metapost-diagram>
```

A TikZ body without `\documentclass` is wrapped in a `standalone` document
(`data-libraries`, `data-packages`, `data-preamble`, `data-border`;
`data-gdlibraries` adds `\usegdlibrary` and the graphs and graphdrawing
libraries, which means LuaTeX; `data-engine` forces `latex`, `lualatex` or
`plain`, default `auto`); a complete document is compiled as is. A MetaPost body without `beginfig` becomes
one figure (`data-tex` picks the label engine). Errors show their diagnostics
under the figure; `data-show-console` keeps the log. Rendered SVGs are cached
in IndexedDB by content hash, so a revisited page shows its figures without
running TeX. Elements added later are rendered by a `MutationObserver`; a
`metapost-wasm:rendered` event fires per figure; `window.metapostWasm.render()`
renders programmatically. `site/tags.html` is a working example page.

### The pre-warmed snapshot

`tikz.fmt` (5.8 MB, in the optional `tikz-snapshot` bundle, loaded by default)
is `latex.fmt` with PGF, its common libraries, pgfplots and tikz-cd already
loaded — the equivalent of tikzjax's memory image, built by the wasm engine
from `tikz.ini`, which intercepts `latex.ltx`'s final `\dump` to
`\RequirePackage` them first. `latex()` uses it automatically for documents
that load tikz, pgfplots or tikz-cd (`snapshot: 'auto' | 'tikz' | 'none'`).
Only definitional libraries are in it and PGF's object counters are reset, so
the pages it produces are byte-identical to plain `latex.fmt`'s — the TikZ
golden runner checks that for every case. It saves 50–160 ms per document
(pgfplots: 414 → 255 ms of TeX). It is the default in Node, where the format
comes from local files, and **opt-in in browsers** (`snapshot: 'auto'` on
`create()`, or `data-snapshot="on"` on the loader script): format files do
not compress, so the 5.8 MB `tikz.fmt` costs more to download than the 2.5 MB
(gzipped) of `latex.fmt` plus PGF files it replaces, and only a page with
many TikZ figures, or a returning visitor with the format cached, comes out
ahead.

### What a page downloads

Measured with `node scripts/sizes.mjs`. The fixed part is fetched once and
then browser-cached; the rest is per file, on demand, so a page pays only for
what its diagrams use:

| | raw | gzipped over the wire |
| --- | --- | --- |
| `mplib.wasm` + `tex.wasm` + `dvisvgm.wasm` + JS (fixed) | 5.2 MB | 2.2 MB |
| MetaPost, geometry only | 0.07 MB | 0.01 MB |
| MetaPost with `label()` text | 0.16 MB | 0.05 MB |
| MetaPost with plain-TeX `btex` | 0.37 MB | 0.25 MB |
| MetaPost with LaTeX `btex` (amsmath) | 2.4 MB | 2.2 MB |
| TikZ figure, `latex.fmt` | 3.8 MB | 2.5 MB |
| TikZ figure, `tikz.fmt` snapshot | 5.9 MB | 5.5 MB |
| TikZ with Latin Modern T1 text | +0.3 MB | +0.3 MB |
| first LuaTeX figure: `luatex.wasm` + `dvilualatex.fmt` | +10.4 MB | +4.9 MB |

The whole bundle tree on the server is 47 MB, but no page downloads it. A
single self-contained file is possible too — `site/standalone.html` inlines
the three engines plus the gallery's fonts, formats and packages, gzip +
base64, at 10.8 MB — but the per-file layout is the right one for a drop-in
script: a first TikZ figure costs about 4.7 MB, a first MetaPost figure about
2.3 MB, and everything after that is cached.

Compared with tikzjax: real LaTeX rather than a pre-dumped plain-TeX snapshot,
so `\documentclass`, `\usepackage` and every TikZ library work unchanged,
graph drawing included (it needs LuaTeX, which tikzjax does not have);
formats built by the engine itself; per-file lazy loading through real
kpathsea; glyph outlines instead of web fonts; and dvisvgm itself rather than
a re-implementation of its special language.

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
| TikZ standalone figure (`latex()`), snapshot | ~120 ms (TeX 100 ms, dvisvgm 13 ms) |
| pgfplots axis with two curves, snapshot | ~270 ms (TeX 255 ms, dvisvgm 15 ms) |
| graph drawing, three layouts (LuaTeX) | ~450 ms (LuaTeX 410 ms, dvisvgm 40 ms) |

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
* `mp.latex(source, { engine: 'latex' | 'lualatex' | 'luatex' | 'plain' | 'tex' | 'auto',
  snapshot, files, jobName, pages, fonts, bbox, dvisvgmArgs, svg })` →
  `{ status, pages[], log, texLog, dvisvgmLog, diagnostics[], stats, format, artifacts }`.
* `MetaPostPool` for batch work; `mp.preload([...])` to warm bundles.

### CLI

```sh
npx mpost-wasm figure.mp                        # figure.1, figure.2 … like mpost
npx mpost-wasm -s 'outputformat="svg"' -s prologues=3 figure.mp
npx mpost-wasm -tex=latex -numbersystem=double figure.mp
npx mpost-wasm --latex figure.tex                      # figure-1.svg, figure-2.svg … via tex.wasm + dvisvgm.wasm
npx mpost-wasm --latex --engine=lualatex graph.tex       # LuaTeX; --engine=auto (the default) picks it for graph drawing
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
scripts/native-dvisvgm.sh       # native configure of dvisvgm: config.h (once)
scripts/native-luatex.sh        # native LuaTeX build, compile commands recorded for the wasm build (once)
npm run build                   # mplib.wasm, tex.wasm, luatex.wasm, dvisvgm.wasm, texmf tree, formats, bundles, TypeScript
npm test                        # unit tests (scanner vs the C oracle, mpx, keys, diagnostics) + end-to-end
npm run test:golden             # golden corpus vs native mpost (byte-identical)
npm run test:golden:tikz        # TikZ corpus vs native latex / dvilualatex + dvisvgm (byte-identical)
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
| 0010 | `mp.w` | **upstream leak:** `mp_finish` freed the symbol table but not what it points to (macro bodies, variable values, dependency lists), nor the preload file handle, the log wrapper, `name_of_file`, and a few initialisation nodes — about 300 KB per instance, invisible to a one-instance process, fatal to an embedder creating an instance per job |
| 0011 | `mpstrings.w` | **upstream leak:** `mp_make_string` inserted a copy into the string tree and dropped its own struct, 32 bytes per new string |

0003, 0004, 0005, 0007, 0010 and 0011 are genuine upstream defects worth
reporting. After 0010 and 0011 an instance leaks about 1.2 KB (measured with
macOS `leaks` on `test/leak/leaktest.c`), down from 319 KB; the remainder is
three 144-byte nodes created by statement processing, the 208-byte
`jump_buf` of `mp_execute`, and a 16-byte file wrapper, listed in
[docs/14](docs/14-implementation-notes.md) §11. `test/e2e/memory.test.ts`
fails if 300 runs grow the wasm heap by more than a few megabytes.

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
| M8 conformance | golden corpus 15/15 byte-identical; TikZ corpus 7/7 byte-identical to `latex` + `dvisvgm`; the 1181-page PGF manual identical to native `latex` + `dvisvgm`; `mtrap.mp` output files identical to native MetaPost 2.11 (see [docs/14](docs/14-implementation-notes.md) §4); the interactive `trap.mp` half needs `errorstopmode` terminal input and is not applicable to the library |
| TikZ/PGF (beyond the plan) | done — `dvisvgm.wasm`, `latex()`, `--latex` CLI mode, Latin Modern and pgfplots bundles |
| LuaTeX (beyond the plan) | done — `luatex.wasm`, engine `lualatex`/`luatex`/`auto`, graphdrawing golden case byte-identical |
| M9 hardening | PNG, `binary`/`interval` number systems, IndexedDB cache and JSPI are not done |

Out of scope, as planned: troff mode, XeTeX as an engine, LuaTeX as the
`btex` label engine, OpenType font loading (luaotfload/fontspec), PDF as a
native output, interactive error recovery.

## Licence

MetaPost itself is public domain; the shipped `mplib.wasm` also contains
`avl.c` (LGPL-3+) and decNumber (ICU licence), so the wasm binary is
distributed under **LGPL-3.0-or-later** with the sources, the patches and a
reproducible build (`make wasm`) in this repository. pdfTeX and kpathsea are
GPL; `tex.wasm` is distributed under the GPL, as is `luatex.wasm` (LuaTeX is
GPL-2+; it embeds Lua (MIT), pplib, zziplib (LGPL-2.1+/MPL) and a BSD-licensed
fontforge-derived font loader) and `dvisvgm.wasm` (dvisvgm is
GPL-3+; it embeds FreeType (FTL), potrace (GPL), clipper (Boost), woff2 and
brotli (MIT) and the URW base-14 CFF fonts (AGPL/LPPL as distributed by dvisvgm)). The TeX macro packages and
fonts in the bundles keep their own licences (LPPL, Knuth's, AMS).

## Repository map

`START-HERE.md` and `docs/` are the design ([docs/14](docs/14-implementation-notes.md) records what was built and learned); `src/c` the C shim; `src/ts` the
library, worker and CLI; `site/` the demo; `test/contract` the native harness;
`test/unit` vitest; `test/golden` the oracle corpus; `scripts/` the build
pipeline; `bundles/texmf.cnf` the kpathsea configuration inside the VFS.
