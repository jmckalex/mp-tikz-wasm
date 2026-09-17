# 14 — Implementation notes

What was built, what was learned, and where the implementation knowingly
differs from the plan or from native `mpost`. Written 2026-09-12 after the
first complete build; read it together with `docs/13-verified-findings.md`.

## 1. What exists

| Piece | Where | State |
| --- | --- | --- |
| Vendored, pinned TeX Live 2025 source | `vendor/` via `scripts/extract-vendor.sh`, `vendor/SOURCES.lock` | done |
| Patches to upstream | `patches/0001…0009` | 9 patches, see §3 |
| `ctangle` built from the vendored CWEB | `Makefile` (`build/native-tools`) | done; capacities raised with `sed` |
| Native `libmplib.a` + L0 contract harness | `make contract`, `test/contract/contract.c` | 46 checks |
| `mplib.wasm` | `make wasm` → `dist/mplib.{mjs,wasm}` | 1.22 MB |
| `tex.wasm` (pdfTeX, DVI mode) | `scripts/native-texlive.sh` + `scripts/build-tex-wasm.sh` | 1.13 MB |
| texmf tree, formats, bundles | `scripts/build-texmf.sh`, `make-formats.mjs`, `build-bundles.mjs` | 1385 files, 3 formats, 6 bundles |
| TypeScript library, worker, CLI | `src/ts` → `dist/*.js` | done |
| Demo site | `site/`, `npm run demo` | done |
| Tests | unit (179), e2e, golden (15/15 byte-identical), `mtrap` | see §4 |

## 2. Design decisions taken during implementation

**`tex.wasm` took Route B** (docs/03 §4.2): the native TeX Live build is run
once (`scripts/native-texlive.sh`, `make -C texk/web2c pdftex` only) to obtain
the web2c-generated C, and `scripts/build-tex-wasm.sh` compiles those files
plus kpathsea, `lib/`, `libmd5`, `synctex` and pdfTeX's own sources with `emcc`,
using Emscripten's zlib/libpng ports. xpdf (PDF image inclusion) is replaced
by a 20-line stub (`src/c/tex/pdftoepdf-stub.c`); it can never be reached in
DVI mode. Total effort: about two hours, not the feared two days — the
generated C is plain C99.

**kpathsea keeps working unchanged** inside the wasm filesystem: a fixed
`bundles/texmf.cnf` roots everything at `/texmf`, `MKTEX* = 0` stops it from
trying to `fork` helpers, `thisProgram: '/bin/pdftex'` gives it an `argv[0]`
whose directory exists, and the bundle loader writes an `ls-R` database for the
merged tree so no directory walks are needed.

**Lazy loading is a MEMFS node with a size and no bytes**
(`src/ts/vfs/lazyfs.ts`): `stat()`, `readdir()` and kpathsea's `ls-R` lookups
work before anything is fetched; the first `read()` fetches synchronously (a
sync XHR in the Worker, `readFileSync` in Node) and the node becomes an
ordinary file. On the browser main thread there is no synchronous fetch, so
in-process mode prefetches every file of the loaded bundles.

**Formats are built by the wasm engine itself**, in Node, at bundle-build
time. `latex.fmt` is 2.2 MB with US English hyphenation only (TeX Live's is
3.6 MB with all patterns).

**Rendering is deferred** (docs/01 §4): the run collects `mp_edge_object`s and
the backends are invoked afterwards. Patch 0009 records the `prologues` and
`mpprocset` internals per figure at shipout time so the deferred backend
reproduces what an immediate one would have written.

**`make_text` results are one line.** mplib injects the returned string as a
one-line pseudo-file; an `.mpx` chunk is several lines. Newlines are joined
with spaces when serving (chunks contain no comments, so this is safe).

**Cache keys canonicalise whitespace.** The pre-scan sees `mpto`'s raw block
text; `make_text` receives mplib's trimmed, newline-to-space converted text.
Both are collapsed to single spaces before hashing so they agree; two snippets
differing only in whitespace share a chunk (TeX would typeset them the same
outside verbatim material).

**`input` files are spliced at their statement position** in the pre-scan, so
a `verbatimtex` inside `texnum.mp` (pulled in by `graph.mp`) is in the chain of
later `btex` blocks exactly as at run time. Without this, `graph.mp` documents
needed a second TeX run.

