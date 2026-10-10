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

**PDF output, on request.** `mp.latex(doc, { output: 'pdf' })` runs pdfTeX (or
LuaTeX) with its own PDF back end instead and returns the document as
`result.pdf`, a `Uint8Array`; `pages` is then empty and the SVG options do not
apply. PGF and hyperref use their PDF drivers, the Type 1 fonts (or, under
LuaLaTeX with the `opentype` bundle, the OpenType faces) are embedded, and PNG
and JPEG images included with `\includegraphics` (pass them in `files`) go into
the PDF — something DVI-to-SVG cannot do. Including another PDF as an image is
not supported. pdfTeX's PDFs are byte-identical to TeX Live's
`latex -output-format=pdf` apart from the version number in the producer string
(`npm run test:golden:pdf`). Each call is one TeX pass: for cross-references, a
table of contents or hyperref's outlines, run twice, handing the first run's
`artifacts` (the `.aux`, `.out`, `.toc` files) back as `files`. SVG remains the
default, and nothing about it changed.

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
- [`patches/`](patches/): the twelve MetaPost patches and one each for
  LuaTeX, `luaotfload.sty` and dvisvgm, each explained.
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
A body that is already a picture (`tikzpicture`, `\tikz`, `axis`) is not put
inside another `tikzpicture`. One that *starts* with a package's own picture —
`\begin{tikzcd}`, `\begin{circuitikz}`, `\chemfig`, `\schemestart` — is not
either, and gets `\documentclass[border=…]{standalone}` with TikZ loaded by
hand, because standalone's `tikz` option crops only `tikzpicture`s. Name the
package in `data-packages` (`tikz-cd`, `circuitikz`, `chemfig`); chemfig,
circuitikz and tikz-3dplot are bundled.
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

**Live elements.** `<tikz-diagram>` and `<metapost-diagram>` typeset again
when they change: new text content (`el.textContent = …`), the `source`
property (`el.source = …`; reading it gives the diagram's source, since the
element's children are the figure), or an attribute that affects the output
(`class`, `style`, `id`, `aria-*` and the like do not count). Changes are
debounced — `data-debounce` in milliseconds, default 200 — the old figure stays
up, dimmed, until the new one is ready, and a result overtaken by a later
change is dropped, so an editor can set `source` on every keystroke. An
unchanged source is not typeset again, moving an element in the document does
not re-render it, and an element with no content waits for some. The
`mp-tikz-wasm:rendered` event says `update: true` for a re-render, and
`mpTikzWasm.figures()` (hence `saveFigures()`) lists only figures still shown.
The two `<script>` forms render once: they are replaced by their figure.

**Ids and classes in the SVG.** The bundled TikZ library `svg.attributes`
(`\usetikzlibrary{svg.attributes}`, or `data-libraries="svg.attributes"` on a
tag) adds three keys for any scope, path or node: `svg class=<classes>`
(repeatable), `svg id=<id>` and `svg attributes={name="value", …}` (spaces or
commas between pairs; unbalanced quotes are a TeX error). They land on
the `<g>` PGF itself opens for that scope, path or node — through the same hook
TikZ's `rdf` library uses — so nothing has to be balanced by hand, and under a
non-SVG driver (pdfTeX, dvips) they do nothing, so one source builds anywhere.
A clip path gets no `<g>`, so its attributes are dropped. Classes pass as
written; the tags and `renderFigure()` prefix ids per figure (`id="box"`
becomes `mpwHASH-box`), so select by class, or by `[id$="-box"]`.

**Replacing the element (`data-replace`).** With `data-replace` on a
`<tikz-diagram>` or `<metapost-diagram>`, a successful render replaces the
element by the `<svg>` itself; the element's `id`, `class` and `style` move to
the SVG root. The diagram is then plain SVG in the page — what reveal.js needs
to step through fragments inside it — and static: it no longer re-typesets. A
failed render keeps the element and its diagnostics. The rendered event is
dispatched from the SVG after the swap, with `replaced: true`.

```html
<section>
  <tikz-diagram data-replace data-libraries="svg.attributes" class="r-stretch">
    \draw[thick] (0,0) rectangle (4,3);
    \begin{scope}[svg class=fragment]\fill[red!60] (1,1) circle (0.5);\end{scope}
    \begin{scope}[svg class={fragment fade-up}]\fill[blue!60] (3,1) circle (0.5);\end{scope}
    \node[svg class=fragment, svg attributes={data-fragment-index="0"}] at (2,2.5) {first};
  </tikz-diagram>
</section>
```

Checked with reveal.js 5 in Chrome: the three groups step in the right order
(`data-fragment-index` honoured) with no `Reveal.sync()` — reveal looks
fragments up as it navigates, and its CSS hides a `.fragment` the moment the
SVG arrives.

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
re-renders them). Each page's figures are typeset with the bundles its loader
names in `data-bundles` (`+classico`, `+opentype`), as in the browser, and
`--base=DIR` resolves `data-figures` against DIR instead of the page's own
directory (for a rendered copy of a PHP page saved elsewhere). Each saved SVG carries its fonts and namespaced ids, so it
also works as a plain image anywhere. `mpTikzWasm.figures()` lists them. A
page whose figures are all saved (or cached) loads five small JavaScript
modules, about 17 KB gzipped: the library, the WebAssembly engines and the
bundle manifests are fetched only when a figure turns out to be missing.

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

