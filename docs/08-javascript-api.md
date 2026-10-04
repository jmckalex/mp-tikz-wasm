# 08 — JavaScript / TypeScript API

The full declaration file is in `reference/api.d.ts`. This document explains the
choices behind it.

## 1. Shape

```ts
import { MetaPost } from 'mp-tikz-wasm';

const mp = await MetaPost.create({
  bundles: ['core', 'cm-tfm', 'cm-type1', 'latex'],
  tex: 'auto',
});

const result = await mp.run(`
  verbatimtex \\documentclass{article}\\usepackage{amsmath}\\begin{document} etex
  beginfig(1);
    draw fullcircle scaled 100;
    label.top(btex $\\int_0^\\infty e^{-x^2}dx=\\tfrac{\\sqrt\\pi}{2}$ etex, (0,50));
  endfig;
  end.
`);

document.body.innerHTML = result.figures[0].svg;
```

Design rules:

`run(source)` writes `source` to `/work/<jobName>.mp` and drives MetaPost with
the one-line string `input <jobName>` — never by passing the source to
`mp_execute` directly, which reads only one line (`docs/04` §2b). Callers never
see this; it is noted here because it is the first thing an implementer gets
wrong.

* **`create()` is async, `run()` is async, everything else is sync.** The async
  boundary is where wasm instantiation and asset fetching happen.
* **One `MetaPost` object owns one worker.** `run()` serialises onto it. For
  parallelism, create more.