**`autoEnd`**: the driver executes `input <job>; end.` so a file that forgets
`end` finishes cleanly instead of aborting with "no legal end found". Off with
`autoEnd: false`.

## 3. Upstream defects found

All present in TeX Live 2025 (MetaPost 2.11) and in master (3.00-dev):

1. `psout.w` `mp_read_psname_table`: `static int isread` — a second `MP`
   instance in one process never reads the font map and then overflows the
   stack in the Type 1 code (patch 0003). Any multi-instance embedding hits it.
2. `mp.w`, the `extensions=1` scanner: `if (loc < limit - 4)` never matches an
   `etex` that ends a line; the rest of the file is swallowed (patch 0004).
3. `mp.w`, same scanner: requires a space before `etex`, unlike `mpto`; TeX
   Live's own `texnum.mp` writes `btex$-$etex` (patch 0008).
4. `svgout.w`: `stroke-miterlimit` for `filldraw` objects read through the
   wrong struct type — uninitialised memory (patch 0005). The oracle prints
   `0.000000`; we print the real value; the golden runner normalises it.
5. `mpxout.w`: `mpto`'s prologue is a printf format containing `%\n`. glibc
   prints the `%`, BSD libc drops it, musl prints nothing (patch 0007).
6. `psout.w` `make_subset_tag`: hashes in `unsigned long`, so 32-bit builds
   produce different font subset tags (patch 0006). Also the "crc32" is not a
   CRC; only the last ~15 characters of the input influence the tag.
7. `mp_open_mem_name` appends `.mp` unless the name ends in a 4-character
   `.mp`-containing suffix — pass `mem_name` without `.mp` (not patched).

## 4. Conformance

* **Golden corpus** (`test/golden/cases`, `node scripts/golden.mjs`): 15 cases
  covering paths, pens, fills, transforms, clipping/bounds, tier-0 labels,
  plain-TeX and LaTeX labels, `boxes`/`graph`, macros and loops, colours and
  specials, multiple figures, a mid-file `verbatimtex`, and error recovery.
  EPS and SVG are byte-identical to `mpost` run with the same frozen date
  (`-s year=2025 -s month=1 -s day=1 -s time=0`), except for the normalised
  `stroke-miterlimit` above.
* **`mtrap`**: `mtrap.mp` from `triptrap/` runs through the library in ini
  mode; `mtrap.0`, `mtrap.1`, `writeo`, `writeo.2` are identical to native
  MetaPost 2.11's modulo `%%CreationDate`, and the log differs only in the
  documented allowable ways (banner, memory/string statistics) plus one
  consequence of the library design: the run does not write figure files while
  it executes, so `mtrap.mp`'s `readfrom` of its own output reads nothing.
  The other half of the trap test (`trap.mp` with terminal input in
  `errorstopmode`) needs an interactive terminal and is not applicable to the
  non-interactive library.
* **`.mpx`**: `reference/mpx-samples/latex-math.mp` → our `mpto` → oracle
  `latex` → our `dvitomp` reproduces the committed `.mpx` byte for byte
  (contract harness); `tex.wasm` reproduces the oracle's DVI byte for byte
  except the timestamp comment.

## 5. Known differences from native `mpost`

* A document cannot `readfrom` its own figure output during the run (see §4).
* `outputformat:="png"` is not supported (no cairo); `binary`/`interval`
  number systems are not built (no GMP/MPFR).
* Worker mode cannot forward the `runScript`, `makeText` and `onFindFile`
  callbacks; providing one selects in-process mode. (Docs/01 §2's
  `Atomics.wait` bridge is not implemented.)
* Snippet cache is in-memory per instance; no IndexedDB persistence yet.
* `-recorder` writes an empty `.fls`; the opened-file list is available from
  the C API but not yet plumbed to the CLI.

## 6. Numbers

Measured on an Apple M-series laptop, Node 23 (`scripts/smoke-api.mjs`):
instantiate + bundles 50 ms; geometry figure 14 ms (plain.mp parse included,
so no memory-snapshot optimisation is needed — open question Q2 is answered);
`label()` with outlines 6 ms; plain TeX label cold 115 ms, LaTeX + amsmath
cold 185 ms, warm 5 ms; 40 labels cold 62 ms with one TeX run; one label
edited 91 ms with one TeX run of one page. `plain.fmt` builds in 45 ms,
`latex.fmt` in 4.5 s.

## 7. The TikZ/PGF pipeline (added after the first build)