const p = await mp.latex(document, { output: 'pdf' });     // or PDF, from pdfTeX's / LuaTeX's own back end
p.pdf               // Uint8Array
```

Options and result types are documented in [`src/ts/types.ts`](src/ts/types.ts)
and [docs/08](docs/08-javascript-api.md). Two worth knowing: `prefetch:
['latex']` fetches the files a first LaTeX run needs in parallel before it
(the tags do this by themselves), and `timeoutMs` is a stall limit, not a
total: a run is killed only when nothing happens for that long (no progress
event, no line of engine output), so a slow first load is never cut short. The
watchdog needs a worker it can terminate: browsers use a Web Worker by default;
**in Node, pass `worker: true`** (a `worker_threads` thread), otherwise the
engines run in-process and a document that loops forever — native TeX loops the
same way — cannot be stopped. `runScript`, `makeText` and `onFindFile` need
in-process mode. `MetaPostPool` runs batch work across several
workers.

**Untrusted sources.** Output is only as trustworthy as its source. MetaPost's
`special` and dvisvgm's `raw` specials (`\special{dvisvgm:raw …}`, which PGF's
own driver uses) put arbitrary markup into the SVG, so TeX or MetaPost written
by someone else can produce `<script>`, event handlers or `javascript:` links.
The tags and `renderFigure()` insert SVG as is: right for a page's own
diagrams, wrong for anyone else's. Before inserting SVG from an untrusted
source, sanitise it with [DOMPurify](https://github.com/cure53/DOMPurify):

```js
import DOMPurify from 'dompurify';