* **No global state.** Two instances with different bundles coexist.
* **Errors are values, not exceptions**, for MetaPost-level problems.
  Exceptions are reserved for host-level failures (wasm won't load, bundle 404).
  A MetaPost syntax error is a normal result with `status: 'error'`.

## 2. Options

```ts
interface MetaPostOptions {
  bundles?: (BundleName | BundleSpec)[];
  bundleBaseUrl?: string;

  numberSystem?: 'scaled' | 'double' | 'decimal' | 'binary' | 'interval';
  tex?: 'none' | 'plain' | 'etex' | 'latex' | 'auto';
  texPreamble?: string;               // MPTEXPRE equivalent

  deterministic?: boolean;            // default true: fixed seed + frozen date
  randomSeed?: number;
  interaction?: 'batch' | 'nonstop' | 'scroll';
  haltOnError?: boolean;
  extensions?: boolean;               // default true; false = classic .mpx path
  troff?: boolean;                    // default false; unsupported, see PLAN §1.2

  memoryLimitBytes?: number;          // default 512 MiB
  timeoutMs?: number;                 // default 20 000: a stall limit (no progress event for this long), not a total
  prefetch?: PrefetchKind[];          // 'metapost' | 'latex' | 'lualatex' | 'plain': fetch a first run's files in parallel after create()
  maxTexRuns?: number;                // default 5 (the fixpoint cap)

  runScript?: (code: string) => string;   // enables `runscript`; off if absent
  makeText?: (text: string, verbatim: boolean) => string | undefined;

  cache?: 'indexeddb' | 'memory' | 'fs' | false;
  cacheBudgetBytes?: number;
  logLevel?: 'silent' | 'error' | 'warn' | 'info' | 'debug' | 'trace';   // default 'warn'; §4
  logger?: (record: LogRecord) => void;   // receives the records instead of the console
  log?: (line: string) => void;           // every raw engine line, whatever the level
}

interface RunOptions {
  format?: 'svg' | 'eps' | 'json' | 'binary' | 'png' | 'none' | ('svg'|'eps'|'json')[];
  prologues?: 0 | 1 | 2 | 3;          // default 3 for svg, 0 for eps
  files?: Record<string, string | Uint8Array>;
  jobName?: string;
  internals?: Record<string, number | string>;   // like mpost -s NAME=VALUE
  signal?: AbortSignal;
}
```

`format` accepting an array matters: the backends run over the already-exported
edge list, so producing SVG *and* JSON costs one extra walk, not one extra run.

## 3. Results

```ts
interface RunResult {
  status: 'ok' | 'warning' | 'error' | 'fatal';
  history: 0 | 1 | 2 | 3 | 4;          // mplib's history value, verbatim
  figures: FigureResult[];
  log: string;                          // MetaPost term_out + log_out
  texLog?: string;                      // the batched TeX run's log
  diagnostics: Diagnostic[];
  stats: { totalMs: number; metapostMs: number; texMs: number;
           texRuns: number; cacheHits: number; cacheMisses: number };
}

interface FigureResult {
  charcode: number;                     // the `beginfig(N)` number
  bbox: [number, number, number, number];
  svg?: string; eps?: string; json?: Figure; binary?: ArrayBuffer; png?: Blob;
}

interface Diagnostic {
  severity: 'error' | 'warning';
  source: 'metapost' | 'tex' | 'bundle' | 'host';
  message: string;
  help?: string[];                      // mplib supplies these; keep them
  file?: string; line?: number; column?: number;
  snippet?: string;                     // for TeX errors: the btex block
}
```

`figures` is empty when the source never calls `beginfig`/`shipout` — that is
not an error.

### 3.0 LaTeX results, and PDF output

`mp.latex(source, options)` returns a `LatexResult`: `status` (`ok` | `error` |
`fatal`), `pages` (one SVG per page), `pdf` (with `output: 'pdf'`), `log`,
`texLog`, `dvisvgmLog`, `diagnostics`, `stats`, `format` and `artifacts` (every
other file the run wrote: `.aux`, `.out`, `.toc`, …).

`output: 'pdf'` (default `'svg'`) runs the engine with `-output-format=pdf`, so
pdfTeX (`\pdfoutput`) or LuaTeX (`\outputmode`) writes the PDF itself after
loading the same formats; the source is not touched, so line numbers in
diagnostics are unchanged. PGF gets `pgfsys-pdftex.def` or `pgfsys-luatex.def`
instead of the dvisvgm driver, the TikZ snapshot format (which has the dvisvgm
driver built in) is never used, dvisvgm does not run, and `fonts`, `bbox`,
`pages`, `dvisvgmArgs` and `svg` are ignored. PNG and JPEG images in `files`
can be included; PDF images cannot (`tex.wasm` is built without pdfTeX's PDF
parser). One TeX pass per call: run twice with the first run's `artifacts`
passed back as `files` for cross-references and outlines. Fidelity: pdfTeX's
PDFs equal TeX Live's `latex -output-format=pdf` byte for byte apart from the
pdfTeX version in the producer strings (`scripts/golden-pdf.mjs`); LuaTeX's are
checked for content (pages, embedded faces) by the e2e tests.

### 3.1 Diagnostics are a feature, not an afterthought

MetaPost's errors are unusually good (`mp_error` carries a `help[]` array
written by Hobby and Knuth). Parse them and keep them. The Knuthian format is:

```
! Undefined x coordinate has been replaced by 0.
<to be read again>
                   ;
l.4 draw z1--z2;
```

`term_out` is the source. The parser lives in `src/ts/diagnostics.ts` and is
itself golden-tested against a corpus of deliberately broken inputs.

For TeX errors, map DVI page → btex block → file+line using the
`% line N file` comments `mpto` emits (`docs/05` §3.1).

## 4. Streaming, progress and logging

```ts
mp.on('progress', e => …);   // 'loading' | 'fetching' | 'scanning' | 'typesetting' | 'running' | 'rendering'
mp.on('log', line => …);     // every line the engines print, live (MetaPost's terminal included)
mp.on('record', r => …);     // the levelled log: { level, source, message, time }
mp.logLevel = 'debug';       // silent | error | warn | info | debug | trace
```

**MetaPost's terminal is streamed as it is written** (done in session 5).
`mplib` in non-interactive mode buffers `term_out` until `mp_execute`
returns, and it installs its own `write_ascii_file` *after* the options are
applied, so setting `opt->write_ascii_file` is not enough. The shim wraps that
writer after `mp_initialize` (`mpwasm_write_ascii_file` in
`src/c/mpwasm_api.c`, which needs the internal `mpmp.h` for the instance
struct) and hands each completed line to the host through
`mpwasm_host_term_line`, a JS-library import like the other hooks; the banner,
printed during `mp_initialize`, is replayed from the buffer. The buffer is
still filled, so `mpwasm_term_out` is unchanged, and the contract harness
checks that the streamed lines equal it byte for byte.