`mp.latex(source)` typesets a complete document with `tex.wasm` and converts
every DVI page with `dvisvgm.wasm` — the real dvisvgm 3.4.3 from the same
TeX Live source, compiled with `scripts/build-dvisvgm-wasm.sh` the same way as
`tex.wasm`: a native configure supplies `config.h`, everything else is compiled
with `em++` (`-std=c++17 -fwasm-exceptions`, legacy wasm EH so the Emscripten
FreeType port builds), FreeType and zlib come from Emscripten's ports, kpathsea
objects are shared with `tex.wasm`, potrace/clipper/md5/xxHash/woff2/brotli are
the bundled copies. Ghostscript is compiled out (`DISABLE_GS`), so PostScript
specials are ignored. The build is `-Oz` (2.7 MB).

Things learned:

* **Object names must come from the whole path.** `src/Font.cpp` and
  `libs/woff2/src/font.cc` collide on a case-insensitive filesystem.
* **Upstream's `DISABLE_WOFF` does not compile** (a duplicate constructor in
  `FontWriter.cpp`); WOFF support is left enabled instead, which also gives
  `fonts: 'woff2'` for free.
* **PGF's default DVI driver is `dvips`**, whose `ps:` specials dvisvgm can only
  interpret through Ghostscript — without it the SVG has text and nothing else,
  and native dvisvgm without libgs behaves identically, so the golden test was
  green while the pictures were empty. The library prepends
  `\def\pgfsysdriver{pgfsys-dvisvgm.def}` on the first line (no line-number
  shift) so PGF emits SVG specials; the oracle runs get the same line.