function safeSvg(svg) {
  const clean = DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true }, ADD_TAGS: ['use'] });
  const t = document.createElement('template');
  t.innerHTML = clean;
  // <use> is allowed for the glyphs; only same-document references may stay
  for (const u of t.content.querySelectorAll('use')) {
    if (!(u.getAttribute('href') ?? u.getAttribute('xlink:href') ?? '').startsWith('#')) u.remove();
  }
  return t.innerHTML;
}
```

Checked in Chrome: shadings, patterns, opacity, tikz-cd, MetaPost labels and a
`fonts: 'woff2'` figure keep every element and attribute (the embedded faces
load from the kept `<style>`), while a figure whose TeX injected `<script>`,
`onerror`, a `javascript:` link, an external `<use>` and `foreignObject` loses
all five and keeps its drawing. `sanitizeSvg()` is **deprecated**: it is a
regular-expression allow-list, not a security boundary, and it destroys
shadings, patterns and web fonts. It stays exported, unchanged, until 1.0.

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
npx mpost-wasm --latex --pdf paper.tex                    # paper.pdf (with --stdout, the PDF on stdout)
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
| `dvisvgm.wasm` | 2.7 MB | dvisvgm 3.4.3 with FreeType, potrace, clipper, woff2 and PGF's special handlers; PostScript through the optional Ghostscript module |
| `luatex.wasm` | 4.4 MB, on demand | LuaTeX 1.21.0 in DVI mode with Lua 5.3, pplib, zziplib and the font loader; no C FFI |
| `ghostscript/gs.wasm` | 12.5 MB (8.6 MB gzipped), opt-in, on demand, its own release archive | Ghostscript 10.08.0 (AGPL), the PostScript and PDF interpreters with their fonts; loaded only for documents whose PostScript needs it |
| `bundles/` | 92 MB on the server (60 MB default, 20 MB opt-in OpenType, 10 MB opt-in PostScript, 1 MB opt-in URW Classico), per file on demand | Computer Modern, AMS, Latin Modern and the 35 PostScript fonts; plain, LaTeX and TikZ formats; PGF/TikZ with every library, pgfplots, tikz-cd, spath3 (the `calligraphy` and `knots` libraries, which pgf does not ship), chemfig, circuitikz, tikz-3dplot, this project's `svg.attributes` TikZ library, amsmath, mathtools, xcolor, standalone, geometry, hyperref, listings and more; opt-in, PSTricks and dvips's PostScript headers |

Typical timings on an Apple-silicon laptop: a geometry figure 14 ms, a LaTeX
label with amsmath 185 ms cold and 5 ms warm, a TikZ standalone figure about
120 ms, a pgfplots axis about 270 ms, three graph-drawing layouts under LuaTeX
about 450 ms.

## Fidelity and tests

- MetaPost golden corpus: 15 cases, EPS and SVG byte-identical to `mpost`,
  plain TeX and LaTeX labels included.
- TikZ golden corpus: 16 documents byte-identical to `latex` or `dvilualatex`
  plus `dvisvgm`, with and without the snapshot format. Four of them are
  PostScript (PSTricks, EPS, graphicx transforms, raw `ps:`), compared with
  `dvisvgm --libgs` and a native Ghostscript of the same 10.08.0 tree.
- PDF golden corpus: 5 documents byte-identical to TeX Live's PDF output apart
  from the version string.
- The whole PGF manual, 1181 pages: DVI byte-identical to native `latex`,
  every SVG page identical to native dvisvgm after normalising dvisvgm's own
  run-to-run glyph aliasing.
- MetaPost's `mtrap` test: output files identical to native MetaPost 2.11.
- 296 unit and end-to-end tests, a 48-check native contract harness, and a
  memory test that fails if 300 runs leave a single byte allocated.

## Limits

PostScript (PSTricks, EPS images, raw `\special{ps: …}`, and graphicx's
`\rotatebox`/`\scalebox` under its default dvips driver) needs the opt-in
`ghostscript` bundle and the Ghostscript module (see below). Without them
dvisvgm skips it, and `latex()` adds a warning when that loses part of the
picture. No `\write18`, no interactive error recovery.
The `runScript` and `makeText` callbacks force in-process mode. XeTeX is not
included — OpenType fonts come from LuaTeX instead, see below. OpenType
shaping is luaotfload's Lua `mode=node`, not HarfBuzz (this is `luatex`, not
`luahbtex`), so `mode=harf` and Graphite features are out.

### PostScript: PSTricks and EPS

dvisvgm draws PostScript through Ghostscript, which here is a separate wasm
module (Ghostscript 10.08.0, AGPL, its own release archive). It is loaded only
when a document's DVI carries PostScript that would otherwise be lost, and never
linked with the engines. Turn it on with the `ghostscript` bundle, which also
brings dvips's PostScript headers and the PSTricks family:

```js
const mp = await MetaPost.create({ bundles: [...DEFAULT_BUNDLES, 'ghostscript'] });
await mp.latex(String.raw`\documentclass{article}\usepackage{pstricks}
\begin{document}\begin{pspicture}(3,2)\pscircle[linecolor=red](1.5,1){0.7}\end{pspicture}\end{document}`);
```

or `data-bundles="+ghostscript"` on the drop-in loader (`ghostscript: true`
with `texmfDir`). EPS images, files the document wrote itself included, are
opened by Ghostscript from the job's directory. The output is byte-identical to
TeX Live's dvisvgm with Ghostscript 10.08.0 on the PostScript golden cases. A
document with PostScript takes about 0.2 s here; documents without it never load
Ghostscript. Source build: `scripts/vendor-ghostscript.sh` copies the pinned
module from the Ghostscript port (`vendor/GHOSTSCRIPT.lock`).

### OpenType fonts

`\usepackage{fontspec}` with real OTF/TTF faces works under the `lualatex` and
`luatex` engines, through luaotfload. It is **opt-in**, because LaTeX probes for
luaotfload at start-up and finding it makes every LuaTeX run initialise it —
214 ms → 396 ms for a document that never asks for it. Add one or both bundles:

```js
import { MetaPost, DEFAULT_BUNDLES } from 'mp-tikz-wasm';
const mp = await MetaPost.create({ bundles: [...DEFAULT_BUNDLES, 'opentype'] });
await mp.latex(String.raw`
\documentclass{article}\usepackage{fontspec}
\setmainfont{Latin Modern Roman}
\begin{document}Real OpenType, ligatures and all: fi ffl.\end{document}`,
  { engine: 'lualatex' });
