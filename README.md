# mp-tikz-wasm

[![ci](https://github.com/jmckalex/mp-tikz-wasm/actions/workflows/ci.yml/badge.svg)](https://github.com/jmckalex/mp-tikz-wasm/actions/workflows/ci.yml)

**MetaPost and TikZ in the browser and in Node, with real LaTeX.** MetaPost 2.11,
pdfTeX 1.40, LuaTeX 1.21 and dvisvgm 3.4 from TeX Live 2025 are compiled to
WebAssembly and wrapped in one small TypeScript library. MetaPost source goes
in and SVG with real glyph outlines, EPS or a structured JSON figure model comes
out, `btex … etex` labels typeset by plain TeX or LaTeX included. Whole LaTeX
documents go in too, TikZ, pgfplots, tikz-cd, Latin Modern, graph drawing under
LuaTeX, and come out as one SVG per page. Nothing runs on a server.

The output is byte-identical to native TeX Live: the same C code produces it,
and every deviation from upstream is a numbered, explained patch in
[`patches/`](patches/). The complete 1181-page PGF/TikZ manual typesets through
the library page-for-page identical to `latex` + `dvisvgm`.

```html
<script type="module" src="/path/to/dist/auto.js"></script>

<script type="text/tikz" data-libraries="arrows.meta">
  \begin{tikzpicture} \draw[->,thick] (0,0) -- (2,1) node[right] {$x^2$}; \end{tikzpicture}
</script>
<script type="text/metapost">draw fullcircle scaled 50; label.top(btex $\int_0^1 x\,dx$ etex, (0,25));</script>
```

```js
import { MetaPost } from './dist/index.js';
const mp = await MetaPost.create();
const fig = await mp.run('beginfig(1); draw fullcircle scaled 100; endfig; end.');
const doc = await mp.latex(String.raw`\documentclass[tikz]{standalone}
  \begin{document}\tikz\shade[ball color=blue!60] (0,0) circle (1);\end{document}`);
document.body.innerHTML = fig.figures[0].svg + doc.pages[0];
```

## What it does

mp-tikz-wasm renders MetaPost figures and LaTeX documents entirely on the
client: in a web page, in a Web Worker, or in a Node process. It is not a
reimplementation of either language. The engines are the real programs from
TeX Live 2025, compiled to WebAssembly, so anything that typesets on a TeX
installation typesets here, and the output is the same to the byte.

For MetaPost, the whole language is available: every number system
(`scaled`, `double` and `decimal`), the standard macro packages such as
`boxes.mp` and `graph.mp`, and text set directly from Type 1 outlines with
`infont`. Labels written as `btex … etex` are typeset by plain TeX or LaTeX.
MetaPost normally launches TeX as a subprocess for these, which a browser
cannot do, so the library collects the labels, typesets them in a single TeX
run and caches the result by content: a figure with forty labels costs one
TeX run, and an unchanged figure costs none. Figures come out as SVG with real
glyph outlines, as the EPS that `mpost` itself writes, or as a JSON model of
the paths, pens, colours and text for further processing.

For LaTeX, a complete document goes in and one SVG per page comes out.
`\documentclass`, `\usepackage`, every PGF/TikZ library shipped with TeX Live,
pgfplots, tikz-cd, amsmath and Latin Modern all work, because the document is
typeset by pdfTeX in DVI mode and converted by dvisvgm, the standard
converter, which has its own handlers for PGF's drawing commands. Shadings
become gradients, patterns become patterns, and opacity and clipping survive.
Plain TeX documents are accepted too. When a document uses TikZ's
graph-drawing library, `\directlua` or `luacode`, the library switches to a
second engine, LuaTeX, which is downloaded only when it is needed.

For web pages, a single script tag is enough. It finds
`<script type="text/tikz">`, `<script type="text/metapost">`, `<tikz-diagram>`
and `<metapost-diagram>` elements, replaces each with its rendered SVG,
watches for elements added later, and keeps rendered results in the browser's
IndexedDB so that a revisited page shows its figures without running TeX
again. This is the role tikzjax plays, but with a real LaTeX rather than a
frozen memory image, so packages and libraries work unchanged.

Fonts, macro packages and formats are served as static files and fetched
individually, through the real kpathsea library, as the engines ask for them.
A first TikZ figure transfers about 4.7 MB, a first MetaPost figure about
2.3 MB, and everything after that comes from the browser cache. Because a
first run touches around ninety files, the library fetches them in parallel
beforehand when it knows what is coming, so even a host that takes half a
second per request answers in a few seconds rather than a minute. A
command-line tool, `mpost-wasm`, accepts `mpost`'s options and writes
`mpost`'s output files, and takes `--latex` for documents.

The feature guide shows all of this with rendered examples, among them a
paragraph set inside a circle by TeX's `\parshape` primitive with inline TikZ
pictures and displayed mathematics, which is the kind of thing a real TeX can
do and a picture-only engine cannot.

## Demos and documentation

The demo pages need the built engines, which are not committed, so they are
served from <https://eschatolog.ist/software/mp-tikz-wasm/> (also mirrored, more
slowly, at <https://jmckalex.org/software/mp-tikz-wasm/>):

- [Feature guide](https://eschatolog.ist/software/mp-tikz-wasm/site/guide.html):
  the complete user documentation, with every feature rendered by the engines
  themselves, installation, the drop-in tags, the API, the command line, how
  it works, fidelity, limits and building.
- [Editor demo](https://eschatolog.ist/software/mp-tikz-wasm/site/index.html):
  galleries of MetaPost and TikZ examples with a live editor.
- [Drop-in tags](https://eschatolog.ist/software/mp-tikz-wasm/site/tags.html): a
  page whose diagrams are just `<script type="text/tikz">` elements.
- [Real-time graphics](https://eschatolog.ist/software/mp-tikz-wasm/site/live.html):
  six animations and interactive plots regenerated by MetaPost and LaTeX as
  you move the controls.
- [Two editors](https://eschatolog.ist/software/mp-tikz-wasm/site/minimal.html):
  a MetaPost editor and a TikZ editor side by side with their output.
- [Single-file playground](https://eschatolog.ist/software/mp-tikz-wasm/site/standalone.html):
  the same in one 11 MB file with everything inlined, for saving and using
  offline.

The written documentation is in the repository:

- [`docs/08-javascript-api.md`](docs/08-javascript-api.md) and
  [`src/ts/types.ts`](src/ts/types.ts): the API, every option and result type.
- [`docs/`](docs/): the design documents, one per subsystem (build toolchain,
  mplib embedding, the TeX bridge, the virtual filesystem and bundles, fonts
  and output, testing), then
  [`docs/14-implementation-notes.md`](docs/14-implementation-notes.md) on what
  was learned building it and
  [`HANDOVER.md`](HANDOVER.md), the summary of what exists,
  how to build and test it, and what is known to be unfinished.
- [`patches/`](patches/): the twelve upstream patches, each explained.
- [`NOTICE.md`](NOTICE.md): what is licensed how.

## Get it

**Prebuilt release (what most people want).** Download
`mp-tikz-wasm-<version>.tar.gz` or `.zip` from the
[releases page](https://github.com/jmckalex/mp-tikz-wasm/releases) and unpack
it. It contains the compiled engines, the JavaScript, the bundles and the demo
pages, and needs neither TeX Live nor Emscripten:

```sh
tar xzf mp-tikz-wasm-0.1.0.tar.gz && cd mp-tikz-wasm-0.1.0
node serve.mjs 8080        # then open http://localhost:8080/site/
```

Host the `dist/` folder on any static server (plain files, no special headers)
and add the one script line above to your page, or import `dist/index.js`.

**From source.** See [Building from source](#building-from-source) below. A
clone alone has no wasm: `dist/` is built, not committed.

The package is not on npm yet.

## Use it

### Drop-in tags

```html
<script type="module" src="/path/to/dist/auto.js"></script>

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
`data-gdlibraries` adds graph drawing and therefore LuaTeX; `data-engine`
forces `latex`, `lualatex` or `plain`); a complete document is compiled as is.
The SVG of a wrapped body is the standalone page, border included (default
`2pt`): TikZ leaves its classic arrow tips (`>=latex`, `stealth`, …) out of
the picture's bounding box, so the border is what keeps an arrowhead on the
page, as it does in the PDF. The `arrows.meta` tips (`Latex`, `Stealth`) are
counted.
A MetaPost body without `beginfig` becomes one figure (`data-tex` picks the
label engine). Errors show their diagnostics under the figure;
`data-show-console` keeps the log. Loader attributes on the script tag:
`data-base` (where `bundles/` and the wasm files live, default next to the
script), `data-worker="off"`, `data-observe="off"`, `data-snapshot="on"`,
`data-prefetch="off"`, `data-figures="figures/"` (where saved figures live;
see below), `data-log="debug"` (what reaches the browser console; see
"Logging" below). Before the first render the loader fetches, in
parallel, the files the page's diagrams will need (recorded at build time in
`bundles/hot.json`), so a host with slow responses does not pay one round trip
per file; while it waits, each figure's placeholder shows what is being
fetched. Each render dispatches a `mp-tikz-wasm:rendered` event, and
`window.mpTikzWasm.render()` renders programmatically. `site/tags.html` is a
working example page.

**Saved figures.** A page can carry its figures as static files, so that a
first visit never starts the engines. `npx mpost-wasm --prerender page.html`
typesets every diagram element of the page in Node and writes
`figures/figure-HASH.svg` next to it, HASH being six characters of the hash of
the element's source and attributes; or open the page and call
`mpTikzWasm.saveFigures()` in the browser console, which writes the same
files into a folder you pick (Chrome, Edge) or downloads them as a zip. With
`data-figures="figures/"` on the loader script, each element loads its file if
it exists and the engines start only for the figures that are missing. The
name is the content: a changed diagram gets a new file and a stale one is
never requested, so `--prerender` keeps the files that exist (`--force`
re-renders them). Each saved SVG carries its fonts and namespaced ids, so it
also works as a plain image anywhere. `mpTikzWasm.figures()` lists them.

### Library

```js
import { MetaPost } from './dist/index.js';   // a Web Worker in browsers, in-process in Node

const mp = await MetaPost.create();          // options: bundles, bundleBaseUrl, numberSystem, tex, snapshot, prefetch, timeoutMs …

const r = await mp.run(source, { format: ['svg', 'eps', 'json'] });
r.status            // 'ok' | 'warning' | 'error' | 'fatal'
r.figures[0].svg    // glyph outlines, self-contained
r.figures[0].eps    // what mpost writes, byte for byte
r.figures[0].json   // typed knots, pens, colours, dashes, text runs, clips
r.diagnostics       // [{ severity, source, message, help[], file, line }]

const t = await mp.latex(document, { engine: 'auto' });   // 'latex' | 'lualatex' | 'luatex' | 'plain'
t.pages[0]          // one SVG string per page
t.diagnostics       // TeX errors with document line numbers, package warnings
```

Options and result types are documented in [`src/ts/types.ts`](src/ts/types.ts)
and [docs/08](docs/08-javascript-api.md). Two worth knowing: `prefetch:
['latex']` fetches the files a first LaTeX run needs in parallel before it
(the tags do this by themselves), and `timeoutMs` is a stall limit, not a
total: a run is killed only when nothing happens for that long, so a slow
first load is never cut short. `sanitizeSvg(svg)` is provided for
`innerHTML` use, since MetaPost's `special` can inject arbitrary text into the
output; `MetaPostPool` runs batch work across several workers.

### Logging

Every run reports to the console (the browser's, or Node's) at the level you
choose, so you can see what MetaPost, TeX and dvisvgm are doing:

```js
const mp = await MetaPost.create({ logLevel: 'debug' });   // silent | error | warn (default) | info | debug | trace
mp.logLevel = 'trace';                                     // at any time; from the tags: mpTikzWasm.setLogLevel('debug')
```

`warn` prints the errors and warnings of each run (a MetaPost error with its
help text, a TeX error with its document line, a package warning); `info` adds
one line per run and per engine pass, with timings; `debug` adds the engines'
own terminal output, line by line as it is written, so a long MetaPost job or
a LaTeX run can be watched as it goes; `trace` adds every file looked up or
fetched and every label-cache lookup. Lines look like `mp-tikz-wasm tex: …`
and go to `console.error`, `warn`, `info` or `log` by level. Pass `logger:
(record) => …` to receive the records (`{ level, source, message, time }`)
instead of the console, or listen with `mp.on('record', …)`, for example to
fill a panel on the page; `mp.on('log', …)` still delivers every raw line
whatever the level.

### Command line

```sh
npx mpost-wasm figure.mp                                  # figure.1, figure.2 …  like mpost
npx mpost-wasm -s 'outputformat="svg"' -s prologues=3 figure.mp
npx mpost-wasm -tex=latex -numbersystem=double figure.mp
npx mpost-wasm --latex figure.tex                         # figure-1.svg, figure-2.svg …
npx mpost-wasm --latex --engine=lualatex graph.tex        # --engine=auto (default) picks LuaTeX when needed
npx mpost-wasm -vv figure.mp                              # the engines' output on stderr as it runs (-v timings, -vvv every file, -q silence)
npx mpost-wasm --prerender page.html                      # figures/figure-HASH.svg for every diagram tag on the page (see "Saved figures")
```

## How it works

MetaPost normally shells out to TeX from the middle of its scanner, which
WebAssembly cannot do. The library scans the source for `btex` blocks with a
port of `mpto`'s lexer (tested byte-for-byte against the C original), typesets
every block it has not seen before in one batched pdfTeX run, converts the DVI
with MetaPost's own `dvitomp`, and answers the interpreter's `make_text`
callback from a content-hash cache. A document with forty labels runs TeX
once; editing one label runs TeX once with one page; an unchanged document
runs TeX zero times ([docs/05](docs/05-tex-bridge.md)).

LaTeX documents take the other road: pdfTeX or LuaTeX in DVI mode, then
dvisvgm, the reference converter, with its PGF special handlers, FreeType
outlines and potrace. The library selects PGF's dvisvgm driver so shadings and
patterns become SVG rather than PostScript. Optionally a pre-warmed
`tikz.fmt`, built by the wasm engine itself with PGF, pgfplots and tikz-cd
already loaded, saves 50 to 160 ms per document; the golden tests check that
its pages are identical to plain `latex.fmt`'s.

Every format is dumped by the wasm engines themselves, so nothing at runtime
depends on a host TeX installation. [docs/14](docs/14-implementation-notes.md)
records what was learned along the way, including three memory leaks in
upstream mplib that an embedder creating one instance per job cannot live
with, and the twelve patches.

| Module | Size | Contents |
| --- | --- | --- |
| `mplib.wasm` | 1.2 MB | MetaPost 2.11: interpreter, PostScript and SVG backends, Type 1 machinery, TFM reader, `mpto` and `dvitomp` |
| `tex.wasm` | 1.1 MB | pdfTeX 1.40.27 in DVI mode with kpathsea, zlib, libpng |
| `dvisvgm.wasm` | 2.6 MB | dvisvgm 3.4.3 with FreeType, potrace, clipper, woff2 and PGF's special handlers |
| `luatex.wasm` | 4.2 MB, on demand | LuaTeX 1.21.0 in DVI mode with Lua 5.3, pplib, zziplib and the font loader; no C FFI |
| `bundles/` | 65 MB on the server, per file on demand | Computer Modern, AMS, Latin Modern and the 35 PostScript fonts; plain, LaTeX and TikZ formats; PGF/TikZ with every library, pgfplots, tikz-cd, spath3 (the `calligraphy` and `knots` libraries, which pgf does not ship), amsmath, mathtools, xcolor, standalone, geometry, hyperref, listings and more |

Typical timings on an Apple-silicon laptop: a geometry figure 14 ms, a LaTeX
label with amsmath 185 ms cold and 5 ms warm, a TikZ standalone figure about
120 ms, a pgfplots axis about 270 ms, three graph-drawing layouts under LuaTeX
about 450 ms.

## Fidelity and tests

- MetaPost golden corpus: 15 cases, EPS and SVG byte-identical to `mpost`,
  plain TeX and LaTeX labels included.
- TikZ golden corpus: 8 documents byte-identical to `latex` or `dvilualatex`
  plus `dvisvgm`, with and without the snapshot format.
- The whole PGF manual, 1181 pages: DVI byte-identical to native `latex`,
  every SVG page identical to native dvisvgm after normalising dvisvgm's own
  run-to-run glyph aliasing.
- MetaPost's `mtrap` test: output files identical to native MetaPost 2.11.
- 205 unit and end-to-end tests, a 46-check native contract harness, and a
  memory test that fails if 300 runs leave a single byte allocated.

## Limits

No OpenType font loading (`fontspec`, `unicode-math` and system fonts are out;
text is set in the Type 1 fonts), no PDF output, no Ghostscript, no
`\write18`, no interactive error recovery. The `runScript` and `makeText`
callbacks force in-process mode. XeTeX is not included.

## Building from source

You need this only to change the engines or the bundles. The release archive
already contains everything built.

### Prerequisites

- **A C and C++17 toolchain** with `make` and `patch`. macOS: the Xcode
  Command Line Tools (`xcode-select --install`). Debian and Ubuntu:
  `build-essential`.
- **`curl`, an xz-capable `tar`, `shasum`, `zip` and `python3`**, all present
  on macOS; on Debian and Ubuntu add `curl xz-utils zip python3`.
- **Node 20 or later** with npm (22 is what CI uses). Homebrew: `brew install node`.
- **Emscripten 6.0.9**, the version pinned in `.emsdk-version`:

  ```sh
  git clone https://github.com/emscripten-core/emsdk.git ~/emsdk
  cd ~/emsdk && ./emsdk install 6.0.9 && ./emsdk activate 6.0.9
  export PATH=$HOME/emsdk/upstream/emscripten:$PATH     # emcc on PATH is all the build needs
  ```

- **TeX Live 2025**, as complete as you can make it. It is the oracle for the
  tests (`mpost`, `latex`, `dvilualatex`, `dvisvgm`) and, through
  `kpsewhich`, the source of every macro package and font that goes into the
  bundles. MacTeX or `install-tl` with `scheme-full` is the simple answer. On
  Debian and Ubuntu the CI workflow installs `texlive-metapost
  texlive-latex-base texlive-latex-recommended texlive-fonts-recommended
  texlive-pictures texlive-latex-extra texlive-luatex dvisvgm`.
- **Disk and time.** About 3 GB in the checkout (the vendored TeX Live source
  is 1.1 GB unpacked, the native builds 0.8 GB) plus 1.8 GB for Emscripten.
  The native LuaTeX pass takes several minutes; the rest a few minutes each.

### Steps

```sh
git clone https://github.com/jmckalex/mp-tikz-wasm.git && cd mp-tikz-wasm
npm install
./scripts/extract-vendor.sh      # fetch and verify the pinned TeX Live 2025 source (111 MB)
./scripts/verify-pin.sh          # assert the mplib API the design relies on
make contract                    # native mplib + 46 checks
scripts/native-texlive.sh        # once: the native web2c pass that generates pdfTeX's C
scripts/native-dvisvgm.sh        # once: dvisvgm's configure
scripts/native-luatex.sh         # once: native LuaTeX build, compile commands recorded for emcc
npm run build                    # mplib.wasm, tex.wasm, luatex.wasm, dvisvgm.wasm, texmf, formats, bundles, TypeScript
npm test                         # unit + end-to-end
npm run test:golden              # MetaPost corpus vs native mpost
npm run test:golden:tikz         # TikZ corpus vs native latex/dvilualatex + dvisvgm
npm run demo                     # the editor demo at http://localhost:8080/site/
```

`npm run build:guide`, `build:pages` and `build:standalone` regenerate the
feature guide, the two single-file pages and the single-file playground.

### Publishing

`npm run package` writes the release archives to `release/`; upload them to a
GitHub release, which is where the guide's "Get it" section sends people.
`scripts/stage-site.sh <dir>` assembles the demo pages, the guide, the built
library, an `.htaccess` with the MIME types Apache needs and the licence files
into a directory in the layout of the release archive, ready to upload to any
static host. `npm run pages` does the same into a `gh-pages` branch for GitHub
Pages, if you prefer that.

## Patches to upstream

Every patch is a unified diff in `patches/`, applied into `build/patched` by
`scripts/apply-patches.sh` and explained by a comment in the code. Seven are
upstream defects worth reporting to the MetaPost maintainers.

| # | File | Why |
| --- | --- | --- |
| 0001 | `mpxout.w` | expose `mpx_run_mpto()`, the `mpto` step alone, without spawning TeX |
| 0002 | `mpxout.w` | compile out `fork`/`execvp` (`MPWASM_NO_SPAWN`) |
| 0003 | `psout.w` | **upstream bug:** `mp_read_psname_table` kept a `static` flag; the second `MP` instance in a process never read the font map and crashed in the Type 1 code |
| 0004 | `mp.w` | **upstream bug:** the `extensions=1` scanner never matched an `etex` at the end of a line |
| 0005 | `svgout.w` | **upstream bug:** `stroke-miterlimit` for `filldraw` objects was read through the wrong struct type (uninitialised memory) |
| 0006 | `psout.w` | font subset tags hashed in `unsigned long`; made explicitly 64-bit so wasm32 output equals the 64-bit binaries' |
| 0007 | `mpxout.w` | **upstream bug:** `mpto`'s prologue used a bare `%` in a printf format (glibc printed it, BSD dropped it, musl printed nothing) |
| 0008 | `mp.w` | the `extensions=1` scanner required a space before `etex`; `mpto` accepts any non-letter, and TeX Live's own `texnum.mp` writes `btex$-$etex` |
| 0009 | `psout.w`, `mp.w` | record the `prologues`/`mpprocset` internals per figure at shipout time, so deferred rendering matches immediate rendering |
| 0010 | `mp.w` | **upstream leak:** `mp_finish` freed the symbol table but not what it points to (macro bodies, variable values, dependency lists), nor the preload file handle, the log wrapper and a few initialisation nodes: about 300 KB per instance |
| 0011 | `mpstrings.w` | **upstream leak:** `mp_make_string` inserted a copy into the string tree and dropped its own struct, 32 bytes per new string |
| 0012 | `mp.w`, `svgout.w`, `psout.w`, `pngout.w` | **upstream leak:** the four `charwd`/`charht`/`chardp`/`charic` nodes stored per `shipout` were never freed (upstream's teardown loop is commented out because it double-freed after TFM output); `mp_free` returned its table nodes to free lists it had already drained; the standalone `mp_svg_ship_out`/`mp_ps_ship_out`/`mp_png_ship_out` entry points replaced `jump_buf` without freeing the old one |

With all three leak patches an instance leaks nothing: macOS `leaks` reports
0 bytes over 31 instances, and 200,000 consecutive jobs on one engine leave the
allocator's bytes in use unchanged (`scripts/soak-memory.mjs`).

One patch applies to LuaTeX, in `patches/luatex/` (applied by
`scripts/build-luatex-wasm.sh` to copies under `build/luatex/patched`):

| # | File | Why |
| --- | --- | --- |
| luatex 0001 | `backend.c`, `vfpacket.c`, `lfontlib.c` | **wasm-only defect:** the back-end dispatch table is an unprototyped `void (*)()`; the ship-out calls its rule slot with four arguments and the DVI implementation takes three. Native C drops the extra argument, WebAssembly's `call_indirect` traps, so every rule in DVI mode (`\hrule`, `\sqrt`, `\over`, `\overline`, `\underline`, leaders) threw "null function or function signature mismatch". A four-argument wrapper fills the slot; the two three-argument callers pass four |

## Licence

This project's own code is LGPL-3.0-or-later (`LICENSE`). The wasm modules
combine it with upstream software under its own terms: MetaPost is public
domain, but `mplib.wasm` includes `avl.c` (LGPL) and decNumber (ICU), so it is
LGPL-3.0-or-later too; `tex.wasm`, `luatex.wasm` and `dvisvgm.wasm` are GPL.
The fonts and macro packages in the bundles keep their own licences (Knuth's,
AMS, GUST, LPPL). [`NOTICE.md`](NOTICE.md) lists every part, and `licenses/`
holds the full texts.

## Repository map

`src/c` is the C shim around mplib; `src/ts` the library, worker, TeX bridge,
tag renderer and CLI; `patches/` the upstream patches; `scripts/` the build
pipeline, each script's header saying what it does; `site/` the demo pages and
the guide template; `test/` the contract harness, unit tests, golden corpora
and leak harness; `docs/` the design documents and implementation notes, with
[HANDOVER.md](HANDOVER.md) as the hand-over summary; `bundles/texmf.cnf`
the kpathsea configuration inside the virtual filesystem.

## Credits

MetaPost by John Hobby, maintained by Taco Hoekwater and Luigi Scarso; pdfTeX
by Hàn Thế Thành and the pdfTeX team; LuaTeX by the LuaTeX team; dvisvgm by
Martin Gieseking; PGF/TikZ by Till Tantau and its maintainers; all from TeX
Live 2025. Built with Emscripten.