* **PGF needs e-TeX.** Knuth's `tex` (and our `plain.fmt`) fail inside
  `pgfutil-common.tex` on `\ifcsname`; `engine: 'plain'` therefore means
  `etex.fmt` (TeX Live's `etex`), and `engine: 'tex'` is the Knuth-compatible
  format for anyone who wants it.
* **dvisvgm emits glyph definitions in unordered-container order**, which
  differs between libc++, libstdc++ and wasm32. `scripts/golden-tikz.mjs`
  sorts the `<path id='gN-M'>` lines inside `<defs>` before comparing;
  everything else is byte-identical.
* kpathsea inside dvisvgm needs the same `argv[0]` trick (`/bin/dvisvgm`),
  `TEXMFCNF`, and `--no-mktexmf`; its map lookup finds `pdftex.map` /
  `ps2pk.map`, which `build-texmf.sh` now generates next to `mpost.map`.

Bundles gained `lm-fonts` (Latin Modern Type 1 with T1/TS1 encodings, 14 MB
raw, fetched per font), and `latex-extra` gained pgfplots, standalone,
varwidth, preview and the plain-TeX pgf front end. `latex.fmt` is unchanged.

Golden corpus: `test/golden/tikz/*.tex` — axes/plot with calc, nodes and
edges, shadings/patterns/clip/opacity, pgfplots, Latin Modern T1 text with
amsmath, plain TeX with `\input tikz`, and a two-page article; 7/7
byte-identical to `latex` (or `etex`) + `dvisvgm` from TeX Live 2025.

## 8. The tikzjax replacement: tags and the snapshot

`src/ts/auto.ts` (`dist/auto.js`) renders `<script type="text/tikz">`,
`<script type="text/metapost">`, `<tikz-diagram>` and `<metapost-diagram>`
into SVG on load and on later insertion, wraps bare bodies in a standalone
document or a single figure, caches results in IndexedDB by content hash, and
exposes `window.mpTikzWasm`. Custom elements hold HTML, so `<` must be
written `&lt;` in them; script tags are raw, which is why tikzjax uses them.

`tikz.fmt` is the pre-warmed format. Building it taught three things:

* `&latex` on the command line is not honoured in `-ini` mode (neither by the
  host pdftex nor by `tex.wasm`), and `-fmt=latex -ini` dumps a bare format.
  `tikz.ini` therefore reproduces `latex.ini` and redefines `\dump` so that
  `latex.ltx`'s own final `\dump` first `\input`s the snapshot preamble.
  `latex.ltx` refuses to start unless `{` still has catcode 12, so the
  wrapper resets the catcodes it needed for its `\def` before `\input latex.ltx`.
* PGF loads its dependencies with `\usepackage`, which `latex.ltx` forbids
  before `\documentclass`; the snapshot sets `\let\usepackage\RequirePackage`
  (the document's `\documentclass` restores the real one).
* Preloading is only invisible if the libraries are purely definitional and
  the object counters are reset. `bending` changes curved arrows, `babel`
  changes catcode handling, `\pgfplotsset{compat=1.18}` changes pgfplots
  defaults — all left out. Loading the libraries allocates pgf/svg ids, so
  `\pgf@sys@id@count`, `\pgf@sys@svg@objectcount`, `scopecount` and
  `type@count` are zeroed before the dump; without that, clip paths were
  named `pgfcp9` instead of `pgfcp1`. `scripts/golden-tikz.mjs` runs every
  case with and without the snapshot and requires identical pages.

Profiling the per-run cost (`stats.texSetupMs` / `texMainMs` /
`instantiateMs`) showed that installing the bundle tree into each fresh
Emscripten filesystem — ~2300 lazy nodes plus the ls-R text — cost 50–75 ms
per TeX run and again per dvisvgm run, more than the snapshot saved.
`BundleSet.install` now creates directories and files on demand through a
`lookup` hook on directory nodes, so a run pays for the files it touches:
setup fell to 1–2 ms and a dvisvgm run from ~80 ms to ~13 ms. A tiny TikZ
document now costs about 100 ms of TeX with the snapshot.

Two more things the tag renderer taught: `input boxes` *inside* a figure
makes MetaPost recurse until its input stack overflows — native `mpost`
prints the same "input stack overflow" — so `wrapMetaPost` hoists `input`
statements above `beginfig`; and mplib handles that limit with a hard
`exit(1)` rather than an error, which Emscripten surfaces as an `ExitStatus`
exception. The core now catches it and reports a fatal diagnostic carrying the
last lines the engine printed, instead of failing the whole call.

## 9. The PGF manual as a stress test

The complete PGF/TikZ manual (`doc/generic/pgf/pgfmanual.tex`, 1181 pages in
TeX Live 2025, `\usetikzlibrary` of essentially every library) typesets through
`mp.latex()` to a DVI byte-identical to native `latex`, in 148 s of TeX and
130 s of dvisvgm (native: 127 s and 227 s), and every SVG page matches native
dvisvgm. `scripts/stress-pgfmanual.mjs` reproduces it. What the reproduction
needed, none of it an engine limitation:

- `pgfmanual.cfg` uses `\ignoreligaturesinfont`, a LuaTeX primitive; under
  pdfTeX it must be guarded with `\ifluatex`. The manual's own comment says to
  build it with lualatex. `\RequirePackage{lmodern}` replaces the EC/cm-super
  fonts, which are not bundled.
- Native `latex` has restricted shell escape, and imakeidx runs makeindex
  through it, so the native build carries a 45-page index. The wasm engine
  cannot spawn anything; the `.ind` file is handed over instead. The manual
  `\include`s 124 chapters, so 124 chapter `.aux` files are part of the state
  a single-pass run must be given, not just the main one.
- PGF's gnuplot plotting (`\pgf@plotgnuplot` in `pgfmoduleplot.code.tex`)
  writes `\pgf@plot@code`, which is only defined when the cached `.gnuplot`
  file already exists; without the `plots/` directory the manual ships this
  is an "Undefined control sequence" in native pdfTeX as well.
- psnfss fonts (Times, Courier, Symbol, Dingbats in the manual) resolve
  through virtual fonts: `ptmb8t.tfm` for TeX, then `ptmb8t.vf` → `ptmb8r.tfm`
  → `utmb8a.pfb` for dvisvgm. A map lookup by the T1 name finds nothing. The
  35 standard fonts are now bundled (`ps-fonts`, 3 MB) together with
  hyperref, url, listings, fp, imakeidx and todonotes.
- dvisvgm is not deterministic run to run: a font used at several sizes is
  defined once and referenced with `<use transform="scale()">`, and which size
  becomes the base changes between runs of the same binary on the same DVI
  (two native runs differ textually on 420 of 1181 pages). The comparison in
  the stress script resolves every glyph to its absolute outline first; with
  that, native-vs-native is 1181/1181 and native-vs-wasm is 1181/1181.
- One of five API runs of the manual hung at 0 % CPU with no active handles
  after the TeX phase; four identical runs completed. Not reproduced, not
  explained.

## 10. LuaTeX

`luatex.wasm` is LuaTeX 1.21.0 (the pinned TeX Live 2025 source; the installed
binaries are 1.22.0) built the same way as pdfTeX: `scripts/native-luatex.sh`
builds it natively in `vendor/native-build` with `make V=1`, records every
compile command into `build/native-luatex-compiles.json`, and
`scripts/build-luatex-wasm.sh` replays them with emcc, substituting our fixed
`c-auto.h`, Emscripten's zlib/libpng ports, no `LUA_USE_DLOPEN`, and our
patched mplib tangle for the native one (LuaTeX links `libmplibcore` without
the SVG/PNG backends and stubs them in `mplibstuff.c`, so `svgout.c` stays
out). Lua 5.3, pplib and zziplib are compiled from the vendored sources with
TeX Live's flags; `zzip/_config.h` needs `ZZIP_SIZEOF_LONG 4`. The C FFI
(`luaffi`, machine code at run time) is replaced by a stub `luaopen_ffi` that
returns an empty table. Everything is C; 340 files, 4.4 MB of wasm.

Two traps: parallel `make` interleaves output, so a compile command can be
glued to the end of a warning line (the recorder scans for `gcc -DHAVE_CONFIG_H`
anywhere in the line); and `lib/main.c` must stay out because `luatex.c` has
its own `main`.

Run in DVI mode with TeX Live's `dvilualatex.ini` / `dviluatex.ini`, the
formats build with the wasm engine (6.5 MB and 1.25 MB, 5 s and 0.4 s). The
texmf needs `luatex85`, `firstaid`, babel's `hyphen.cfg`/`luababel.def`, the
LuaTeX `etex.src` (which checks `language.def` for the `%% e-TeX V2.0;2`
header) and a `language.dat.lua`. `texmf.cnf` gains `TEXINPUTS.dvilualatex`,
`LUAINPUTS` and friends; PGF's graphdrawing Lua tree (212 files) was already
in the bundles under `tex/generic/pgf`.

No OpenType font loader: `luaotfload` (7 MB of Lua plus a font database that
scans directories) is not bundled. LaTeX's kernel probes for it at the start
of every job, prints "Error in luaotfload: reverting to OT1" into the log and
falls back to the Type 1 fonts; that line is filtered from the diagnostics.
Consequence for the oracle comparison: TeX Live's `dvilualatex` format does
load luaotfload and sets OpenType Latin Modern by default, so a golden case
must pin `\usepackage[T1]{fontenc}\usepackage{lmodern}` to compare equal —
with that, the five-page graphdrawing case (layered, spring, tree and circular
layouts plus `\directlua`) is byte-identical after dvisvgm. A graphdrawing
document takes ~600 ms in LuaTeX against ~150 ms for a comparable pdfTeX one.

`engine: 'auto'` selects LuaTeX when the source mentions graphdrawing,
`\usegdlibrary`, `\directlua`, `\latelua`, luacode or luatexbase; the tags
add `data-gdlibraries` (which also implies the graphdrawing library) and
`data-engine`; the CLI has `--engine`. `\usepackage[T1]{fontenc}` loads the EC
metrics before anything can redirect it, so `fonts/tfm/jknappen/ec` (2 MB of
TFM) is bundled now; the cm-super outlines are not.

## 11. The per-instance leak (patches 0010, 0011 and 0012)

The live-graphics page renders one MetaPost instance per animation frame. It
died after a couple of minutes: 3,000 frames in Node grew the process by
640 MB. `test/leak/leaktest.c` (30 instances through the shim, under macOS
`leaks`) put it at 319 KB per instance, and the roots were all inside mplib:
token lists of macro bodies (`mp_scan_def`), variable values and their
dependency lists, hanging off the symbol table. `mp_finish` destroys the
symbol *entries* but never what they point to — the source says "symbols are
not freed until the end of the run" — which is invisible when the process
exits and unnoticed by LuaTeX, which keeps one instance alive. Patch 0010
walks the symbol table before teardown and releases each symbol the way a
redefinition does (`mp_clear_symbol`), then also frees the preload file
handle, the log-stream wrapper, `name_of_file`, the `temp_val`, `zero_val`
and `inf_val` nodes and the `id_lookup_test` symbol (whose name points into
the input buffer and must not be freed), and fixes a leaked buffer in
`mp_open_mem_name` and the file name in `mp_load_preload_file`. Patch 0011
fixes `mp_make_string`, which inserts a *copy* into the string tree and
dropped its own struct. The shim leaked too: the exported edge objects were
never tossed (`mp_gr_toss_objects`); a comment claimed `mp_finish` freed
them, which was never true.

Result: 1.2 KB per instance, and that residual was asked for too. The
`leaks` stacks for it pointed at assignments inside `beginfig` and were a
red herring: MetaPost recycles value nodes through a free list, so a leak
report names where a block was *first* malloc'd, not who lost it. What
found the real sites was bisecting the MetaPost source in the harness
(`leaktest.c` now takes a file): a bare `shipit;` reproduced every byte.
Patch 0012 fixes the three causes:

- **Four value nodes per shipped figure.** `mp_do_ship_out` stores the
  figure's `charwd`, `charht`, `chardp` and `charic` in the `tfm_width`,
  `tfm_height`, `tfm_depth` and `tfm_ital_corr` arrays for a possible TFM
  file. The loop that freed them at teardown is commented out upstream
  ("double free errors, bug tracker id 831"): once `fontmaking` has massaged
  the arrays they point into shared sorted lists and at `zero_val`, so
  freeing entry by entry double-frees. The patch frees each *distinct*
  pointer once, skipping `zero_val` and `inf_val`, which is right in both
  states; it also frees the originals that the massaging replaced and the
  TFM file name, so a `fontmaking:=1` job is clean too.
- **The `jump_buf`.** The standalone entry points `mp_svg_ship_out`,
  `mp_ps_ship_out` and `mp_png_ship_out` — what the shim calls to render a
  figure after the run — install a fresh `jump_buf` for their own error
  recovery without freeing the one `mp_execute` left: 208 bytes per figure.
- **`mp_free` order.** It ran `@<Free table entries@>` (`bad_vardef`,
  `dep_head`, the list heads, `temp_val` and friends) *after*
  `@<Dealloc variables@>` had drained the node free lists, so those nodes
  were pushed onto lists nobody would walk again. The block now runs before
  the drain; 0010's explicit release of `temp_val`, `zero_val` and `inf_val`
  became redundant and is harmless.

Measured: `leaks` reports 0 bytes over 31 instances, also for a fontmaking
job and an empty job; AddressSanitizer is clean; 200,000 consecutive jobs on
one wasm engine leave the allocator's bytes in use unchanged
(`scripts/soak-memory.mjs`, which reads the new `mpwasm_heap_in_use`
export). `test/e2e/memory.test.ts` now asserts that 300 runs leave nothing
allocated. The TikZ path was checked the same way (`--tikz`, under
`node --expose-gc`): TeX and dvisvgm are instantiated fresh per job and
dropped, and over 600 documents the JS heap, external memory and
ArrayBuffers stay flat while process RSS levels off (the last 300 runs added
21 MB after the first 300 added 317 MB) — reclamation lag, not retention.
The live page keeps recycling each animation's engine every 30,000 frames
as a safeguard only. Lessons: the plan's soak test was on the
list and not done; a comment asserting what a library frees is not
evidence; and a leak tool's allocation stack is the block's first owner,
not its last.

## 12. Logging (session 5)

What was learned adding the levelled console log (`docs/08` §4 has the
user-facing table).

- **mplib does not let the embedder see the terminal as it goes.** In
  non-interactive mode `mp_initialize` applies `set_callback_option` for
  every I/O callback and *then* overwrites them all with the `mplib_*`
  in-memory versions (`@<Prepare function pointers for non-interactive
  use@>`), so an `opt->write_ascii_file` is silently discarded. The only
  hook point is after `mp_initialize`: swap `mp->write_ascii_file` on the
  instance (which means including `mpmp.h`, the internal header; it only
  needs `avl.h` and `mplib.h`, both already on the include path). The
  wrapper forwards to the saved original so `run_data.term_out` still fills,
  and splits the terminal stream into lines because MetaPost writes it a
  character at a time (`wterm_chr`). The banner is printed inside
  `mp_initialize`, before the swap, so it is replayed from the buffer.
- **The line hook is a JS-library import like the others** (`mpwasm_host_*`
  in `src/c/mpwasm_library.js`), which keeps `-sERROR_ON_UNDEFINED_SYMBOLS`
  honest and means every native harness needs a stub. The contract harness
  now compares the streamed lines with `mpwasm_term_out` byte for byte.
- **Chrome hides `console.debug`** under its "Verbose" filter, off by
  default; someone who set `logLevel: 'debug'` to see the engines' output
  would see nothing. The two verbose levels therefore use `console.log`.
- **The level lives where the records are produced.** In the Worker the
  Logger runs inside the Worker with a sink that posts `{event:'record'}`,
  and `mp.logLevel = …` sends a `setLogLevel` message, so nothing the level
  excludes is ever posted. The level is checked at call time, not at wiring
  time: the engines' `onLine` callbacks and the `termLine` hook are installed
  once, in `init()`.
- **The CLI leaves MetaPost's own errors and warnings out of stderr** because
  the transcript on stdout already carries them (as with `mpost`); TeX,
  dvisvgm, bundle and host records go to stderr at the chosen level. This
  replaced two ad-hoc `console.error` loops with the same intent.
- **Default `warn`**, not `silent`: a page whose figure comes out blank now
  says why in the console without any option; the tests and the build
  scripts pass `logLevel: 'silent'`.

## 13. Saved figures (session 6)

`figures.ts` gives every diagram element one identity, `figureHash()`: six
lowercase base-36 characters of the SHA-256 of its kind, the attributes that
change the output (`fonts`, `tex`, `engine`) and the wrapped document. The
same six characters name the IndexedDB entry, the SVG id prefix (`mpwHASH-`)
and the saved file `figure-HASH.svg`, so a saved SVG is self-contained and
drops into any page. Lowercase because the files pass through
case-insensitive filesystems on the way to a server; base 36 rather than hex
so six characters give two billion values.

The engine build is left out of the hash on purpose. The old IndexedDB key
included `mp.version`, but that string is only known once the engine has
started, and the key was computed *before* the cache lookup — so for every
figure on a static page it was the placeholder `mp-tikz-wasm`, and the
"invalidate on upgrade" intent never actually worked. Now the hash identifies
the source; the IndexedDB store is recreated (version 2) since the keys
changed; and a library upgrade that changes output is handled by re-running
`--prerender --force`, which is the honest description of a rare event.

What the browser side does with `data-figures="figures/"`: IndexedDB, then a
`fetch` of the file, then the engine. The fetch treats a non-2xx as a miss,
and also anything that does not start like an SVG document — a single-page
host that answers every path with its index page would otherwise inject HTML
into the figure. The engine is created lazily by the first miss, and the
prefetch scan of the page runs only then, so a page whose figures are all
saved requests no wasm, no bundle manifest and no hot list. (The scan is
guarded on `document` so `AutoRenderer` also works in Node, which is how the
e2e test proves the engine is never started.)

`saveFigures()` prefers `showDirectoryPicker()` (Chrome, Edge): the author
picks the site's `figures/` once and the files land in it. The picker needs
user activation, which the DevTools console grants; a `SecurityError` (or
Firefox and Safari, which have no picker) falls through to a store-only zip
built by `makeZip()` — sixty lines with a CRC-32 table, reproducible
(timestamps fixed at 1980-01-01), verified against `unzip -t` in the unit
test. An `AbortError` means the author cancelled and does not fall through.
The function waits for renders in flight first, so calling it too early
still saves everything.

`mpost-wasm --prerender` (`prerender.ts`) does the same from Node without a
browser. It finds the four tag forms with a scan rather than an HTML parser —
the elements hold text, not markup — reproducing what the DOM gives the tags:
script bodies raw, custom-element bodies and attribute values entity-decoded,
the same trim (`sourceOf`), attributes with `data-` stripped. The engine is
created with the browser's defaults (deterministic, seed 42), not the CLI's
`deterministic: false`, so the bytes are the ones the tags would produce; the
e2e test checks that a saved file and a live render of the same element are
identical. Files that exist are kept (the name is the content) unless
`--force`; nothing is written for a figure that fails, so it is tried again.

One caveat, documented rather than solved: a MetaPost element with several
`beginfig` blocks injects several `<svg>` roots joined by newlines, and that
is what gets saved — exact for the tags, but not a valid single SVG document.
Single-figure elements, the common case, save as valid files.

`site/tags.html` ships with its figures in `site/figures/` and
`data-figures="figures/"`; the deliberately broken figure at the bottom is the
only thing that starts the engines there, and `?live` removes the attribute
before the loader runs (module scripts are deferred, so an inline classic
script can still edit the tag) to typeset everything in the tab.

## 14. LuaTeX rules trapped in DVI mode (session 8)

Every rule shipped by `luatex.wasm` — `\hrule`, `\vrule`, leaders, and in
maths `\sqrt`, `\over`, `\overline`, `\underline` — threw `null function or
function signature mismatch` under both LuaTeX formats. Text without a rule
was fine, which is why it survived the golden corpus (the graphdrawing case
draws no rule) and the e2e suite (nothing ran `engine: 'luatex'`). It was
first reported as "plain LuaTeX traps on any math" with the guess that the
format was to blame; the construct matrix showed the same failures under
`dvilualatex.fmt` and a plain `\hrule` failing too, which moved the suspect
from the format to the ship-out.

The cause is in `luatexdir/tex/backend.h`: the back-end dispatch table is an
array of `backend_function`, typedef'd as the unprototyped `void (*)()`. The
ship-out in `pdf/pdflistout.c` calls `backend_out[rule_node](pdf, p, size,
rule_callback_id)` — four arguments, the arity of the PDF back-end's
`pdf_place_rule` — while `dvi/dvigen.c`'s `dvi_place_rule(pdf, q, size)`
takes three. A native build passes the extra argument in a register nobody
reads. WebAssembly has no such slack: `call_indirect` compares the callee's
type with the call site's, and a three-parameter function called through a
four-parameter signature traps. (The struct argument `scaledpos` is not the
problem: the wasm32 C ABI passes it by pointer at both ends.) Two other
callers, a virtual-font rule packet in `font/vfpacket.c` and `vf.rule()` in
`lua/lfontlib.c`, pass three arguments, so they had the mirror-image mismatch
against the PDF back-end; they are only reachable in PDF mode, which this
project never uses, but the patch fixes them too. Every other slot (glyphs,
the two whatsits, the eight control functions) matches its callers.

The fix is `patches/luatex/0001-backend-dvi-rule-slot-arity.patch`: a
four-parameter wrapper in `backend.c` fills the DVI rule slot and the two
three-argument callers pass four. `scripts/build-luatex-wasm.sh` applies
`patches/luatex/*.patch` to copies under `build/luatex/patched` (the vendored
tree is never modified) and compiles a source from its patched copy under the
same object name and flags, so an incremental build recompiles only the
patched files. The wrapper rather than a prototype change because
`dvi/dvigen.h` is reached through `ptexlib.h` in the vendored directory, where
a patched header would never be found; three `.c` files patch cleanly. The
link flag `-sEMULATE_FUNCTION_POINTER_CASTS` would also have hidden it, at a
cost on every indirect call; the source fix is exact.

Guards: `test/e2e/api.test.ts` now runs `$\sqrt{2}$`, `\over` and `\hrule`
under `luatex` and `\frac`, `\underline` under `lualatex` (written before the
fix, it failed with the trap). The TikZ golden gained `09-luatex-rules` (plain
LuaTeX, every rule construct) and `10-lualatex-rules`, both byte-identical to
TeX Live's `dviluatex` / `dvilualatex` + dvisvgm; `scripts/golden-tikz.mjs`
runs a plain case that needs LuaTeX under `luatex` / `dviluatex`. Case 10 pins
Latin Modern in OT1 rather than T1: the oracle's format loads luaotfload,
which changes the order font ids are allocated, so a page mixing a T1 text
font with the OT1 maths roman comes out with two DVI font numbers swapped —
identical glyphs and positions, different `g3-`/`g4-` ids. That is the
no-luaotfload limitation (§10), not a rule problem; with OT1 the text and the
maths digits share one font and the pages agree.

A side finding from checking the release: the two LuaTeX format dumps are
not reproducible. Two consecutive `build:formats` runs give different
`dviluatex.fmt` and `dvilualatex.fmt` (the four pdfTeX formats are
byte-identical run to run). Decompressed — LuaTeX gzips its formats, which is
why a small difference looks like a wholesale one — the only change is the
order of the `\hyphenation` exception words: LuaTeX keeps them in a Lua table
and walks it at dump time, and Lua 5.3 seeds its string hash from the clock,
so the walk order varies. Same words, same behaviour, different bytes; the
goldens pass with any dump. The consequence is only that the `luatex`
bundle's bytes, and so a release archive's digest, cannot be reproduced from
source (HANDOVER loose end 15).