```

`opentype` carries luaotfload, `fontspec`, `unicode-math` and the whole Latin
Modern text family, every optical size the class options and size commands can
select, each face fetched on demand; add `'otf-fonts'` as well for
`unicode-math`'s maths font.

To use a font the host has rather than a bundled one — a system face in an
Electron app, say — hand over the bytes and name it with a relative path:

```js
await mp.addFiles({ 'Charter.ttf': bytes });     // e.g. from queryLocalFonts()
await mp.latex(doc, { engine: 'lualatex', fonts: 'woff2' });
//   \setmainfont{Charter.ttf}[Path=./]
```

Pair that with `fonts: 'woff2'`, which embeds a subset of the face in the SVG
as `@font-face` and emits real `<text>`: the diagram then renders through the
browser's own text rasteriser, in the same font file the page's CSS loads. The
default `fonts: 'paths'` writes glyph outlines instead — self-contained, but
without hinting, and heavier (34.9 KB against 6.8 KB on one line of text).
Note that only the *font* comes from the browser; the positions are TeX's, so
the result does not reflow.

Plain LuaTeX (`engine: 'luatex'`) has it too, without `fontspec`:

```tex
\input luaotfload.sty
\font\body="[lmroman10-regular.otf]:mode=node;+liga;+kern" at 10pt
\body Real OpenType from plain TeX: fi ffl.
\bye
```

Stock TeX Live cannot typeset that to DVI — luaotfload's DVI module needs a
shipout hook that only the LaTeX kernel provides — so the bundled
`luaotfload.sty` carries a small patch that adds the hook for plain TeX
(`patches/texmf/0001`, below).

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
- **Optional, for PostScript: the Ghostscript port**, a separate project that
  builds Ghostscript to wasm. `scripts/vendor-ghostscript.sh` copies its pinned
  build (`vendor/GHOSTSCRIPT.lock`) from `GS_DIR` (default `~/Source/ghostscript`).
  Without it the build skips `dist/ghostscript`, and PostScript stays skipped
  with a warning.
- **Disk and time.** About 3 GB in the checkout (the vendored TeX Live source
  is 1.1 GB unpacked, the native builds 0.8 GB) plus 1.8 GB for Emscripten.
  The native LuaTeX pass takes several minutes; the rest a few minutes each.

### Steps

```sh
git clone https://github.com/jmckalex/mp-tikz-wasm.git && cd mp-tikz-wasm
npm install
./scripts/extract-vendor.sh      # fetch and verify the pinned TeX Live 2025 source (111 MB)
./scripts/verify-pin.sh          # assert the mplib API the design relies on
make contract                    # native mplib + 48 checks
scripts/native-texlive.sh        # once: the native web2c pass that generates pdfTeX's C
scripts/native-dvisvgm.sh        # once: dvisvgm's configure
scripts/native-luatex.sh         # once: native LuaTeX build, compile commands recorded for emcc
scripts/vendor-ghostscript.sh    # optional: the pinned Ghostscript module (GS_DIR)
npm run build                    # mplib.wasm, tex.wasm, luatex.wasm, dvisvgm.wasm, dist/ghostscript, texmf, formats, bundles, TypeScript
npm test                         # unit + end-to-end
npm run test:golden              # MetaPost corpus vs native mpost
npm run test:golden:tikz         # TikZ corpus vs native latex/dvilualatex + dvisvgm
npm run demo                     # the editor demo at http://localhost:8080/site/
```

`npm run build:guide`, `build:pages` and `build:standalone` regenerate the
feature guide, the two single-file pages and the single-file playground.

### Publishing

`npm run package` writes the release archives to `release/`: the main one, and
`mp-tikz-wasm-ghostscript-<version>` with `dist/ghostscript/` when it was built
(Ghostscript is AGPL, so it ships apart). Upload all of them to a GitHub release, which is where the guide's "Get it" section sends people.
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

One patch applies to a bundled macro package, in `patches/texmf/` (applied by
`scripts/build-texmf.sh` to the assembled `build/texmf` tree; TeX Live's own
copy is never modified, and a patch whose target this TeX Live lacks is skipped):

| # | File | Why |
| --- | --- | --- |
| texmf 0001 | `luaotfload.sty` | **upstream gap:** luaotfload's DVI module registers on `pre_shipout_filter`, a callback that the LaTeX kernel creates and calls from its `\shipout`. Plain TeX has neither, so every OpenType `\font` under `dviluatex` failed with "Unable to register callback" then "not loadable" — in stock TeX Live too. The patch creates the callback and calls it from a `\shipout` wrapper (the `everyshi` idiom), under plain TeX in DVI mode only |

Two patches apply to dvisvgm, in `patches/dvisvgm/` (applied by
`scripts/build-dvisvgm-wasm.sh` to a copy of its `src/` under
`build/dvisvgm/patched`):

| # | File | Why |
| --- | --- | --- |
| dvisvgm 0001 | `Font.cpp`, `Font.hpp`, `FontManager.cpp` | **upstream defect:** a native font was keyed by file path and style, not by face index, so every face of a TrueType Collection (`.ttc`) after the first was taken for a copy of it: in paths mode their glyphs were drawn from the first face's outlines, and with `fonts: 'woff2'` they shared one `@font-face`. luaotfload writes the index into the DVI and dvisvgm reads it; the key now includes it. Unchanged in upstream dvisvgm 3.6.1. Other fonts always have index 0, so their SVG has the same content as before (the order of glyph definitions, which follows heap addresses, can move) |
| dvisvgm 0002 | `DLLoader.hpp`, `DLLoader.cpp` | **wasm-only:** an Emscripten build without dynamic linking cannot `dlopen` libgs, so it was built with `DISABLE_GS` and skipped all PostScript. Under `__EMSCRIPTEN__`, `DLLoader` now asks `mpw_dlopen`/`mpw_dlsym`, which `src/c/gs-bridge.c` answers with `gsapi_*` proxies for a separate Ghostscript module, and with nothing when that module is not loaded |

## Licence

This project's own code is LGPL-3.0-or-later (`LICENSE`). The wasm modules
combine it with upstream software under its own terms: MetaPost is public
domain, but `mplib.wasm` includes `avl.c` (LGPL) and decNumber (ICU), so it is
LGPL-3.0-or-later too; `tex.wasm`, `luatex.wasm` and `dvisvgm.wasm` are GPL.
The optional Ghostscript module (`dist/ghostscript/`, its own release archive)
is AGPL-3.0: a separate module that dvisvgm reaches through a bridge, never
linked with the others; whoever serves or ships it must offer its source,
which each release carries as `mp-tikz-wasm-ghostscript-<version>-source.tar.gz`
(`dist/ghostscript/SOURCE.md`). The fonts and macro packages in the bundles keep their own licences (Knuth's,
AMS, GUST, LPPL). [`NOTICE.md`](NOTICE.md) lists every part, and `licenses/`
holds the full texts.

## Repository map

`src/c` is the C shim around mplib, and the bridge through which dvisvgm reaches
Ghostscript (`gs-bridge.c`); `src/ts` the library, worker, TeX bridge, tag
renderer, CLI and Ghostscript loader (`ghostscript.ts`); `patches/` the upstream patches; `scripts/` the build
pipeline, each script's header saying what it does; `site/` the demo pages and
the guide template; `test/` the contract harness, unit tests, golden corpora
and leak harness; `docs/` the design documents and implementation notes, with
[HANDOVER.md](HANDOVER.md) as the hand-over summary; `bundles/texmf.cnf`
the kpathsea configuration inside the virtual filesystem; `vendor/GHOSTSCRIPT.lock`
the pin of the Ghostscript build.

## Credits

MetaPost by John Hobby, maintained by Taco Hoekwater and Luigi Scarso; pdfTeX
by Hàn Thế Thành and the pdfTeX team; LuaTeX by the LuaTeX team; dvisvgm by
Martin Gieseking; PGF/TikZ by Till Tantau and its maintainers; all from TeX
Live 2025. PSTricks by Timothy Van Zandt, maintained by Herbert Voß. Ghostscript
by Artifex Software, built to WebAssembly by the Ghostscript port. Built with
Emscripten.