**Levels.** Every part of a run reports through one `Logger`
(`src/ts/logger.ts`): a level checked at call time (so `mp.logLevel` takes
effect for the next line an engine prints) and a sink. The default sink
writes to the console as `mp-tikz-wasm tex: …`, with `console.error`, `warn`
and `info` by level and `console.log` for `debug` and `trace` (Chrome hides
`console.debug` under "Verbose" by default, and someone who asked for the
engines' output should see it). The `logger` option replaces the sink. In the
Worker the records cross to the main thread, where the sink runs; a
`setLogLevel` message changes the level inside the Worker, so what the level
excludes is never posted.

| level   | adds                                                                 |
|---------|----------------------------------------------------------------------|
| `error` | the errors of every run: MetaPost (with the help paragraph), TeX (with the document line), dvisvgm, bundles, the host (a failed call, the watchdog) |
| `warn`  | warnings: MetaPost `Warning:`, LaTeX package and class warnings (the default) |
| `info`  | engine ready; one line per run start and end, with timings; one per TeX and dvisvgm pass; prefetch summaries |
| `debug` | the engines' terminal output, line by line, live; the phases; on-demand bundle loads |
| `trace` | every `find_file` that reached the host, every file MetaPost opened, every label-cache lookup, every file fetched |

The CLI maps `-v`, `-vv`, `-vvv` and `-q` onto `info`, `debug`, `trace` and
`silent` (`--log-level=` names one directly), writes the records to stderr so
stdout stays the transcript, and leaves MetaPost's own errors and warnings out
because the transcript carries them, as with `mpost`. The tags take
`data-log="debug"` on the loader script and `mpTikzWasm.setLogLevel()` later.

### 4.1 OpenType fonts: the `opentype` and `otf-fonts` bundles

`\usepackage{fontspec}` with real OTF/TTF faces works under `engine:
'lualatex'` (and `'luatex'`) once the `opentype` bundle is loaded. It is not a
default bundle, and the reason is behavioural rather than about size: LaTeX
under LuaTeX probes for luaotfload at start-up, so a findable luaotfload is an
*initialised* luaotfload on every run — measured here, a document with no
`fontspec` in it went from 214 ms to 396 ms and from 6.6 MB fetched to 11.9 MB.
Graph drawing would pay that for nothing, so the caller asks:

```js
import { MetaPost, DEFAULT_BUNDLES } from 'mp-tikz-wasm';

const mp = await MetaPost.create({ bundles: [...DEFAULT_BUNDLES, 'opentype'] });
const r = await mp.latex(doc, { engine: 'lualatex' });
```

| bundle | holds | when |
| --- | --- | --- |
| `opentype` | luaotfload, `lualibs`, `fontspec`, `unicode-math`, `lualatex-math`, the Unicode tables, and the whole Latin Modern text family — all 72 faces, every optical size and shape the kernel's TU fd files can select | any `fontspec` document |
| `otf-fonts` | `latinmodern-math` | `unicode-math` |

Every bundle file is fetched on demand, so a document costs only the faces it
selects; the family has to be complete because the fd files name faces by
optical size (a 12pt class wants `lmroman12-*`, `\small` `lmroman9`, `\textsc`
`lmromancaps10`) and NFSS fails at the first face that is missing. `opentype`
also carries luaotfload's font-name database, prebuilt against the bundled
tree, so a fresh engine does not open every face to build one: a 12pt article
fetches the four faces it sets (0.44 MB), not all 72 (7.4 MB). A face looked
up by a name the database does not know — one the host supplied, say — makes
luaotfload rescan, and that run pays for every face in the loaded bundles, once
per engine. `otf-fonts` is separate so that such a rescan stays no larger than
it must be, and because an application that supplies its own faces wants the
machinery and none of the fonts.

**A face the host supplies.** `addFiles()` writes into the TeX run's working
directory, and `TEXMFDOTDIR` leads `OPENTYPEFONTS`/`TTFONTS` in the bundled
`texmf.cnf`, so a relative `Path=` finds it:

```js
await mp.addFiles({ 'Charter.ttf': bytes });   // browser: queryLocalFonts(); Node: readFileSync
await mp.latex(String.raw`
  \documentclass{article}\usepackage{fontspec}
  \setmainfont{Charter.ttf}[Path=./]
  \begin{document}...\end{document}`, { engine: 'lualatex', fonts: 'woff2' });
```

**`fonts: 'woff2'` is what makes it match the page.** dvisvgm then embeds a
subset of the face as `@font-face` and emits real `<text>`, so the diagram is
rasterised by the browser's own text renderer from the same font file the
page's CSS loads. The default `'paths'` writes glyph outlines: self-contained
and identical everywhere, but unhinted and about five times larger. Either
way the glyph *positions* are TeX's, written out one by one — the SVG does not
reflow.

**The font cache.** Parsing a face costs about a second and each TeX run gets a
fresh filesystem, so the instance carries luaotfload's `/texmf-var` cache from
one run to the next (1052 ms → 430 ms on a repeat; `trace` logs its size). It
lives as long as the instance and is not yet persisted across sessions.

### 4.1a Caching bundle files

Every bundle file's URL carries the hash the manifest records for it
(`…/files/<path>?v=<sha>`), so a rebuilt file has a new URL and an HTTP cache
can never hand back a stale copy; an unchanged file can be cached for good.
Manifests and hot lists (which name the current files) are fetched with
`cache: 'no-cache'`, so they are revalidated on every start-up (a 304 when
unchanged). A custom `bundleIO`, or a custom URL scheme serving the bundles,
should look files up by path and ignore the query. Node strips it before
reading from disk.

### 4.2 URW Classico: the `classico` bundle

Hermann Zapf's revision of his Optima for URW++, with Michael Sharpe's LaTeX
support from CTAN. Opt-in, and the one bundle that is not free software: its
fonts are under the Aladdin Free Public License, which allows non-commercial
distribution only (`NOTICE.md`), so TeX Live leaves it out and it is built from a
local install (a tree without one builds an empty bundle). Ask for it with
`bundles: [...DEFAULT_BUNDLES, 'classico']`, or `data-bundles="+classico"` on the
tags' loader, then in the document or `data-preamble`:

```latex
\usepackage[T1]{fontenc}\usepackage{classico}          % Classico as the sans-serif font
\usepackage[T1]{fontenc}\usepackage[sfdefault]{classico} % ... as the main font
```

`\sf`/`\sffamily`, `\textbf` and `\textit` within it pick up Classico Regular,
Bold, Italic and Bold Italic, in SVG and in PDF output (the Type 1 faces,
embedded). Under LuaLaTeX `classico.sty` loads `fontspec` for the TrueType
faces, so add the `opentype` bundle too, or pass the package's `type1` option.

## 5. The CLI

`mpost-wasm` should be a drop-in for `mpost` for the flags people actually use:

```
mpost-wasm [OPTION]... [&MEMNAME] [MPNAME[.mp]] [COMMANDS]
mpost-wasm --dvitomp DVINAME[.dvi] [MPXNAME[.mpx]]

  -interaction=MODE     batchmode|nonstopmode|scrollmode
  -numbersystem=SYSTEM  scaled|double|binary|interval|decimal
  -jobname=STRING
  -tex=PROGRAM          tex|latex|etex   (we accept only these)
  -s INTERNAL=VALUE
  -T, -troff            accepted, warns that troff mode is unsupported
  -file-line-error
  -halt-on-error
  -recorder             writes a .fls listing every file opened
  -help  -version

  --texmf=DIR           extra texmf root (MPWASM_TEXMF)
  --bundle=NAME         add a bundle
  --format=svg|eps|json default eps, matching upstream

mpost-wasm --prerender [--figures=DIR] [--force] [--dry-run] PAGE.html...
```

Accept and ignore with a warning: `-ini`, `-mem=`, `-progname=`,
`-kpathsea-debug=`, `-restricted` (we are always restricted), `-debug`.

Exit codes must match `mpost`: 0 on success, 1 on error. Output files go to the
CWD with the same `outputtemplate` semantics (`%j`, `%c`, `%d`, …).

### 5.1 Saved figures: `--prerender` and `mpTikzWasm.saveFigures()`

The drop-in tags (`auto.ts`) identify every diagram element by
`figureHash()` (`figures.ts`): six lowercase base-36 characters of the SHA-256
of its kind, the attributes that change the output (`fonts`, `tex`, `engine`)
and the wrapped document. That one identity names the IndexedDB entry, the
SVG id prefix (`mpwHASH-`) and the saved file `figure-HASH.svg`. The engine
build is left out on purpose: the hash identifies the source, so saved files
survive a library upgrade (re-run with `--force` after one that changes the
output).

`mpost-wasm --prerender page.html …` reads each page, finds the four tag forms
as the browser would (script bodies raw, custom-element bodies and attribute
values entity-decoded), typesets each element with the browser's defaults
(deterministic, seed 42) and writes the file into the directory the page's
loader names in `data-figures` (default `figures/`, next to the page) or into
`--figures=DIR`; `--base=DIR` resolves each page's `data-figures` against DIR
instead of the page's own directory, for a rendered copy saved elsewhere. Each
page's figures get the bundles its loader names in `data-bundles`, parsed as
`auto.js` parses them (`bundleList()` in `figures.ts`, shared by both), with an
engine per distinct list; `--opentype` adds the OpenType bundles to every page,
and `createOptions.bundles` (API) overrides the pages. Files that exist are
kept; `--force` re-renders; `--dry-run` lists. Exit 1 if any figure failed (nothing is written for it, so it is tried
again next time). `prerender()` in `dist/prerender.js` is the same thing as a
function.

In the browser, with `data-figures="figures/"` on the loader, `render()`
looks in IndexedDB, then fetches `figures/figure-HASH.svg` (a 404, or a
server that answers every path with its index page, is a miss), and only then
starts an engine — so a page whose figures are all saved loads no wasm, no
bundle manifest, and (since 0.3.1) only five small modules: `auto.js`,
`figures.js`, `logger.js`, `bundles-config.js` and `tex/cache-key.js`, about
17 KB gzipped. `auto.js` imports `index.js`, and with it the rest of the
library, only where it creates the engine.
`mpTikzWasm.saveFigures()` waits for renders in flight and writes every
successful figure into a folder chosen with the File System Access API
(Chrome, Edge; call it from the console or a click) or, elsewhere or with
`{ zip: true }`, downloads a store-only zip; `mpTikzWasm.figures()` returns
the list. A MetaPost element with several `beginfig` blocks saves the several
`<svg>` roots it injects, joined by newlines — exact for the tags, but not a
single SVG document.

### 5.2 The drop-in tags, for reference

`dist/auto.js` (`src/ts/auto.ts`) is the tikzjax-style integration; the
README ("Drop-in tags") and the guide are the user-facing accounts. The
contract in one place:

| Form | Renders | After a change |
| --- | --- | --- |
| `<script type="text/tikz">`, `<script type="text/metapost">` | once, when found; the script is replaced by a `<figure>` | nothing (it is gone) |
| `<tikz-diagram>`, `<metapost-diagram>` | when connected (custom elements); the SVG goes in a `<figure>` inside the element | typesets again on new text content, `el.source = …`, or an output-affecting attribute; debounced |
| the same, with `data-replace` | as above, then the element is replaced by its `<svg>` root(s) | nothing: the SVG is static |

**Element attributes** (`data-` prefix optional on the custom elements):
`libraries`, `packages`, `preamble`, `border`, `gdlibraries`, `engine`
(`auto` / `latex` / `lualatex` / `luatex` / `plain`), `fonts` (`paths` /
`woff2`) for TikZ; `tex`, `prologues` for MetaPost; and for all of them `alt`,
`cache="off"`, `show-console`, `debounce` (ms, default 200; custom elements),
`replace` (custom elements). Presentational attributes (`class`, `style`,
`id`, `title`, `aria-*`, …) never trigger a re-render.

**Wrapping** (`wrapTikz`, `wrapMetaPost` in `figures.ts`): a complete document
is used as is. A TikZ body is otherwise put in
`\documentclass[tikz,border=2pt]{standalone}` with its packages, libraries
and preamble, inside a `tikzpicture` unless it is one (`tikzpicture`, `\tikz`,
`axis`). A body that starts with `\begin{tikzcd}`, `\begin{circuitikz}`,
`\chemfig` or `\schemestart` draws its own picture: it is not nested, and gets
`\documentclass[border=…]{standalone}` + `\usepackage{tikz}`, which crops any
body. A MetaPost body without `beginfig` becomes one figure, `input` lines
hoisted above it. The SVG of a wrapped body is the standalone page
(`--bbox=papersize`), border included.

**Loader attributes** (on the `<script>` that loads `auto.js`): `data-base`,
`data-bundles` (`+name` adds to `DEFAULT_BUNDLES`), `data-worker="off"`,
`data-observe="off"`, `data-snapshot="on"`, `data-prefetch="off"`,
`data-figures`, `data-cache="off"`, `data-log`.

**The `mp-tikz-wasm:rendered` event** bubbles from the `<figure>` (or, with
`data-replace`, from the `<svg>` after the swap), with `detail`: `kind`, `ok`,
`ms`, `cached`, `from` (`cache` | `file` | `engine`), `hash`, `name`
(`figure-HASH.svg`), `update` (a re-render of a live element) and `replaced`.

**`window.mpTikzWasm`**: `render({ kind, source, attrs })`, `setLogLevel()`,
`figures()` (the figures now shown, from any source), `saveFigures()`,
`addFiles()`, `figureHash()`, `figureName()`, `autoRender(root)`,
`wrapTikz()`, `wrapMetaPost()`.

**Ids and classes.** The tags prefix every id in a figure with `mpwHASH-`, so
that figures on one page cannot collide; classes are left alone. The bundled
TikZ library `svg.attributes` sets them from TikZ (`svg class`, `svg id`,
`svg attributes` on a scope, path or node); the README has the details and a
reveal.js example.

**Untrusted sources.** The tags insert SVG as is. Sanitise SVG from someone
else's source with DOMPurify (README, "Untrusted sources"); `sanitizeSvg()` is
deprecated.

## 6. Extension points

* **`runScript`** — `runscript "…"` in MetaPost calls your function; the
  returned string is injected as MetaPost source. Opt-in (`docs/10` §3).
  The obvious uses: fetching data, computing with JS libraries, calling back
  into an application's model.
* **`makeText`** — override the TeX Bridge entirely. Return MetaPost source for
  a `btex` block, or `undefined` to fall through to the normal path. This is
  the hook for "render labels with MathJax and inject them as `special`s", or
  for a *remote* TeX service:

  ```ts
  makeText: (tex, verbatim) => verbatim ? '' : cacheFromServer(tex)
  ```

  Because the callback must be synchronous, a remote service has to be primed
  asynchronously first; the fixpoint loop (`docs/05` §5) is exactly the
  mechanism for that — return `undefined` on a miss and the bridge will
  re-run after your async prefetch resolves.
* **`onFindFile`** — last-chance hook before `find_file` returns `NULL`.

## 7. Framework glue (ship as examples, not as dependencies)

* `examples/react/` — a `<MetaPost source={...} />` component.
* `examples/observable/` — a notebook cell.
* `examples/vite-plugin/` — compile `.mp` files at build time to inline SVG.
* `examples/node-cli/` — batch-convert a directory.
* `examples/editor/` — CodeMirror + live preview + error gutter, which is the
  demo that sells the project.
