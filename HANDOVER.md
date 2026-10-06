# Handover

Written 2026-09-13 (third session), revised 2026-09-15 (fourth and fifth
sessions), 2026-09-16 (sixth), 2026-09-17 (seventh, eighth and ninth),
2026-09-18 (tenth, consolidated), 2026-09-24 to 2026-09-29 (eleventh: the
0.3.0 release and what followed), 2026-10-03 (twelfth: PDF output) and
2026-10-06 (thirteenth: `main` caught up; TrueType Collections fixed). This file lives at the repository root; until session 5 it was
`docs/15-handover.md`. Everything below is verified unless marked otherwise.
Read this before `docs/14` if you are picking the project up cold. The
repository is `~/Source/mp-tikz-wasm`, remote
<https://github.com/jmckalex/mp-tikz-wasm> (`origin`, branch `main`).

**State now (session 13, 2026-10-06):** `main` was fast-forwarded to
`opentype-fonts` at the owner's request (6d89954: the `classico` bundle,
hash-versioned bundle URLs, a font dvisvgm cannot draw is an error,
`--prerender` honouring `data-bundles`), pushed, CI green (run 37488886716).
**The branch `dvisvgm-ttc`** (from `main`, not merged, not pushed) fixes
TrueType Collections properly: `patches/dvisvgm/0001`, the build step that
applies it, an e2e test, docs. 281 tests, all goldens, contract 48/48. See
"What happened in session 13". **Nothing after 0.3.1 is released**; 0.3.2
would carry all of it. Clew-app re-pinned to v0.3.1 on 2026-10-06 (its
cbfa692); Clew-iOS follows once its TestFlight push is done. A 0.3.2 re-pin
goes through Clew-boss, so that the app and iOS move together.

**Before that (session 12, 2026-10-04): v0.3.1 is released**
(<https://github.com/jmckalex/mp-tikz-wasm/releases/tag/v0.3.1>, tag on
52b7bbc, which is `main` and the branch head at release; `mp-tikz-wasm-0.3.1.tar.gz`,
**44,239,255 bytes, sha256
24b0cd291a18ead46c8c09f78bedbf82fd965acb87cc5f1fb447fd38f353c152**, and `.zip`;
notes in `release/notes-0.3.1.md`). The downloaded asset was checked against the
local file, and its `dist/` equals the local one apart from `.js.map`. CI green.
The website is synced at 0.3.1 (`make check` showed no deletions, `make sync`,
`make verify` all 200; both domains serve 0.3.1 and the lazy `auto.js`).
Clew-app, Clew-iOS and Palimpsest (PDFViewer) were sent the numbers;
**Folio was not running — send it the 0.3.1 numbers when it is.** 0.3.1 = PDF
output, the lazy `auto.js`, script-tag prefetch, `worker: true` in Node,
`hot.json` kept; engines byte-identical to 0.3.0. 269 tests; TikZ golden 12/12,
MetaPost 15/15, PDF 5/5; contract 48/48. `main` and `opentype-fonts` point at
the same commit (plus this handover commit).

**Before that (0.3.0):** **v0.3.0 is released**
(<https://github.com/jmckalex/mp-tikz-wasm/releases/tag/v0.3.0>, tag on
67c437c; `mp-tikz-wasm-0.3.0.tar.gz`, 44,229,933 bytes, sha256
4a3a61b3760042d191dbf23d2169a776981be1caad9ec1d2b05cd6729c4d141b; the
downloaded asset was checked against the local file). `main` is at 53b1ad8
(the release plus a handover commit). **The branch `opentype-fonts` is ahead of
`main` with unreleased work** — three fixes made after the release, all
tested and green on CI (run 36495402034), plus handover commits
(`git log --oneline origin/main..opentype-fonts`): 5f6dc02 (`hot.json` kept
across bundle rebuilds; CI generates the hot lists), 32e9467 (script-tag
pages prefetch again), 8b6d145 (`worker: true` in Node; CI time limits) —
**and, from session 12, optional PDF output** (266d919: `mp.latex(doc, {
output: 'pdf' })`, `mpost-wasm --latex --pdf`; see "What happened in session
12"). They are 0.3.1 material, with the `auto.js` lazy loading
("Suggested next steps"). The working tree is clean; local `main` tracks
`origin/main`. 267 tests; TikZ golden 12/12 (locally, and informationally on
CI), MetaPost golden 15/15, PDF golden 4/4, native contract 48/48. The website is synced at
0.3.0: **jmckalex.org and eschatolog.ist are both the DigitalOcean droplet**;
Bluehost is discontinued. Clew-app, Clew-iOS and Folio have the release
numbers; re-pinning the Clew manifests is theirs. `dist/` here is the 0.3.0
build (identical to the release apart from `.js.map` files); the branch's
fixes change the JavaScript, the build scripts and (for PDF output) two TeX
files in `latex-extra`, so `npm run build:texmf && npm run build:fontdb &&
npm run build:ts && npm run build:bundles` brings `dist/` level with it — the
local `dist/` already is.

## Where things stand, in one paragraph

The port is complete and released: four engines (MetaPost 2.11, pdfTeX 1.40
and LuaTeX 1.21 in DVI mode, dvisvgm 3.4.3) compiled to WebAssembly behind one
TypeScript library, a Web Worker (a `worker_threads` worker in Node on
request), the `mpost-wasm` CLI, drop-in HTML tags, twelve lazily fetched texmf
bundles (two of them opt-in, for OpenType), demo pages and a feature guide.
Output is byte-identical to TeX Live 2025 on both golden corpora and the
1181-page PGF manual. 263 tests pass, the 48-check native contract harness
passes, there is no per-instance memory leak. Session 5 added levelled
logging; session 6 saved figures (`figures/figure-HASH.svg`, written by
`mpost-wasm --prerender` or `mpTikzWasm.saveFigures()`); session 7 spath3 and
the kept border; session 8 the LuaTeX rule fix; sessions 9 and 10 OpenType
fonts under LuaTeX (`fontspec`, plain `luaotfload`, host faces, `fonts:
'woff2'`); session 11 the prebuilt font database, live custom elements,
`data-replace`, the `svg.attributes` TikZ library, chemfig / circuitikz /
tikz-3dplot, restyled demo pages, and the 0.3.0 release. The demos are live at
<https://eschatolog.ist/software/mp-tikz-wasm/> and
<https://jmckalex.org/software/mp-tikz-wasm/> (the same DigitalOcean droplet).
**CI is green** and builds everything from a clean checkout, the texmf tree
from TeX Live 2025's final packages. Releases: v0.1.0 (2026-09-13), v0.2.0
(09-16), v0.2.1 (09-17), **v0.3.0 (09-28)**.

## What happened in session 3 (2026-09-13)

1. **Residual memory leak fixed** (patch 0012): TFM dimension nodes, the
   `jump_buf` replaced by the standalone ship-out entry points, and the order
   of `mp_free`. 0 bytes leaked over 31 instances; 200,000 wasm jobs leave the
   allocator's bytes in use unchanged. `mpwasm_heap_in_use` export;
   `test/e2e/memory.test.ts` is byte-exact; `scripts/soak-memory.mjs`.
2. **Renamed** from metapost-wasm to **mp-tikz-wasm** everywhere (package,
   docs, patch comments, event names, cache names, `window.mpTikzWasm`, mpx
   banner, texmf path `tex/latex/mp-tikz-wasm`, mastheads). Kept: the
   `mpost-wasm` CLI, the `mpwasm_` C prefix, the `MetaPost` class, the custom
   element names.
3. **Two LaTeX examples** (`site/examples/parshape-*.tex`): a paragraph set in
   a circle by `\parshape` and text flowing around a Fourier plot; in the
   guide, the galleries and the playground.
4. **Guide**: build-time syntax highlighting of the HTML and JavaScript
   blocks (`scripts/highlight.mjs`).
5. **GitHub**: public README, `LICENSE` (LGPL-3.0 text), `NOTICE.md` (the
   per-part licence table, formerly LICENSE.md), `licenses/`, package.json
   metadata, `docs/00-START-HERE.md` (was top-level). CI fixes below.
6. **Deployed to Bluehost** (see "The website"). That exposed two real
   defects, both fixed: a first run fetched ~90 files one after another and
   the 20 s total timeout killed it on a host with 0.57 s per request.
   Now: `dist/bundles/hot.json` (per kind of run, the files a first run
   touches; `scripts/make-hotlists.mjs`, `npm run build:hot`),
   `MetaPost.create({ prefetch })` / `mp.prefetch()` fetching them 16 at a
   time, the tags choosing the kinds from the page (`data-prefetch="off"`),
   `timeoutMs` as a stall limit that restarts on every progress event
   (including one per file fetched), manifests and engine glue fetched in
   parallel at start-up, and figure placeholders that say what is being
   fetched. `test/e2e/prefetch.test.ts`.

## What happened in session 4 (2026-09-13 to 2026-09-15)

1. **CI is green** (was never green before). Five fixes, all pushed; see
   "CI" below for the full account. The build now runs from a clean checkout
   on Ubuntu each push.
2. **Five new MetaPost gallery figures** in `site/examples.js` (Lissajous,
   a Lambert-shaded 3D surface, a mystic rose, a nested-fill gradient, a
   pentagram from `whatever` equations). Pure geometry, deterministic; they
   appear in the playground and the single-file page.
3. **Fixed the upside-down brace** in the guide's "Trees, matrices,
   decorations" figure: added `mirror` to the brace decoration in
   `scripts/guide-examples.mjs` and `site/examples-tikz.js`; `guide.html`
   regenerated.
4. **In-browser PGF-manual viewer.** `site/manual.html` +
   `scripts/build-manual-viewer.mjs` (`npm run build:manual`) assemble
   `build/manual-viewer/` — index.html, manifest.json and all ~1181 page
   SVGs (each typeset by the wasm engines) — into a page reader with
   prev/next/jump/keyboard and a position track. The title page's SVG has a
   degenerate 0×0 bbox from dvisvgm's `--exact-bbox` (its gradient cover
   contributes no ink), so the script re-renders any zero-bbox page from the
   DVI at paper size. NOT deployed anywhere (294 MB); would suit the droplet.
   A 170-page sample is published as a private artifact (see "Published
   artifacts").
5. **Deployed to the fast droplet** — see "The website"; the slow-server
   problem is fixed.
6. **Released v0.1.0** — see "Publishing a release".
7. **README** demo links repointed to eschatolog.ist (jmckalex.org noted as
   the slower mirror).

## What happened in session 5 (2026-09-15)

**Levelled logging to the console** (the user's request: see what a
MetaPost, TikZ or LaTeX run is doing, at a chosen verbosity).

1. **`logLevel`** on `MetaPost.create()` — `silent`, `error`, `warn`
   (default), `info`, `debug`, `trace` — and `mp.logLevel = …` at any time;
   `logger: (record) => …` replaces the console; `mp.on('record', …)` too.
   `src/ts/logger.ts` is the Logger (level checked at call time, console sink
   using `console.log` for the two verbose levels because Chrome hides
   `console.debug`). Records look like `mp-tikz-wasm tex: …`. Documented in
   `docs/08` §4 (the level table), the README ("Logging"), the guide and
   `types.ts`.
2. **MetaPost's terminal is streamed live** (the item docs/08 §4 had marked
   "worth doing"): `mpwasm_write_ascii_file` in `src/c/mpwasm_api.c` wraps
   mplib's non-interactive writer after `mp_initialize` (it needs the internal
   `mpmp.h`) and hands each line to the new host hook `mpwasm_host_term_line`
   (`src/c/mpwasm_library.js`; native stubs in the contract, leak and mpto
   oracle harnesses). The banner is replayed from the buffer. `term_out` is
   unchanged; two new contract checks compare the stream with it byte for
   byte. `mp.on('log')` now delivers MetaPost's lines as they are written.
3. **What each level shows**: `info` has the ready line, one line per run
   start/end with timings, one per TeX and dvisvgm pass and per prefetch;
   `debug` the three engines' terminal output, the phases and on-demand bundle
   loads; `trace` host `find_file` calls, every file MetaPost opened, label
   cache hits/misses, every file fetched. Diagnostics become error/warn
   records after each run (a MetaPost help paragraph indented under its
   error, a TeX error with its `doc.tex:N`); a rejected `run()`/`latex()` is
   an error record from the host.
4. **Worker**: records cross as `{event:'record'}`; `setLogLevel` is a new
   op so the Worker filters at the source.
5. **CLI**: `-v`/`-vv`/`-vvv`/`-q`/`--log-level=`, records on stderr; the
   two ad-hoc diagnostic loops were replaced by the logger, which leaves
   MetaPost's own errors out because the transcript on stdout carries them.
6. **Tags**: `data-log="debug"` on the loader, `mpTikzWasm.setLogLevel()`.
   **Playground**: a "log" selector next to "worker".
7. Tests: `test/unit/logger.test.ts`, `test/e2e/logging.test.ts`; the
   existing tests and Node scripts pass `logLevel: 'silent'` instead of the
   old no-op `log`. `guide.html`, `standalone.html` and the demo pages were
   regenerated (the single-file page embeds the new `mplib.mjs`).
8. Verified beyond the tests: `make contract` (48 checks), both golden
   corpora byte-identical with the rebuilt `mplib.wasm`, the leak and mpto
   oracle harnesses compile with the new stub, and Chrome on the playground
   and the tags page (Worker mode: records cross from the Worker, the
   runtime level change takes effect). The user tried it on a local server
   (`node scripts/serve.mjs 8791`; port 8765 was held by another process).
9. This handover moved from `docs/15-handover.md` to `HANDOVER.md`.

Not done in session 5 — commit, restage and sync, release — was all done in
session 6 (e0a8be9, then the 0.2.0 release and the sync; see below).

## What happened in session 6 (2026-09-16)

1. **Committed and pushed the logging work** as e0a8be9 (CI run
   35109363657; it rebuilds `mplib.wasm` and runs the 48-check contract).
2. **Saved figures** — the user's idea: a function that writes every SVG on
   a page out as `figure-HASH.svg`, HASH derived from the content, so that
   on load each element can use its saved file instead of re-rendering. The
   design and its reasons are in `docs/14` §13; the public documentation is
   the README ("Saved figures" under the tags), `docs/08` §5.1, the guide's
   tags section and the tags page itself.
   - `src/ts/figures.ts` (shared, DOM-free): `figureHash()` — six lowercase
     base-36 characters of the SHA-256 of the kind, the output-affecting
     attributes (`fonts`, `tex`, `engine`) and the wrapped document. The one
     identity names the file, the IndexedDB entry and the SVG id prefix
     (`mpwHASH-`). The engine build is deliberately not in the hash (the old
     IndexedDB key's version string was a placeholder anyway; see docs/14).
     Also `extractFigures()` (the four tag forms out of an HTML string as the
     DOM would give them: script bodies raw, custom-element bodies and
     attributes entity-decoded), `renderFigure()` (the engine call the tags
     and the pre-renderer share), `makeZip()` (store-only, no dependency).
     `wrapTikz`/`wrapMetaPost` moved here from `auto.ts` (still re-exported).
   - `src/ts/auto.ts`: `data-figures="figures/"` on the loader. Lookup
     order per element: IndexedDB, then `figures/figure-HASH.svg` (a 404 or a
     non-SVG answer is a miss), then the engine — which is created only on
     the first miss, so a fully saved page loads no wasm, manifest or hot
     list. `mpTikzWasm.figures()` lists what rendered; `mpTikzWasm.
     saveFigures()` writes into a folder from the directory picker (Chrome,
     Edge; needs a user gesture, the DevTools console counts) or downloads a
     zip (elsewhere, or `{ zip: true }`); it waits for renders in flight.
     The `mp-tikz-wasm:rendered` event carries `from` (`cache`|`file`|
     `engine`), `hash`, `name`; the host `<figure>` gets `data-figure`.
     IndexedDB store bumped to version 2 (the keys changed) and every
     connection is now closed after use (it never was before).
   - `src/ts/prerender.ts` and `mpost-wasm --prerender [--figures=DIR]
     [--force] [--dry-run] PAGE.html...`: the same from Node. Honours the
     page's `data-figures` (default `figures/` next to the page), keeps
     files that exist, writes nothing for a failure and exits 1. The engine
     is created with the browser's defaults (deterministic, seed 42), not the
     CLI's `deterministic: false`, so the bytes equal a live render — the
     e2e test checks that. `package.json` exports `./auto`, `./figures`,
     `./prerender`; `index.ts` re-exports the helpers.
   - `site/tags.html` ships with its figures in `site/figures/` (eight files,
     100 KB, from `node dist/cli.js --prerender site/tags.html`, 1.5 s). The
     deliberately broken figure at the bottom is the only thing that starts
     the engines there; `?live` removes the attribute before the loader runs
     and typesets everything in the tab. `stage-site.sh` and
     `package-release.sh` copy `site/figures`.
   - Tests: `test/unit/figures.test.ts` (hash, page scan, entities, the zip
     checked with `unzip -t`), `test/e2e/prerender.test.ts` (files written,
     kept, forced, dry run; the renderer serves a saved file without starting
     an engine; `data-cache="off"` bypasses it; the CLI dry run). 241 pass.
   - Verified in Chrome on `node scripts/serve.mjs 8791`: the eight files
     fetched, no wasm until the broken figure missed, the stats line reads
     "8 from saved files, 1 typeset here"; `saveFigures()` from a
     non-gesture context fell through to an 85 KB zip with a valid signature.
   - Regenerated `site/guide.html` here, and everything else (the demo
     pages, `standalone.html`) at the release in item 3.

3. **Committed, synced and released** (the user asked for all three):
   c99d1ac (saved figures), 6408c66 ("Release 0.2.0", the version bump with
   the regenerated guide), tag `v0.2.0`, both pushed. `make wasm` relinked
   `mplib.wasm` from the unchanged session-5 sources; both golden corpora
   (15 MetaPost, 8 TikZ cases) and the 241 tests passed on the rebuilt
   `dist/` before the commit. The site was restaged and synced to the
   droplet and to Bluehost (no deletions; the new files were the pages,
   `site/figures/` and the changed `dist/*.js`); every new URL answers 200
   on both hosts with the right content type, and Chrome on the live droplet
   page reports "8 from saved files, 1 typeset here" — after a hard reload,
   see the cache caveat under "The website". The GitHub release is at
   <https://github.com/jmckalex/mp-tikz-wasm/releases/tag/v0.2.0>; CI is
   green on both jobs for every commit of the session, and a clean
   extraction of the released tarball renders MetaPost and TikZ through the
   Node API and pre-renders the tags page byte-identically to the shipped
   `site/figures/`.
4. **This handover** brought current (8d2d8bd and the commit after it).

Nothing is left undone from session 6. Two small things it left behind are
loose ends 12 and 13.

## What happened in session 7 (2026-09-16, evening; another agent, via Clew)

Two fixes found through Clew, the note app that embeds this library, and a
release built but not published:

1. **spath3 bundled** (a2a9795): `\usetikzlibrary{calligraphy}` (and
   `knots`) took the whole figure down because the library is part of
   spath3, Andrew Stacey's soft-paths bundle (four files, 284 KB,
   `\RequirePackage{spath3}` its only dependency), which pgf does not ship.
   `build-texmf.sh` copies it into `tex/latex`; the `latex-extra` recipe
   already claims everything there (921 → 925 files). A
   `\calligraphy[copperplate]` stroke renders as a tapered pen stroke.
2. **Wrapped TikZ figures keep their border** (adbd53b): TikZ leaves its
   classic arrow tips (`>=latex`, `stealth`, the primed forms — pre-3.0
   declarations with no convex hull) out of the picture's bounding box;
   native pgf does the same, and in a PDF the standalone border is what
   keeps the head on the page. dvisvgm's default tight box is the picture
   box PGF reports through its `dvisvgm:bbox` special, so a `->` on a
   horizontal line rendered as a line with no head. `renderFigure` now
   passes `--bbox=papersize` for the bodies it wraps (a complete document
   keeps the default), measured equal to pdflatex's page to three decimals.
   `DB_VERSION` 2 → 3 drops the old crops from IndexedDB (the source hash
   does not change). `isCompleteDocument()` is shared with `wrapTikz`; two
   unit tests and one e2e test (61.873 × 5.181 bp with two paths).
3. **Release 0.2.1 built, not published** (aac75ff): version bump, guide
   regenerated, the tags page's four TikZ saved figures re-rendered with
   `--force` (viewBox origin −72 −72, 4 pt larger each way; the
   whole-document one and the three MetaPost figures byte-identical). 244
   tests, both golden corpora. The archives and `release/notes-0.2.1.md`
   were built; nothing was tagged or pushed. The session's handover commit
   (424ed87) added loose end 14, the LuaTeX trap, with a diagnosis session 8
   corrected. Everything from this session was pushed and released in
   session 8, with the LuaTeX fix folded into 0.2.1 first.

## What happened in session 8 (2026-09-17)

**Loose end 14, the LuaTeX trap, diagnosed and fixed.** The report said
"plain LuaTeX traps on any math" and blamed the `dviluatex` format because
the same maths typeset under `dvilualatex`. Neither held: a construct matrix
showed `\sqrt`, `\over`, `\overline` and `\underline` trapping under **both**
formats while `\left(`, accents, limits and big delimiters were fine, and a
text-mode `\hrule` trapped too. Every construct that fails ships a DVI
**rule**; the engine build, not the format, was the culprit.

1. **Cause** (`docs/14` §14): LuaTeX's back-end dispatch table is typed as
   the unprototyped `void (*)()`. The ship-out calls the rule slot with four
   arguments (`pdf, p, size, rule_callback_id`, the arity of the PDF
   back-end's `pdf_place_rule`); `dvi_place_rule` takes three. Native C
   drops the extra argument; WebAssembly's `call_indirect` checks the callee's
   type and traps with "null function or function signature mismatch". Every
   other slot (glyph, the two whatsits, the eight control functions) matches
   its callers; two three-argument callers in the virtual-font code had the
   mirror-image mismatch against the PDF back-end (unreachable here, fixed
   anyway).
2. **Fix**: `patches/luatex/0001-backend-dvi-rule-slot-arity.patch` — a
   four-parameter wrapper fills the DVI rule slot in `backend.c`, and
   `vfpacket.c` / `lfontlib.c` pass four arguments. It is the first LuaTeX
   patch, so `scripts/build-luatex-wasm.sh` gained the mechanism: every
   `patches/luatex/*.patch` is applied to copies under `build/luatex/patched`
   (the vendored tree is never modified) and a source with a patched copy is
   compiled from the copy under the same object name and flags — an
   incremental build recompiles only the patched files (3 s here). CI builds
   from clean, so the patch is covered there. A wrapper rather than a
   prototype change because `dvigen.h` is reached through `ptexlib.h` in the
   vendored directory, where a patched header would never be found.
3. **Guards, written before the fix and failing with the trap**: a new case
   in `test/e2e/api.test.ts` (`$\sqrt{2}$`, `\over`, `\hrule` under `luatex`;
   `\frac`, `\underline` under `lualatex`); the TikZ golden gained
   `09-luatex-rules` (plain LuaTeX, every rule construct) and
   `10-lualatex-rules`, both byte-identical to TeX Live's `dviluatex` /
   `dvilualatex` + dvisvgm. `scripts/golden-tikz.mjs` now runs a plain case
   that needs LuaTeX under `luatex` / `dviluatex` (before, plain meant e-TeX).
   Case 10 pins Latin Modern in **OT1**, not T1: luaotfload in the oracle's
   format changes the order font ids are allocated, so a page mixing a T1
   text font with the OT1 maths roman came out with two font numbers swapped
   — identical glyphs and positions, different `g3-`/`g4-` ids — which is
   loose end 8's territory, not a rule problem. With OT1 the text and the
   maths digits share one font and the pages agree.
4. **Verified**: 245 tests pass; the TikZ golden passes all 10 cases and the
   MetaPost golden its 15; the construct matrix and text-rule script in the
   session's scratchpad all return `ok`. Documented in the README ("Patches to
   upstream", a LuaTeX table) and `docs/14` §14.
5. **Folded into 0.2.1** (the user's decision: 0.2.1 was never published).
   The fix is committed as 5e514df on top of session 7's commits; `npm run
   package` rebuilt `release/mp-tikz-wasm-0.2.1.{tar.gz,zip}` from the fixed
   `dist/` (tar.gz 37,205,263 bytes, sha256
   5ddff6361e88f1368e15817b1d2691f6946940b50762c54eb1ce18b2a8603ad7; zip
   39,045,845 bytes, sha256
   43c9b6329934f9720573f23f8aa0023ddbc0ba25946288309651952f5f37d0b7). A
   clean extraction of the new tarball ships rules under both LuaTeX formats
   and its `luatex.wasm` equals `dist/`'s; `release/notes-0.2.1.md` gained
   the LuaTeX bullet. **Do not run `npm run package` again** before
   uploading: the tar carries the staging copies' mtimes, so every run has a
   new digest. Of the three steps that were the owner's, two are done — the
   release (item 6) and the site sync (item 7) — and one is open:
   - **Re-pin Clew** — NOT done as of the end of session 8, **done since**
     (by the Clew-side agent, per `docs/16`; session 10 read the manifest:
     `5ddff636…`, 37,205,263 bytes, `KINDS.tex` on `luatex`). The original
     instructions, for the record: the manifest
     still carries 2c303539… / 37,203,244 bytes, which no published asset
     has, so `stage-mptikz.js` on any machine without the master build
     would refuse the download (on the owner's machine it prefers
     `~/Source/mp-tikz-wasm/dist`, so nothing breaks there). In
     `~/Source/Clew/Clew-app/src/shared/mptikz-manifest.json` set `sha256`
     to the tar.gz digest above and `bytes` to 37205263, and rewrite the
     PROVISIONAL sentence of `comment`. Then flip `src/engine/figures.js#KINDS`
     — `tex: { …, engine: 'plain' }` back to `'luatex'` — and replace the
     comment block above `KINDS` that explains the workaround (its account of
     the trap is out of date too: rules, not maths). `npm run sync-mptikz`
     there restages.
6. **Released by the owner** (2026-09-17): `main` pushed, tag `v0.2.1` on
   ff0271a, <https://github.com/jmckalex/mp-tikz-wasm/releases/tag/v0.2.1>
   with both archives. Checked afterwards: the asset sizes equal the local
   files' (37,205,263 and 39,045,845 bytes) and the downloaded tarball's
   sha256 is 5ddff636…, the local build's.
7. **Restaged and synced the website** (the owner asked, after publishing):
   `stage-site.sh`, both dry runs, then `make sync-eschatolog` and
   `make sync`, no deletions. On both hosts `index.html` says 0.2.1, and
   `tags.html`, `dist/luatex.wasm`, `dist/figures.js` and the re-rendered
   `figure-37rcew.svg` / `figure-r5umbw.svg` equal the repository copies
   byte for byte. Loose end 12's cache caveat applies to the four
   re-rendered figures: same names, new bytes, so a returning browser may
   show the old crops for up to 30 days.
8. **Loose end 15 found on the way**: the two LuaTeX format dumps are not
   reproducible run to run. Harmless; noted, not fixed.

## What happened in session 9 (2026-09-17, on branch `opentype-fonts`)

**OpenType fonts under LuaTeX** — the user asked whether porting XeTeX would
let LaTeX produce SVG in the fonts the browser shows. It would, but XeTeX was
the wrong lever: the answer is luaotfload on the LuaTeX that is already here.
**Nothing is merged and nothing is released**; the branch is committed and the
tree is clean.

1. **No engine work at all.** The wasm LuaTeX already compiles all 160
   `luafontloader` sources (the FontForge-derived OpenType reader) plus the
   `luafflib` binding that exposes them as Lua's `fontloader` table, and
   luaotfload's default `mode=node` shapes in Lua on top of exactly that. Zero
   harfbuzz objects in the build, so `mode=harf` stays out. What was missing
   was macro and Lua packages, not engine support.
2. **`build-texmf.sh`** copies `luaotfload`, `lualibs`, `luatexbase`,
   `lua-uni-algos` (not optional and not obvious: it supplies `lua-uni-case`,
   which `luaotfload-database.lua` requires), `fontspec`, `unicode-math`,
   `lualatex-math` from `tex/lualatex` (a subtree nothing else here used), and
   the Latin Modern OpenType family.
3. **Two opt-in bundles**, `opentype` (13.6 MB: the machinery, the Unicode
   tables and the twelve Latin Modern faces fontspec's own defaults name) and
   `otf-fonts` (6.8 MB: the other 60 optical sizes and `latinmodern-math`).
   **Revised in session 10, item 8:** the twelve were not enough — the fd
   files name all 72 — so `opentype` now carries the whole text family and
   `otf-fonts` is `latinmodern-math` alone.
   **Neither is in `DEFAULT_BUNDLES`, and that is the important design
   decision.** LaTeX under LuaTeX probes for luaotfload at start-up, so a
   findable luaotfload is an initialised one on every run: a document with no
   `fontspec` in it went 214 ms → 396 ms and 6.6 MB → 11.9 MB fetched. Measured,
   then reverted; the default engine is byte-for-byte what it was.
   `DEFAULT_BUNDLES` is now exported from the package so callers can write
   `bundles: [...DEFAULT_BUNDLES, 'opentype']`.
4. **The Unicode tables were the one real trap.** `build-bundles.mjs` had
   always skipped `tex/generic/unicode-data/` as build-time-only. True of the
   `.tex` loaders, false of the `.txt` tables: `luaotfload-multiscript.lua`
   opens `Scripts.txt` and `ScriptExtensions.txt` through `kpse.find_file` at
   run time, and `lua-uni-algos` builds the name it wants at run time, so the
   set is not decidable at build time — all the `.txt` files ship. This is why
   it worked against a mounted `texmfDir` long before it worked from bundles.
5. **A font cache that survives the run** (`core.ts`): parsing a face costs
   about a second and every TeX run gets a fresh filesystem, so luaotfload was
   rebuilding from nothing each time. `MetaPostCore` now carries `/texmf-var`
   between LuaTeX runs in a `Map`. Repeats went **1052 ms → 430 ms**; the cache
   is ~1.7 MB for one face and is logged at `trace`. It lives as long as the
   instance — persisting it (NODEFS, IndexedDB) is not done.
6. **Host-supplied faces**: `addFiles()` writes into `/work`, which is the cwd,
   and `TEXMFDOTDIR` leads `OPENTYPEFONTS`/`TTFONTS`, so
   `\setmainfont{X.ttf}[Path=./]` finds a face handed over as bytes. That is
   the Electron path — `queryLocalFonts()` in the renderer, bytes in, and with
   `fonts: 'woff2'` dvisvgm embeds a subset of that same file as `@font-face`
   with real `<text>`, so the SVG rasterises through the browser's own text
   renderer in the font the page's CSS loads. 34.9 KB of outlines against
   6.8 KB of webfont on one line. The glyph *positions* stay TeX's: no reflow.
7. **`mpost-wasm --opentype`** loads both bundles from the CLI.
8. **A stale filter that had become a bug**: `core.ts` dropped every diagnostic
   matching `/luaotfload/`, on the reasoning that it was only ever the
   not-bundled probe. With luaotfload present that swallowed real errors
   (a missing face reported nothing). Narrowed to the probe-failure lines, and
   there is a test for it.
9. **Verified.** 252 tests pass (+7 new in `test/e2e/opentype.test.ts`; the two
   prefetch tests that used to skip now run, `hot.json` having been rebuilt).
   Both goldens pass: MetaPost 15/15, TikZ **11/11 against the native oracle**,
   including the new `11-opentype-fontspec`, byte-identical to TeX Live 2025's
   `dvilualatex` + dvisvgm. `golden-tikz.mjs` gives OpenType cases their own
   engine so the opt-in bundles cannot disturb the other ten cases.
10. **Two `fonts: 'woff2'` defects found by building a demo page** (three
    figures inlined together, in Clew's own fonts). One **fixed**: dvisvgm's
    embedded faces are called `nf0`, `nf1`, … per file, and the `text.fN`
    classes likewise, so two figures on one page collided and each rendered
    from the other's subset — a word half in one weight and half in another.
    `postProcessSvg` now namespaces the `@font-face` families, the selectors
    and the `class` attributes with the same prefix it already gave glyph ids
    (three unit tests). It only affected callers passing `svg: {...}` — which
    is the tags and `--prerender`, so it was reachable in practice. One **not
    fixed and dvisvgm's to fix**: a `.ttc` collection collapses to a single
    `@font-face` because the face index is not part of dvisvgm's font key, so
    bold and italic draw garbled glyphs. (Session 9 thought `fonts: 'paths'`
    was fine; session 12 found the faces merge there too — `Optima.ttc` drew
    all four styles as bold italic.) Workaround is one file per face. Both are written up in `docs/14` §15.
11. **Plain LuaTeX cannot have OpenType — diagnosed to one missing callback;
    fixed in session 10** (see "What happened in session 10"; the rest of
    this item is session 9's analysis, kept as written). Session 9 took this
    to root cause and had a working proof of concept; what was left was
    deciding where the fix belongs.

    **Symptom.** Under `engine: 'luatex'` (plain, `dviluatex.fmt`), any native
    font fails with `Module luatexbase Error: Unable to register callback`
    followed by `Font \b=... not loadable: metric data not found or bad.`

    **Scope, measured on stock TeX Live 2025 (so it is not this port's doing —
    the wasm build fails identically):**

    | format | output | result |
    | --- | --- | --- |
    | plain (`luatex`) | PDF | works |
    | plain (`luatex`) | DVI | fails |
    | LaTeX (`dvilualatex`) | DVI | works |

    **Root cause.** `luaotfload-dvi.lua:105` (`delayed_register_callback`, run
    lazily at `\font` time) does
    `luatexbase.add_to_callback('pre_shipout_filter', …, 'luaotfload.dvi')`.
    `pre_shipout_filter` is **not a LuaTeX core callback**: it is created by the
    LaTeX kernel at `latex.ltx:19683`
    (`luatexbase.create_callback('pre_shipout_filter', 'list')`) and called from
    LaTeX's shipout. In plain TeX nobody creates it, so `add_to_callback`
    raises, the Lua chunk aborts and the font never gets defined. luaotfload
    guards this nowhere — arguably an upstream bug worth reporting, since
    `luaotfload.sty` advertises plain support.

    Why the hook matters rather than being ignorable: it runs `full_vprocess`,
    which remaps native glyphs onto synthetic 256-character fonts so they can be
    expressed in **standard** DVI. That is why a working `dvilualatex` DVI is
    format version 2 and dvisvgm reads it with no XDV involved.

    **Proof of concept that works** (native `luatex --output-format=dvi`; no
    errors, valid DVI, real glyph outlines through dvisvgm):

    ```tex
    \input luaotfload.sty
    \directlua{luatexbase.create_callback('pre_shipout_filter', 'list')}
    \font\b="[./Face.ttf]:mode=node" at 12pt
    \output={\directlua{luatexbase.call_callback('pre_shipout_filter', tex.getbox(255))}%
             \shipout\box255 }
    \b Hi fi ffl.
    \bye
    ```

    Creating the callback alone is not enough — it has to be *called* before
    shipout, which is the half LaTeX's output routine provides.

    **Already tried, none of it helps:** `\input ltluatex` before
    `luaotfload.sty` (luaotfload does this itself anyway); `mode=base` instead
    of `mode=node`; the `"file:…"`, `"[file]"` and `"[./file]"` lookup forms.
    The lookup syntax was never the problem — `"[./X.ttf]:mode=node"` is exactly
    what fontspec emits in the case that works.

    **Open questions for whoever fixes it.** Where does the shim live? Options:
    (a) in `dviluatex.fmt` at build time, which is the tidiest for users but
    makes our plain format differ from TeX Live's — check `09-luatex-rules`
    still matches the oracle, since the golden compares against TeX Live's own
    `dviluatex`; (b) a small `.tex` the user `\input`s, shipped in the
    `opentype` bundle, which keeps the format honest at the cost of a visible
    incantation; (c) upstream in luaotfload, which is the right long-term home
    and no help this year. Also: plain's output routine is `\plainoutput`, so a
    real fix must wrap that rather than replacing `\output` as the proof of
    concept does.

    Consequence at the end of session 9 (no longer true — session 10): OpenType
    was a `lualatex` feature here, not a `luatex` one, so a ` ```tex ` fence
    could not have it. `docs/14` §15 has the analysis and the fix.
12. **Not done**: not merged to `main`, not released, the site is untouched.
    (An earlier version of this item said the tags could not ask for the
    bundles. They can: `data-bundles="+opentype"` and
    `window.mpTikzWasm.addFiles()` came in 262fb36, the branch's last
    session-9 code commit; `docs/14` §15 "Reaching it from the drop-in tags"
    describes both.)

## What happened in session 10 (2026-09-17 evening to 2026-09-18, on `opentype-fonts`)

Two fixes on the OpenType branch, both driven by consumers: the plain-LuaTeX
shipout hook the user asked for (session 9's item 11), and a bundle gap the
owner found through Clew the same evening. Both Clew apps integrated the
result against the local `dist/` while the session ran, over cross-session
messages, and their measurements are recorded below. Nine commits, 948c269 →
99aadbe, on top of df83bea; the code is in 948c269 (the patch), 927fd9c
(tests), 2189931 (docs) and 57bbd6d (the bundle), the rest is this file.
Everything below is verified unless marked otherwise.

1. **Plain LuaTeX + OpenType — the cause, confirmed in the sources.**
   `luaotfload-dvi.lua` registers on `pre_shipout_filter` at `\font` time.
   That callback is created by the LaTeX kernel in `ltshipout` (from
   `\everyjob`, since the Lua state is not dumped) and called from LaTeX's
   `\shipout` wrapper; `luaotfload.sty`'s plain-TeX branch does neither, and
   upstream `main` is unchanged on this. It has to be called at shipout, not
   from `pre_output_filter`: a `\headline` is added by the output routine
   after that filter has seen box 255.
2. **The fix (948c269): `patches/texmf/0001-luaotfload-plain-dvi-shipout.patch`**,
   47 lines appended to `luaotfload.sty`. Under plain TeX, in DVI mode, and
   only if nothing created the callback already, it creates
   `pre_shipout_filter` and wraps `\shipout` the `everyshi` way
   (`\afterassignment` + `\global\setbox` into a reserved register, `\ifvoid`
   deferring with `\aftergroup` for `\shipout\vbox{…}`, then the callback and
   the saved primitive on `\box`), mirroring `ltshipout`'s call exactly.
   `build-texmf.sh` gained the mechanism — `patches/texmf/*.patch` applied
   with `-p1` to the assembled tree, target missing → skipped, hunk failing
   → build stops. Appended rather than inserted so the hunk's context is the
   file's tail (unchanged upstream since 2023), not the `\ProvidesPackage`
   line that changes each release; that is what should let it apply to
   Ubuntu's older luaotfload on CI. A patch rather than the format (which
   would differ from TeX Live's `dviluatex`, the oracle of golden 09, and
   would need `ltluatex` dumped) or a separate `\input` file (an incantation
   TeX Live users never need in PDF mode). `docs/14` §15 has the reasoning.
3. **Two traps met, both in `docs/14` §15**: `~` is active in plain TeX, so
   `result ~= head` inside `\directlua` in a macro body became
   `\penalty\@M\ ` and Lua said "'then' expected near '\'" (`ltshipout`
   writes `not (result == head)` for this reason); and `\newbox` is `\outer`
   in plain, so it hides behind `\csname` inside the guarding `\ifnum`.
4. **Verified, and the tests (927fd9c).** Natively first, against TeX Live
   2025 with the patched `.sty` on `TEXINPUTS`: a two-page document with a
   bold-face `\headline`, a user `\output={\shipout\box255 …}`, both clean
   through dvisvgm, and PDF mode untouched. Then the build (`build:texmf`
   applies the patch, `build:bundles` repacks; the formats were not rebuilt —
   `luaotfload.sty` is in no format, and loose end 15 makes LuaTeX format
   rebuilds change bytes). Two e2e cases in `test/e2e/opentype.test.ts`
   (plain LuaTeX with a headline; plain LuaTeX with a `\box255` output
   routine). TikZ golden **12/12 against the native oracle**, including the
   new `12-opentype-plain` (2 pages, byte-identical to `dviluatex` +
   dvisvgm; `golden-tikz.mjs` copies the patched `luaotfload.sty` next to the
   oracle's document for plain OpenType cases, since stock TeX Live cannot
   run the case); the other eleven unchanged; MetaPost golden 15/15.
5. **Docs (2189931)**: README (the plain-TeX example under "OpenType fonts",
   a `patches/texmf/` table under "Patches to upstream"), `docs/14` §15 (the
   "cannot have it" subsection rewritten around the fix), `docs/16` (Clew:
   the fourth trap is fixed; the `wrapTex` line to emit), `docs/02` §5 (the
   three patch directories).
6. **Bundle gap found by the owner through Clew, fixed (57bbd6d).**
   `\documentclass[12pt]{article}\usepackage{fontspec}` failed at load with
   "Font \TU/lmr/m/n/12=[lmroman12-regular]:+tlig; at 12pt not loadable". The
   kernel's TU fd files (`tex/latex/base/tulm*.fd`) name every one of Latin
   Modern's 72 faces by optical size and shape — 12pt classes want
   `lmroman12-*`, `\small` `lmroman9`, `\footnotesize` `lmroman8`, `\LARGE`
   `lmroman17`, `\textsc` `lmromancaps10` — and NFSS fails at the first face
   that is missing, after luaotfload has rebuilt its name database looking
   for it. So session 9's "twelve faces fontspec's defaults name" was true
   only of a 10pt document that never changes size. `build-bundles.mjs` now
   puts the whole `fonts/opentype/public/lm/` family in `opentype` (244
   files, 20,173,172 bytes nominal; each face fetched on demand, so a
   document pays for what it selects) and `otf-fonts` is `latinmodern-math`
   alone (1 file, 733,736 bytes). A tenth e2e case runs a 12pt document
   through the size commands, `\textsc`, `\textsl`, sans and mono with
   `opentype` alone; goldens 11 and 12 unchanged (their engine had both
   bundles, so luaotfload saw the same faces). Docs: README, `docs/08` §4.1,
   `docs/14` §15, `docs/16`, `bundles-config.ts`.
   **The cost, measured before it was written down:** luaotfload builds its
   name database on the first font request of every fresh instance
   **whatever the lookup form** (a plain `[file]` lookup too), opening every
   face it can see — 72 files, 7.2 MB, against twelve and 1.1 MB before —
   then keeps it in the per-instance font cache, so it is once per engine,
   not per run. About 100 ms in Node. Clew-app on 57bbd6d, cold page, six
   figures (five OpenType), served from its local protocol with `immutable`
   caching: settled in 4.5 s against 4.0 s on the twelve-face build; 483
   bundle files fetched in all, `opentype` 126 files / 12.1 MB of which all
   72 faces, `otf-fonts` untouched. Clew-iOS through its scheme handler:
   5.0 s against 5.1 s, inside the noise. So the scan is half a second on a
   local protocol and nothing on the iPad, and over the wire on the droplet
   it would be paid on every first OpenType figure. A prebuilt name database
   shipped in the bundle would take it to the two `lmroman12` faces a 12pt
   article actually needs; it is the follow-up to do before a release.
7. **Clew-app integrated it the same evening** (the Clew-app session, over
   cross-session messages; its own handover has the details). `font=note`
   on the ```` ```tikz ````, ```` ```latex ```` and ```` ```tex ```` fences,
   verified as embedded-face text on a fresh profile with a control figure
   untouched, its tests green, manifest untouched. It asks `auto.js` for
   `+opentype` only when a marked figure is on the page **and**
   `bundles/index.json` lists the bundle, so a build pinned to 0.2.1 refuses
   such figures by name instead of failing the engine; it splits
   `Avenir Next.ttc` into one `.ttf` per face; `wrapTex` emits the plain
   idiom (`\input luaotfload.sty`, three `\font` lines with
   `+liga;+kern;+tlig`, `\let` over `\tenrm`/`\tenbf`/`\tenit`, then `\rm`;
   verified natively here first, maths stays on Computer Modern). Its
   fixture carries the 12pt case with both expectations written down: ok on
   57bbd6d, the `lmroman12` signature on the twelve-face build. Two findings
   from that side worth keeping: (a) its preview protocol serves the staged
   dist with `Cache-Control: immutable`, a year, so a restaged dist was
   served stale — the owner's profile kept the session-9 `luaotfload.sty` —
   now handled there by an asset stamp (engine and bundle-index mtimes +
   sizes + app version) that clears the Electron cache on change; (b) the
   per-figure `@font-face` namespacing holds with three figures on one page.
   Library-side answer given, checked in the code: bundle files live only in
   an in-memory `Map` per engine, the manifest's per-file `sha` is not in
   the URL, and the tags' IndexedDB result cache stores successful renders
   only — nothing in the library held the stale file, it was the HTTP cache.
8. **Clew-iOS verified `font=note` on the iPad simulator**, first against
   the dist at 41d3ea4, staged whole (109 MB) under its `clew-preview://`
   scheme: nine figures in 5.1 s cold, the opentype files fetched on demand
   through the scheme handler with no preload, real `<text>` runs against
   embedded faces, Avenir Next faces built per face from CoreText tables on
   the device; WebKit did not hold a stale index across an app update. Then
   restaged on 1dea1b8: the 12pt article typesets (3 text runs, 2 embedded
   faces), all six fixture figures ok in 5.6 s cold, the nine-figure note
   5.0 s; staged tree unchanged in count and size (3,891 files, 109 MB), the
   faces having moved between bundles. Its pin waits for a release. Answers
   given on the way, all checked in the tree: no release carries the
   bundle; the dist here matches the branch head (a TS rebuild changed
   nothing); `mp.preload()` is on the API and the Worker backend but not on
   the tags; nothing in the OpenType path assumes http(s) or a disk.
9. **A build trap (5b20be8 records it):** `npm run build:bundles` wipes
   `dist/bundles`, `hot.json` included, and only the full `npm run build`
   regenerates it (`build:hot` runs last), so after a bundle-only rebuild
   the two prefetch tests *skip* rather than fail — the session's first full
   run read "255 passed, 2 skipped" for that reason. `npm run build:hot`
   restores it. The hot lists have no OpenType kind: the `opentype` bundle
   is fetched on demand, or up front with `mp.preload(['opentype'])`.
10. **A CI break found and fixed before it was seen.** Consolidating this
    file turned up that `build-texmf.sh` copied the OpenType Latin Modern
    faces from `TEXMFDIST` only, while Ubuntu's `fonts-lmodern` (pulled in by
    the `lmodern` CI installs) puts them under `/usr/share/texmf/fonts/
    opentype/public/{lm,lm-math}` — checked against the package's file list
    on packages.ubuntu.com — exactly where session 4 found the Type 1 faces
    and handled them with `tree_with`. On the runner the `opentype` bundle
    would have shipped without a single face. The two OpenType directories
    now go through the same `tree_with` search, with a warning when neither
    is found. On this machine the rebuilt tree and bundles are byte-for-byte
    what they were (72 faces, the maths font, opentype 244 / 20,173,172,
    otf-fonts 1 / 733,736), and the OpenType and prefetch tests pass. Loose
    end 18 records it.
11. **Not done / open**: not merged, pushed or released; CI has never built
    the branch — the texmf patch's applicability on Ubuntu's luaotfload is
    argued from upstream history — so pushing it is the next thing to learn
    from. The prebuilt name database (item 6) before
    a release. No upstream report to luaotfload yet (the patch is the
    report). luaotfload's font cache is still per instance. The manifest's
    per-file `sha` is not yet in bundle file URLs (next steps).

## What happened in session 11 (2026-09-24 to 2026-09-29, on `opentype-fonts`, released as 0.3.0)

Commits 85fe86f → the latest handover commit. Several of them (the pages,
the packages, the chemfig fix) came out of requests from elsewhere: the
owner's, a subagent's work, and the Folio session (another embedder,
replacing its tikzjax with this library).

1. **Prebuilt luaotfload name database (85fe86f)** — loose end 17, the
   release blocker. `scripts/make-fontdb.mjs` (`npm run build:fontdb`, now
   between `build:ts` and `build:bundles` in `npm run build` and in CI) runs
   one fontspec document through the wasm LuaLaTeX with `build/texmf`
   mounted, keeps the `luaotfload-names.lua.gz` it writes (5.6 KB), zeroes
   its clock stamps, and stores it as `build/texmf/luaotfload/`, which the
   `opentype` recipe claims. `MetaPostCore.installTexmfVar` seeds each
   instance's font cache from `/texmf/luaotfload/` (bundles and `texmfDir`
   alike). Fresh engine, 12pt article: 72 faces / 7.40 MB / 691 ms → 4 faces
   / 0.44 MB / 578 ms, SVG byte-identical. luaotfload checks only the index
   version and rescans by itself on a miss (a host face by family name still
   works). `build-bundles.mjs` warns if the database is missing — which it
   is after any `build:texmf` until `build:fontdb` runs again. New e2e case;
   `docs/14` §15 has the reasoning. Not checked in a browser; it rides the
   same lazy-file path every bundle file does.
2. **Live custom elements (ab682b6).** `<tikz-diagram>` and
   `<metapost-diagram>` typeset again on new text content, the new `source`
   property, or an output-affecting attribute; debounced (`data-debounce`,
   default 200 ms), old figure kept up dimmed, overtaken results dropped,
   `figures()`/`saveFigures()` list only what is shown, the rendered event
   carries `update`. Script tags unchanged (render once). Verified in Chrome
   on a scratch test page (every trigger; five edits → one render; an edit
   mid-render) and `tags.html?live`. No automated test: the repo has no DOM
   test library (happy-dom would do). README, guide, `docs/14` §8.
3. **Restyled pages and 19 new examples (a29254b)**, done by a subagent:
   shared `site/theme.css`/`theme.js` (light/dark), `scripts/site-chrome.mjs`,
   phone-width layouts, a sectioned gallery with OpenType controls, 14 new
   guide figures with LuaTeX and OpenType sections, four new tags-page
   figures (saved figures regenerated). Every example rendered in Node and in
   Chrome. `guide.html` is 1.6 MB now (was 690 KB). The gallery's stall limit
   is 120 s because the spath3 knot takes ~27 s in Chrome (3 s in Node). The
   landing page `stage-site.sh` writes is still in the old style.
4. **chemfig, simplekv, circuitikz, tikz-3dplot (5cb94cb)**, edited in this
   tree by the Folio session at the owner's request and verified here.
   chemfig/simplekv/circuitikz's generic half ride in `tex-plain` (a default
   bundle), the LaTeX parts in `latex-extra`. **circuitikz's rollback
   releases are excluded (dc5c303)**: 8.8 MB of twelve frozen old versions;
   `latex-extra` is 12.2 MB (12.1 before the packages). circuitikz's
   `siunitx` option still fails: siunitx and xstring are not bundled.
5. **Bare `\chemfig` bodies (8a5d378)**: `wrapTikz()` put them inside a
   `tikzpicture` and they typeset at zero size; a body that starts with
   `\chemfig` is now left bare. Measured: `\schemestart`, `circuitikz` and
   `tikzcd` bodies are the same size nested or not, so they were left alone
   (Folio's report included circuitikz; it did not reproduce).
6. **Own-picture bodies (75b46d1)**, found while checking DOMPurify: bare
   `tikzcd`, `circuitikz`, `\chemfig` and `\schemestart` bodies were nested
   in a second `tikzpicture` and collapsed or vanished (the size comparison
   behind 8a5d378 had missed it). A body that starts with one now gets
   `\documentclass[border=…]{standalone}` + `\usepackage{tikz}`, which crops
   any body (standalone's `tikz` option would leave a circuitikz on a letter
   page). Other bodies keep their document and hash (the tags page's saved
   figures still match).
7. **`sanitizeSvg()` deprecated in favour of DOMPurify** — loose end 20.
8. **`svg.attributes` and `data-replace` (247d58b)**, for reveal.js
   fragments inside diagrams. A bundled TikZ library
   (`bundles/tex/`, in `tex-plain`) gives `svg class`, `svg id` and
   `svg attributes` on scopes, paths and nodes through PGF's own id-scope
   `<g>` (the rdf hook); no-op under non-SVG drivers. `data-replace` swaps a
   custom element for its `<svg>` after a successful render. Checked with
   reveal.js 5 in Chrome; README has the example.
9. **Hot lists skip the OpenType guide examples (6adfde4)**: they need the
   opt-in bundles and failed on the default engine ("! otf-math: error").
   The lists are unchanged.
10. **The 0.3.0 release (2026-09-28)**, owner-approved, requested by
    Clew-iOS. CI had never built the branch and failed five times before
    going green; every failure was real:
    - `dvisvgm.wasm` came out 48 KB larger than 0.2.1's: the build script
      defaulted to `-O2`, while releases were linked `-Oz` by hand. Default
      is `-Oz` now (36339c0); relinking reproduces 0.2.1's file byte for byte.
    - `build-texmf.sh` writes `ls-R` before `make-formats` builds the formats,
      and TEXMFDIST is `!!` (ls-R only), so on a clean tree a mounted-`texmfDir`
      run found no format. `make-formats` now rewrites ls-R's `web2c/` section.
      Local rebuilds never showed it (build-texmf carries old formats in).
    - CI copied the texmf tree from Ubuntu's TeX Live 2023; its luaotfload
      scanned no faces under LuaTeX 1.21. `scripts/ci-install-texlive.sh` now
      installs the 109 packages build-texmf copies from (found by mapping
      build/texmf to texlive.tlpdb) from TeX Live 2025's frozen tlnet-final,
      cached. The native job keeps Ubuntu's TeX Live as its oracle.
    - Under tlnet-final's newer LaTeX kernel (L3 2026-01) `expl3.lua` requires
      `lua-uni-stage-tables`, and `lua-uni-algos` was in the opt-in `opentype`
      bundle, so every non-OpenType LuaLaTeX run failed at start-up and the
      error cascade **hung** the e2e tests instead of failing them (loose end
      23). `lua-uni-algos` now rides in the default `luatex` bundle (67c437c).
    - `make-fontdb` names a missing OpenType package, prints the TeX log's end
      on failure, forces a by-name lookup and finds the database under any
      name — all diagnostics added on the way.
11. **After the release (unreleased, on the branch; see "State now").** The
    owner asked for every open bug fixed, then agreed to triage instead of
    fixing all: `hot.json` survives bundle rebuilds and CI runs the prefetch
    tests (loose end 16), script-tag pages prefetch again (19, confirmed in
    Chrome before the fix), `worker: true` works in Node so a runaway document
    can be stopped (23: native LuaTeX loops identically; the problem was only
    that Node could not interrupt it), CI has time limits. The rest was left
    as loose ends on purpose. Verified: 263 tests, both goldens, the contract,
    the tags page live in Chrome, the watchdog on a Web Worker and a Node
    worker, CI green.
12. **Found, not fixed** — loose ends 21, 22, 24, the triage list, and the
    killed-worker wait under 23.

## What happened in session 12 (2026-10-03, on `opentype-fonts`, unreleased)

1. **Palimpsest** (the owner's iOS PDF app, `~/Source/PDFViewer`, session
   "PDFViewer") asked how to turn LaTeX notes into PDFs with this library. It
   was told: SVG only (at the time); vendor the pinned v0.3.0 dist; the API;
   module Worker, no threads, no network, a scheme handler answering fetch and
   sync XHR (as Clew-iOS does); the GPL engines and the App Store (the owner's
   call). It chose SVG pages + WKWebView `createPDF`, without the `luatex` and
   `tikz-snapshot` bundles (so `engine: 'latex'` explicitly).
2. **Optional PDF output** (266d919), at the owner's request, "without breaking
   anything". `LatexRunOptions.output: 'svg' | 'pdf'` (default `'svg'`):
   pdfTeX / LuaTeX run with `-output-format=pdf` (same formats, source
   untouched), PGF's pdftex/luatex driver, no snapshot, no dvisvgm;
   `LatexResult.pdf: Uint8Array`, `pages` empty. CLI `--pdf`. PNG/JPEG images
   are included; PDF images are not (no PDF parser in `tex.wasm`). One pass per
   call — hand `artifacts` back as `files` for cross-references and outlines;
   automatic reruns are not built. Two TeX files were missing for PDF mode
   (found by a native `-recorder` run): `epstopdf-base.sty` and ConTeXt's
   `supp-pdf.mkii`; both now in `latex-extra`, their packages in CI's install.
   **Fidelity:** `scripts/golden-pdf.mjs` (`npm run test:golden:pdf`; four
   cases in `test/golden/pdf/`, native expectations in `pdf-expected/`) is
   byte-identical to TeX Live's `latex`/`etex -output-format=pdf` apart from
   the pdfTeX version (1.40.27 vs the owner's updated 1.40.28). LuaTeX's PDFs
   match native in size and content, differing in version (1.21.0 vs 1.22.0)
   and `/ID`; e2e tests check them. CI runs the PDF golden for information.
   SVG output unchanged (267 tests, all goldens, contract); checked in Chrome
   through a Web Worker (the PDF renders in Chrome's viewer).
3. **`grfext` bundled** (found by Palimpsest within the hour): `epstopdf-base`
   loads it only when it is given options — `\usepackage{epstopdf}`, for one —
   which the first `-recorder` scan never exercised. A second scan with
   option-heavy packages (epstopdf, graphicx[final], xcolor[dvipsnames],
   hyperref[colorlinks], lmodern/T1, tikz-cd, circuitikz, chemfig) found
   nothing else missing; e2e case added (268 tests). Palimpsest's own failing
   document (standalone with varwidth, lmodern, T1, TikZ) is golden case 05,
   byte-identical to native like the other four.

4. **`auto.js` loads the library lazily** (e64ebcc, agreed for 0.3.1): a page
   whose figures are all saved or cached loads 5 modules / 17 KB gzipped
   instead of 19 / 55 KB (checked in Chrome: no `index.js`, no wasm; `?live`
   renders all 13 figures). `docs/14` §13.
5. **0.3.1 prepared** (the owner asked: "prepare that release and update any
   documentation files"): version bump, full `npm run build` (engines
   byte-identical to 0.3.0), all goldens, contract, package, clean-extraction
   smoke test, CI green; docs updated (README, guide, `docs/08`, `docs/14`,
   `docs/16` "In 0.3.1"); notes in `release/notes-0.3.1.md`. Not published —
   see "State now".
6. **A regression the full build caught** (e573515): the single-file demo
   pages failed to build since the Node worker change (8b6d145) — esbuild
   could not resolve `node:worker_threads` for the browser bundle; those
   builds had been run with their output discarded. Marked external like
   `node:fs`; `test/unit/browser-bundle.test.ts` bundles `index.ts` with the
   builders' own externals (checked to fail without the fix). Lesson: never
   silence a build step's output.

7. **URW Classico, the opt-in `classico` bundle** (the owner's decision, asked
   by ph341 for slides in Optima). Not in TeX Live: its fonts are under the
   **Aladdin Free Public License** (non-commercial distribution only); the owner
   decided to bundle it because Clew and Palimpsest are not commercial. Built
   from the local install in `texmf-local` (a tree without it builds an empty
   bundle; CI has none, so `test/e2e/classico.test.ts` skips there). 67 files,
   987 KB; `classico.map` folded into the shared font maps; `fontaxes` and
   `figureversions` (its dependencies, LPPL) added to `latex-extra`.
   `NOTICE.md` row and `licenses/COPYING.AFPL`; `docs/08` §4.2. Checked: ph341's
   diagram with `\usepackage[T1]{fontenc}\usepackage{classico}` sets `\sf` and
   `\textbf` in Classico Regular/Bold (SVG; PDF embeds both). **Not released**:
   the next release (0.3.2) would carry it; production deploy waits for that.
8. **`.ttc` collections fail in paths mode too** — found while trying macOS
   Optima for ph341; docs corrected (3e23bdc). Split faces work. *Fixed
   properly in session 13* (`patches/dvisvgm/0001`).
10. **Stale HTTP caches** (reported by ph341 after the Classico rebuild): MAMP
   sends no Cache-Control, so Chrome reused yesterday's `latex-extra`
   manifest (no `fontaxes`) and font maps (no Classico); dvisvgm then wrote
   glyph references it never defined, **exited 0**, and the tags cached the
   empty figure. Fixed: bundle file URLs carry the manifest's `?v=<sha>`,
   manifests and hot lists are fetched with `cache: 'no-cache'`, and a LaTeX
   render whose dvisvgm log says "no font file found" or whose SVG has
   dangling `href="#…"` is now an **error** (not cached). This also turns a
   long-silent failure into an error: T1 without `lmodern` uses the EC fonts,
   whose Type 1 outlines (cm-super) are not bundled, and used to come out "ok"
   with the text missing. Tests: `test/unit/stale-cache.test.ts`, an e2e case.
   Embedders with their own URL handlers (Clew-iOS `clew-preview://`,
   Palimpsest `pdfv://`) must ignore the query string.
11. **`--prerender` honours `data-bundles`; `--base=DIR`** (reported by ph341):
   the pre-renderer built every engine with the default bundles, so a page
   whose loader said `+classico` failed in the CLI while rendering in the
   browser. `bundleList()` (figures.ts) is now the one parser of
   `data-bundles`, used by `auto.js` and `planPage`; `prerender()` groups
   figures by bundle list, one engine each. `--base=DIR` / `baseDir` resolves
   `data-figures` against another directory. ph341 can drop its own
   `prerender.mjs`.
9. **ph341** (lecture deck) now loads `/software/mp-tikz-wasm/dist/auto.js` for
   one diagram; for `<tikz-diagram>` it was told to use `class="mathjax_ignore"`
   (MathJax 3.2.2's ignore class, checked in its copy).

## What happened in session 13 (2026-10-06, `main`, then branch `dvisvgm-ttc`)

1. **`main` caught up.** At the owner's request `main` was fast-forwarded to
   `opentype-fonts` (3e23bdc..6d89954) and pushed; CI run 37488886716 green.
   The one red run on the branch since 0.3.1 (c1ec408) was the new missing-font
   test expecting one wording of the error where CI reported the other;
   7508118 accepts both. Two CI warnings worth acting on: `ubuntu-latest`
   moves to Ubuntu 26 from 2026-10-19 (the native job apt-installs about ten
   TeX Live packages, any of which can change or be renamed); and
   checkout/setup-node/cache/setup-emsdk still target Node 20.
2. **TrueType Collections fixed at the source** (branch `dvisvgm-ttc`). The
   owner asked for a real fix instead of the one-file-per-face workaround. The
   defect is dvisvgm's: luaotfload writes `[file.ttc]:index=N` into the DVI and
   dvisvgm parses it, but `FontManager::registerFont` keys a native font by
   path and style only, so every later face became a reference to the first.
   `patches/dvisvgm/0001` puts the index into the key (three files, five lines).
   `build-dvisvgm-wasm.sh` gained a patch step. It copies the whole `src/`
   directory, because the sources include their headers with quotes, and it
   rebuilds every object when the set of patches changes. Verified natively
   (stock TeX Live dvisvgm 3.4.3 against the same source patched and built
   with clang, on `Optima.ttc` faces 0–3), then in wasm. A new e2e case builds
   a two-face `.ttc` from Latin Modern at run time and fails on the old
   engine. macOS `Optima.ttc` and `Avenir Next.ttc` render all four faces in
   both modes. Goldens unchanged.
   `dvisvgm.wasm` is 37 bytes larger, and two builds give identical bytes.
   Upstream 3.6.1 still has the defect. `docs/14` §15 has the write-up,
   `docs/16` the `FontIndex` recipe for Clew, and the README a patch table.
3. **Native dvisvgm is not run-to-run deterministic** on multi-font documents:
   glyph and `@font-face` order follows heap addresses (ASLR). The golden
   harness already sorts glyph definitions, so nothing breaks; the wasm engine
   is deterministic across processes. Since the patch changes allocation sizes,
   regenerated pages with OpenType figures reorder some glyph definitions
   (same content).

## CI — green as of 2026-09-29 (first green in session 4)

`.github/workflows/ci.yml` runs two jobs on every push, both green, with time
limits (jobs 30 and 45 minutes; the e2e step 10, each golden 5 — a TeX run
stuck in wasm blocks vitest's own timers, so only GitHub's limits can stop it):

- **native** (ubuntu-latest): Ubuntu's TeX Live as the oracle, the pinned
  vendor tree, `make contract` (48 checks), and the unit tests.
- **wasm** (ubuntu-latest, Emscripten 6.0.9): builds all four engines, then
  the texmf tree **from TeX Live 2025's frozen tlnet-final**, installed by
  `scripts/ci-install-texlive.sh` (the 109 packages build-texmf copies from,
  ~170 MB, cached on the script's hash), formats, TypeScript, the font
  database, bundles and hot lists; then the e2e tests (44, none skipped), the
  MetaPost golden `--check`, and the TikZ golden `--check` for information
  (`continue-on-error`; it has passed 12/12 there since session 11).

Latest green runs: 36495402034 (803e800, the branch) and 36488882483
(67c437c, the 0.3.0 release; its tag ran green too). First green run:
34769341698 (c24dbb3, session 4). The branch's first CI builds (session 11)
failed five times, each on a real defect: see session 11, item 10.

What was wrong and what fixed it (session 4, five commits f822ff3 →
c24dbb3, all pushed):

1. **vendor download** — `ftp.math.utah.edu` unreachable from the runners.
   Fixed in session 3: mirror fallback in `scripts/extract-vendor.sh` and
   `actions/cache` for the tarball.
2. **`make contract` tangling order** and a vpath object rule that could not
   build on a clean tree. Fixed in session 3 (commit f822ff3); the Makefile
   lists every generated header and uses no vpath.
3. **wasm build died in `native-texlive.sh`** with "No such file or
   directory": TeX Live's top-level configure prepares only
   `auxdir/auxsub`, `libs`, `utils` and `texk`; the packages below them
   (`texk/kpathsea`, `libs/zlib`, `texk/web2c`, …) are created and
   configured lazily by the `recurse` rule of `am/recurse.am` when make runs
   in `libs/` or `texk/`. The local tree only had them because session 1 ran
   a full top-level make once. `scripts/native-common.sh` now reproduces the
   recursion's per-package configure (from `subsubdir-conf.cmd`), and the
   three native scripts configure and build only what pdfTeX, LuaTeX and
   dvisvgm need. The top-level configure names the source by a relative path
   so the tangled C is identical between machines.
4. **native contract** failed one check: the `.mpx` oracle sample
   (`reference/mpx-samples/latex-math.mpx`) was never committed — the
   `*.mpx` ignore rule swallowed it. Un-ignored and committed.
5. **luatex.wasm** failed on a clean tree (stale objects masked it on the
   Mac): (a) the native LuaTeX build was recorded with `make -j8 V=1` and two
   verbose command lines interleaved in the log, corrupting a flag
   (`-DLUAI_HASHLIMIT=6` → `-DLUAI_HA) __DSHLIMIT=6`) — now recorded serially
   (GNU make ≥ 4 keeps parallel speed with `-Otarget`, Apple's 3.81 uses
   `-j1`); (b) the replay compiled the native mplib tangles whose recorded
   VPATH-fallback path does not exist, then again from the patched tangle —
   `build-luatex-wasm.sh` now skips the native mplib (keeping `lmplib.c`).
6. **texmf build** aborted because Ubuntu's TeX Live lacks Latin Modern in
   `TEXMFDIST`. The apt lists install `lmodern`, and `build-texmf.sh`
   searches every configured TeX tree (`kpsewhich -expand-path '$TEXMF'`)
   and tolerates absent optional fonts.

**The TikZ/LaTeX golden is still a dev gate, run on CI for information.**
Its expectations are regenerated with `npm run test:golden:tikz` (no
`--check`) on a TeX Live 2025 machine, which runs the native oracle
(`pdflatex`, `dvilualatex`, `dviluatex`, `dvisvgm`); `--check` compares
against the committed files and needs no native TeX. The owner's TeX Live
2025 is a May 2025 snapshot and CI's is the final one (~190 files differ), yet
all 12 cases match on both, so making it a real gate is a one-line change
(loose end 24).

To watch a run:

```sh
gh run list --limit 3
gh run view <run-id> --json jobs --jq '.jobs[] | "\(.name): \(.conclusion) — " + ([.steps[] | select(.conclusion=="failure") | .name] | join(", "))'
gh api repos/jmckalex/mp-tikz-wasm/actions/jobs/<job-id>/logs > /tmp/job.log   # gh run view --log was empty
grep -n -i "error" /tmp/job.log | tail -30
```

## The website

The demos are served from one host, the DigitalOcean droplet `jmck-web`
(139.59.191.156), under **both** <https://eschatolog.ist/software/mp-tikz-wasm/>
and <https://jmckalex.org/software/mp-tikz-wasm/> — jmckalex.org's DNS points at
the droplet. **Bluehost is discontinued** (the owner, 2026-09-28); its
`public_html/software` no longer exists. Deploy from the local staging copy
`~/Sites/jmckalex/software/mp-tikz-wasm/` (generated by `stage-site.sh`, never
edited by hand except its `Makefile` and `exclude`):

```sh
cd ~/Source/mp-tikz-wasm && npm run build:standalone   # if site/examples.js changed
scripts/stage-site.sh ~/Sites/jmckalex/software/mp-tikz-wasm   # or `make stage` there
cd ~/Sites/jmckalex/software/mp-tikz-wasm
make check && make sync   # dry run first; sync uses --delete
make verify               # the landing page, the guide and an engine answer 200
```

`make sync` targets the droplet only (rewritten 2026-10-02; the Bluehost
targets are gone, and `sync-eschatolog` remains as an alias). Staging copies
the working tree's `site/` and `dist/`, so stage from the released state: on a
branch with unreleased fixes, `rsync -anc` against the droplet shows which
files would change.

- **The landing page** (`index.html` at the top of the site) is
  `site/landing.html` with `@VERSION@` filled in, in the Fishhook Software
  style shared with fishhooksoftware.com (2026-10-02). Its hero shows four
  saved figures of the tags page by their content-hash names
  (`site/figures/figure-*.svg`); `stage-site.sh` fails if one is gone, in
  which case pick replacements from `site/figures/`.

- The droplet's nginx types `.wasm` (`application/wasm`) and `.mjs`
  (`text/javascript`), caches assets 30 d, denies `Makefile`/dotfiles; its
  basic auth is commented out so `/software/` is public. Sync needs
  `--chown=web:web --chmod=D755,F644` (the `sync-eschatolog` target does this).
  Content lands in `/var/www/jmckalex/software/mp-tikz-wasm`; ssh alias
  `jmck-web`, root, key `~/.ssh/digitalocean_trocp`. Both domains answer in
  ~60 ms.

**Cache caveat (seen after the 0.2.0 sync):** the droplet serves `dist/*.js`
with `Cache-Control: max-age=2592000, public` (30 days, no `immutable`) and
the HTML with no cache header, so a returning visitor gets the new
`tags.html` with a month-old `auto.js` until they hard-reload. Nothing
breaks — the old script ignores `data-figures` and renders live, and a new
`auto.js` with an old cached `index.js` also works — but the saved-figure
benefit only reaches such a visitor after their cache expires. If that
matters, add a version query to the loader `src` in the pages (`stage-site.sh`
knows the version) or shorten the max-age for `dist/*.js` in the nginx
server block. Not done; the user has not been asked (loose end 12).

**Saved figures on the site:** `site/figures/` is committed and staged as
is. If the tags page's diagrams change, run `node dist/cli.js --prerender
site/tags.html` before staging, and remove the orphaned files by hand — the
names are content-addressed, so a changed diagram gets a new file and the
pre-renderer never deletes the old one (`--dry-run` shows what it would
render; `git status` shows what is new).

`npm run pages` (`scripts/publish-pages.sh`) is a GitHub Pages alternative,
tested against a throwaway repository only.

Historical: on Bluehost (~570 ms per request) a first TikZ figure waited
~12 s and graph drawing ~55 s; on the droplet these are a few seconds — why the
droplet deployment happened.

## Build and test, from scratch

Prerequisites are in the README ("Building from source"): C/C++17 toolchain,
Node ≥ 20, Emscripten 6.0.9 (`.emsdk-version`; on this machine at
`~/emsdk` — see "Loose ends"), a full TeX Live 2025 (the oracle and the
source of the bundled files; here `/usr/local/texlive/2025`, a May 2025
snapshot — CI uses the final 2025 packages via `scripts/ci-install-texlive.sh`,
which also works locally: `scripts/ci-install-texlive.sh DIR` and put
`DIR/bin/*` first on PATH). A full `npm run build` takes about an hour here,
most of it the native LuaTeX build.

```sh
export PATH=$HOME/emsdk/upstream/emscripten:$PATH
./scripts/extract-vendor.sh && ./scripts/verify-pin.sh
make contract                    # native mplib + 48 checks
scripts/native-texlive.sh        # once: web2c pass for pdfTeX
scripts/native-dvisvgm.sh        # once: dvisvgm config
scripts/native-luatex.sh         # once: native LuaTeX build, compile commands recorded
npm run build                    # all wasm, texmf, formats, TypeScript, font database, bundles, hot lists
npm test && npm run test:golden && npm run test:golden:tikz
npm run build:guide; npm run build:pages; npm run build:standalone
node dist/cli.js --prerender site/tags.html   # site/figures/ (committed; only if the tags page changed)
npm run package
```

`make contract` and `make wasm` now work on a clean tree (the Makefile lists
every generated header and no longer relies on a vpath). After a partial
rebuild: `build:texmf` wipes the font database (run `build:fontdb` before
`build:bundles`; build-bundles warns), and `build:bundles` now keeps
`hot.json`. `dvisvgm.wasm` links with `-Oz` by default, as every release has.

## Publishing a release

```sh
npm run build && npm run build:guide && npm run build:pages && npm run build:standalone
npm run package                                   # release/mp-tikz-wasm-<version>.{tar.gz,zip}
git tag v<version> && git push origin main --tags
gh release create v<version> release/mp-tikz-wasm-<version>.tar.gz release/mp-tikz-wasm-<version>.zip \
  --title "mp-tikz-wasm <version>" --notes-file <notes>
```

**v0.2.1 is released** (2026-09-17, session 8, published by the owner):
<https://github.com/jmckalex/mp-tikz-wasm/releases/tag/v0.2.1>, tag `v0.2.1`
on ff0271a, with `mp-tikz-wasm-0.2.1.tar.gz` (37,205,263 bytes, sha256
5ddff6361e88f1368e15817b1d2691f6946940b50762c54eb1ce18b2a8603ad7) and `.zip`
(39,045,845 bytes). Verified: asset sizes via `gh release view`, and the
downloaded tarball's sha256 equals the local build's. The notes cover the
LuaTeX rule fix, the kept border and spath3. Clew re-pinned to it
(confirmed in session 10).

**v0.3.1 is released** (2026-10-04, session 12): tag on 52b7bbc, tarball
44,239,255 bytes, sha256 24b0cd29…c152 (full numbers in "State now"); same
procedure as v0.3.0 below, with the website's `make check` / `make sync` /
`make verify`.

**v0.3.0 is released** (2026-09-28, session 11):
<https://github.com/jmckalex/mp-tikz-wasm/releases/tag/v0.3.0>, tag `v0.3.0`
on 67c437c (`main`), `mp-tikz-wasm-0.3.0.tar.gz` (44,229,933 bytes, sha256
4a3a61b3760042d191dbf23d2169a776981be1caad9ec1d2b05cd6729c4d141b) and `.zip`
(46,164,345 bytes). Verified: the downloaded tarball's sha256 equals the local
build's; Clew's `tar xzf … --strip-components=2 mp-tikz-wasm-0.3.0/dist` gives
the same `dist/` as this machine's apart from `.js.map`; a clean extraction
renders MetaPost, fontspec, plain luaotfload, chemfig with `svg.attributes`,
and LuaLaTeX on the default bundles. Notes: `release/notes-0.3.0.md`. For the
next release: the full `npm run build` takes about an hour here (the native
LuaTeX build); after it, check the engines against the previous release (the
`-Oz` lesson), and push before tagging so CI builds the exact commit.

**v0.2.0 is released** (2026-09-16, session 6):
<https://github.com/jmckalex/mp-tikz-wasm/releases/tag/v0.2.0>, tag `v0.2.0`
on 6408c66, with `mp-tikz-wasm-0.2.0.tar.gz` (37 MB, sha256
a7255429800f196b31a92bdf5dc278c467c32974abb6522a089f041c0955be68) and
`.zip` (39 MB). Verified: the GitHub tarball's sha256 matches the local
build; a clean extraction renders MetaPost (with a btex label) and TikZ
through the Node API, its `dist/cli.js --prerender --dry-run site/tags.html`
finds the eight shipped figures saved, and re-rendering them into a fresh
directory reproduces `figure-r5umbw.svg` byte for byte. The notes cover
saved figures, levelled logging and the cache-key change. The steps were the
v0.1.0 procedure below, with `make wasm` and both golden checks before the
release commit, and the site synced after.

**v0.1.0 is released** (2026-09-13, session 4):
<https://github.com/jmckalex/mp-tikz-wasm/releases/tag/v0.1.0>, tag `v0.1.0`,
with `mp-tikz-wasm-0.1.0.tar.gz` (36 MB) and `.zip` (38 MB). Verified: the
GitHub-hosted tarball's sha256 matches the local build, and a clean extraction
both renders through the Node API (MetaPost + TikZ) and serves via `node
serve.mjs` with the engines running in the browser. For the next release, bump
`version` in `package.json`, then `npm run build && npm run build:guide &&
npm run build:pages && npm run build:standalone && npm run package`, `git tag
v<version> && git push origin v<version>`, and `gh release create`. `dist/` is
not committed, so a source clone still has to build. `package.json` is
`private: true`: nothing is on npm; remove that line to publish there. Restage
and sync the website (`make sync-eschatolog`, dry run first) after a release.

## Loose ends, honestly

1. ~~**CI red**~~ — fixed 2026-09-13 (session 4); see "CI" above. Green.
2. ~~**Six commits unpushed**~~ — pushed; `main` is clean.
3. **`~/emsdk`** (1.8 GB) was installed there by the assistant on 2026-09-12
   without asking. It is relocatable (its config uses `$CFGDIR`). Move it
   into the project as `tools/emsdk` (add `tools/` to `.gitignore`) or
   delete it (CI installs its own; reinstalling is `git clone
   https://github.com/emscripten-core/emsdk && ./emsdk install 6.0.9 &&
   ./emsdk activate 6.0.9`). The user has not said which.
4. ~~**No GitHub release yet**~~ — v0.1.0, v0.2.0 and v0.2.1 released; see
   "Publishing a release".
5. ~~**Bluehost is slow**~~ — deployed to the fast droplet (eschatolog.ist);
   Bluehost has since been discontinued and jmckalex.org points at the
   droplet too. See "The website".
6. **One unexplained hang**: one of five API runs of the 1181-page manual
   hung at 0 % CPU after the TeX phase (Node, in-process). Never reproduced.
7. ~~**Fresh-machine build untested since LuaTeX**~~ — resolved: CI now
   builds all four engines from a clean checkout on Ubuntu each run
   (`libs/lua53`, `pplib`, `zziplib` are configured explicitly by
   `scripts/native-common.sh`).
8. ~~**No OpenType font loading**~~ — **done in session 9** (branch
   `opentype-fonts`, not yet merged): `fontspec`, `unicode-math` and
   host-supplied system fonts all work under LuaTeX through luaotfload, in the
   opt-in `opentype` / `otf-fonts` bundles. No engine change was needed — the
   wasm LuaTeX had compiled `luafontloader` and `luafflib` all along.
   **Session 10** extended it to plain LuaTeX (`patches/texmf/0001`) and to
   every class size (the whole Latin Modern family in `opentype`). Still
   out: HarfBuzz shaping (`mode=harf`), because this is `luatex`, not
   `luahbtex`. See "What happened in session 9", "What happened in session
   10" and `docs/14` §15.
9. **pplib's licence** is not stated in the vendored source; NOTICE.md
   calls it permissive on the strength of its upstream README.
10. **Artifact viewer quirks** (claude.ai only): a fresh ~8 MB page can take
    up to a minute to render; Emscripten glue must be `<script
    type="module">`; blob Workers need a `locateFile`. The console warnings
    seen there come from the viewer, not the pages.
11. **Manual viewer not deployed.** `npm run build:manual` builds the whole
    1181-page viewer into `build/manual-viewer/` (294 MB); it is served nowhere.
    It would suit the droplet at `eschatolog.ist/software/mp-tikz-wasm/manual/`
    (rsync it under the same webroot). The staging build re-renders the title
    page from the DVI, so it needs `build/stress/pgfmanual/native/` present
    (produced by `scripts/stress-pgfmanual.mjs`).
12. **Thirty-day JS cache on the droplet** (session 6): a returning visitor
    can run last month's `auto.js` against the new `tags.html` until a hard
    reload; harmless, but it hides the saved-figure speed-up from them. Fix
    with a version query on the loader `src` or a shorter `max-age` for
    `dist/*.js` in nginx. See "The website". The same problem one level
    down — bundle files served with a long `max-age` — bit Clew in session
    10, and the manifest's per-file `sha` in the file URL is the fix for
    both. **Half done in session 12:** bundle file URLs now carry `?v=<sha>`
    and manifests/hot lists are fetched with `cache: 'no-cache'` (after ph341
    hit a stale font map; see session 12 item 10). `dist/*.js` and the engines
    are still unversioned.
13. **Saved-figure caveats, documented rather than solved** (session 6): a
    MetaPost element with several `beginfig` blocks saves the several
    `<svg>` roots it injects, joined by newlines — exact for the tags, not a
    valid single SVG file; and `--prerender` never deletes orphaned
    `figure-*.svg` files when a diagram changes.
14. ~~**Plain LuaTeX traps on any math**~~ — **fixed in session 8**; the
    diagnosis in the original report was off. The trap was not "any math"
    and not the `dviluatex` format: it was **every DVI rule** (`\hrule`,
    `\vrule`, leaders, `\sqrt`, `\over`, `\overline`, `\underline`) under
    **both** LuaTeX formats, from a call-arity mismatch through LuaTeX's
    unprototyped back-end function pointer that only WebAssembly enforces.
    `patches/luatex/0001`, `docs/14` §14, "What happened in session 8". The
    original reproducer, now expected to pass:

    ```js
    import { MetaPost } from './dist/index.js';
    const mp = await MetaPost.create({ logLevel: 'silent' });
    await mp.latex('x $\\sqrt{2}$\n\\bye', { engine: 'luatex' });   // ok, 1 page (threw before)
    await mp.latex('x\\par\\hrule\\par y\n\\bye', { engine: 'luatex' });   // ok (threw before, no maths involved)
    ```

    Clew worked around it by running its ```` ```tex ```` fence on `plain`
    (e-TeX) and flipped back to `luatex` once it pinned 0.2.1 (confirmed in
    session 10).
15. **LuaTeX format dumps are not reproducible** (session 8). Two
    consecutive `npm run build:formats` runs give different
    `dviluatex.fmt` / `dvilualatex.fmt` bytes (the other four formats are
    byte-identical run to run): decompressed, the only difference is the
    order of the `\hyphenation` exception words, which LuaTeX keeps in a Lua
    table and walks at dump time, and Lua 5.3 seeds its string hash from the
    clock. Same exceptions, same behaviour — the goldens pass with any dump —
    but the `luatex` bundle's bytes, hence a release archive's digest, cannot
    be reproduced from source. `build/texmf/web2c` was restored to the bundle
    copies after the check, so a later `build:bundles` repacks the same
    bytes. A fix would sort the exceptions on dump or seed Lua
    deterministically; not worth a patch today.
16. ~~**`npm run build:bundles` deletes `dist/bundles/hot.json`**~~ — **fixed
    after the 0.3.0 release**: build-bundles keeps the file (dropping entries no
    bundle carries any more), and CI now generates the hot lists, so its
    prefetch tests run instead of skipping.
17. ~~**luaotfload opens every bundled face on a fresh engine**~~ — **fixed
    in session 11** by the prebuilt name database (85fe86f; "What happened in
    session 11", item 1). A face looked up by a name the database does not
    know still makes luaotfload rescan every face in the loaded bundles, once
    per engine — the old cost, now only on that path.
18. ~~**CI will not find the Latin Modern OpenType faces on Ubuntu**~~ —
    **fixed in session 10** before the branch was ever pushed, so the
    failure was never seen. `build-texmf.sh` copied
    `fonts/opentype/public/{lm,lm-math}` from `$TEXMF` (`TEXMFDIST`) only,
    while Ubuntu's `fonts-lmodern` — a dependency of the `lmodern` CI
    installs — puts them under `/usr/share/texmf/fonts/opentype/public/`
    (its file list on packages.ubuntu.com, noble: `.../lm/lmroman10-
    regular.otf`, `.../lm-math/latinmodern-math.otf`), where session 4 had
    already found the Type 1 faces and switched to `tree_with`. The two
    OpenType directories now use the same search, with a warning when a
    family is absent. Unverified on a runner until the branch is pushed;
    verified here to reproduce the same tree and bundles byte for byte.

19. ~~**Script-tag pages may get no parallel prefetch**~~ — **fixed after the
    0.3.0 release**, confirmed in Chrome first: a page of one TikZ and one
    MetaPost script tag prefetched only the MetaPost files. Script requests are
    remembered as the tags are replaced; the page now prefetches both (287
    files) and its TikZ figure typesets in 1.5 s instead of 2.2 s locally.
20. ~~**`sanitizeSvg()` destroys shadings, patterns and woff2 text**~~ —
    **resolved in session 11 by deprecation** (the owner's decision). It is a
    regex allow-list, not a security boundary, and it dropped gradients,
    patterns, `<style>` (the woff2 faces) and shape geometry. It stays
    exported, unchanged, marked `@deprecated`, until 1.0. The README
    ("Untrusted sources") documents DOMPurify with `USE_PROFILES {svg,
    svgFilters}`, `ADD_TAGS ['use']` and non-`#` `<use>` removal, checked in
    Chrome: shadings, patterns, opacity, tikz-cd, MetaPost and woff2 figures
    lose nothing (the faces load), and TeX-injected `<script>`, `onerror`,
    `javascript:`, external `<use>` and `foreignObject` all go.
21. **`texmfDir` and bundles render one fontspec document differently**
    (session 11): same status, different SVG, seeded or not, so not the name
    database. Not investigated; the goldens run on bundles.
22. ~~**`docs/16` says `\setmainfont{Avenir Next}` by family name fails**~~ —
    **fixed in session 13** (branch `next`): it failed for every supplied
    face, not just `.ttc`. luaotfload left the working directory out of its
    index, so a name was retried as a file name. That found `Arial.ttf`
    for "Arial" but only the first face of `Optima.ttc`, and bold/italic fell
    back to regular. The bundled `luaotfload.conf` now sets `scan-local`
    (`docs/14` §15).
23. **A document can loop forever** — resolved as far as it should be, after
    the 0.3.0 release. Native LuaTeX hangs identically on the session-11
    trigger (checked: TeX Live 2025 final, lua-uni-algos removed, killed at
    30 s): TeX's 100-error limit counts only errors since the last paragraph,
    and a silent loop is ordinary TeX behaviour. What was ours: in Node the
    engines ran in-process, where a synchronous wasm loop cannot be stopped, so
    `timeoutMs` did nothing there. **`worker: true` now works in Node** (a
    `worker_threads` thread; bundles or `texmfDir`), and the watchdog stops it
    (checked: the runaway killed at 5 s, the process exits cleanly). The
    watchdog also counts engine output as progress. Node's default stays
    in-process. CI jobs and test steps have time limits, so a hang fails in
    minutes. Deliberately not done: making the CLI or `--prerender` use a
    worker by default. Small, pre-existing: after the watchdog kills the
    worker, the next call is not rejected at once but waits out its own
    `timeoutMs` (the dead worker never answers); the gallery works round it by
    creating a fresh engine. WorkerBackend could mark itself dead and reject.
24. **The owner's TeX Live 2025 is a May 2025 snapshot**; CI installs the
    final 2025 packages (~190 files differ, chemfig and pgf among them).
    Releases are built from the owner's tree. The TikZ golden passed on both
    in session 11, so it could become a real CI gate.

**Triage after 0.3.0 (the owner agreed):** loose ends 13 (multi-figure
MetaPost saved as one file), 15 (LuaTeX format dumps not reproducible), 21
(`texmfDir` vs bundles rendering) and the `.ttc` / `woff2` defect (dvisvgm's;
report it upstream, keep the one-file-per-face workaround) stay open until a
real need arrives. None affects a documented feature. *Session 13:* the `.ttc`
defect is fixed by `patches/dvisvgm/0001` (branch `dvisvgm-ttc`); reporting it
upstream remains.

## Where to look

- `README.md` — public-facing; also the prerequisites and the patch table.
- `docs/14-implementation-notes.md` — what was learned, per subsystem: §7
  TikZ pipeline, §8 tags and snapshot, §9 the PGF manual test, §10 LuaTeX,
  §11 the leaks (three patches), §12 logging, §13 saved figures, §14 LuaTeX
  rules in DVI mode, §15 OpenType fonts (the bundles, the font cache,
  host-supplied faces, the two `woff2` defects, plain LuaTeX and its patch).
- `docs/00-START-HERE.md` and `docs/01`–`docs/09` — the original design.
- `patches/` — twelve unified diffs, each explained in the code; seven are
  upstream bugs (0003, 0004, 0005, 0007, 0010, 0011, 0012) worth reporting
  to the MetaPost maintainers.
- `scripts/` — the pipeline; each script's header says what it does. Session
  4 added `native-common.sh` (per-package native configure, the CI fix) and
  `build-manual-viewer.mjs` (`npm run build:manual`); `site/manual.html` is
  the manual viewer page.
- `src/ts/logger.ts` — the levelled logger (session 5); `docs/08` §4 has the
  level table and the terminal-streaming mechanism.
- `src/ts/figures.ts`, `src/ts/prerender.ts` — saved figures (session 6):
  the hash, the page scan, the shared render call, the zip; the Node
  pre-renderer behind `mpost-wasm --prerender`. `docs/14` §13 has the
  design; `docs/08` §5.1 the user-facing account.
- `patches/luatex/` — the one LuaTeX patch (session 8), applied to copies by
  `scripts/build-luatex-wasm.sh`; `docs/14` §14 has the analysis.
- `patches/texmf/` — the one macro-package patch (session 10): the shipout
  hook `luaotfload.sty` needs under plain TeX, applied to the assembled tree
  by `scripts/build-texmf.sh`; `docs/14` §15 has the analysis, and golden
  `12-opentype-plain` is the proof.
- `patches/dvisvgm/` — the one dvisvgm patch (session 13): the face index in
  a native font's key, so a `.ttc`'s faces stay apart; applied by
  `scripts/build-dvisvgm-wasm.sh` to a copy of `src/` under
  `build/dvisvgm/patched`. `docs/14` §15 has the analysis; the collection
  case in `test/e2e/opentype.test.ts` is the proof.
- `test/e2e/opentype.test.ts`, `src/ts/bundles-config.ts`,
  `scripts/build-bundles.mjs` — OpenType fonts (sessions 9 and 10): the
  opt-in bundles, why they are opt-in, and why the whole Latin Modern family
  is in `opentype`. `docs/14` §15 has the design, `docs/08` §4.1 the
  user-facing account, the README a worked example including the
  host-supplied-face path and the plain-TeX spelling. Golden cases
  `11-opentype-fontspec` and `12-opentype-plain` are the byte-identical
  proofs against TeX Live.
- `docs/16-clew-integration.md` — the embedder's half of that, revised in
  session 10: what Clew (or any page using the drop-in tags) has to change,
  the `wrapTex` line for plain fences, the traps (the `.ttc` one bites a
  macOS app immediately; the plain-TeX one is fixed). Hand this to the
  consuming project.
- `test/leak/` — the native leak harness (README there).
- `~/Sites/jmckalex/CLAUDE.md` — the website's conventions (rsync
  Makefiles, the droplet, what never to upload).

## Published artifacts (private to the account, for viewing)

- Feature guide: https://claude.ai/code/artifact/e1a76b27-d84a-40ff-91e5-7a9612ee91cc
- Single-file playground: https://claude.ai/code/artifact/c33159fd-b8b9-4d6f-8699-d4a7f1252c01
- Two-editor page: https://claude.ai/code/artifact/bc4edab2-1332-4130-aa5f-9de7a3a38838
- Real-time graphics: https://claude.ai/code/artifact/9f220ce6-4791-4478-8197-d0645fce7785
- PGF manual page viewer (170-page sample; session 4): https://claude.ai/code/artifact/9d3a1aa7-354c-47ce-bfb6-b3f6921af370
- Gallery additions preview (the five new figures; session 4): https://claude.ai/code/artifact/9ea88d6a-68ef-4ed4-a2e6-36420c6133c1

These are session 3–4 builds; the website carries the current pages and is
what the README links to.

## Suggested next steps

Done in session 4: CI, the droplet, and the v0.1.0 release. Done in session
5: logging. Done in session 6: saved figures (browser and Node), the 0.2.0
release and the site sync. Done in session 7: spath3, the kept border, 0.2.1
built. Done in session 8: the LuaTeX rule fix, 0.2.1 released (by the owner)
and the site synced. Done in session 9: OpenType under LuaLaTeX, on a branch.
Done in session 10: OpenType under plain LuaTeX and at every class size,
same branch, verified by both Clew apps. Done in session 11: the prebuilt
name database, live custom elements, `data-replace`, `svg.attributes`, the
restyled pages, four more packages, CI on TeX Live 2025, **the 0.3.0 release**,
and three post-release fixes on the branch. Still open, in the order they are
worth doing:

- **Check the Clew re-pins.** Clew-app and Clew-iOS were sent the 0.3.0
  numbers (tag, URL, 44,229,933 bytes, sha256 4a3a61b3…); the manifests are
  theirs to update. Nothing to do here unless they report a problem.

- **Send Folio the 0.3.1 numbers** (it was not running at release).
  Palimpsest (PDFViewer) is pinned to v0.3.1 from the release asset (its
  commit 56f1546, branch m2; size and sha256 checked, provenance in its
  `vendor/mp-tikz-wasm/VERSION`); its LaTeX-note smoke test makes a native
  pdfTeX PDF with extractable text on the iPad simulator. It passes
  `engine: 'latex'` and ships without the `luatex` bundle. **Clew is on
  0.3.1** since 2026-10-06 (Clew-app cbfa692; Clew-iOS follows after its
  TestFlight push). Clew-boss schedules re-pins: tell it when a release
  exists.
- **CI before 2026-10-19:** pin `runs-on` to `ubuntu-24.04` (or test the
  TeX Live apt packages on Ubuntu 26 first) and move the actions off Node 20
  (session 13, item 1). Offered to the owner, not done.
- **Small hardening:** make the TikZ golden a CI gate (drop
  `continue-on-error`; loose end 24); a DOM test library (happy-dom) so the
  live elements and `data-replace` are tested automatically; WorkerBackend
  rejecting calls at once after a watchdog kill (loose end 23).
- **Version `dist/*.js` and the engines too** (the rest of loose end 12):
  bundle files carry `?v=<sha>` since session 12; the scripts and `.wasm`
  do not, so a returning visitor can still pair an old `auto.js` with new
  pages for up to 30 days on the droplet.
- **Arbitrary LaTeX from a local (or served) TeX Live.** The user asked about
  this; it is well within reach because the hard parts already exist — the
  `find_file` host hook (`mpwasm_host_find_file`, surfaced as the `onFindFile`
  option), a VFS that loads files **synchronously on first read** (sync
  `XMLHttpRequest` in the Web Worker, `fs.readFileSync` in Node; see
  `src/ts/vfs/lazyfs.ts`), an IndexedDB cache, and (Node) a real directory
  mounted with NODEFS in `installTexmf` (`src/ts/core.ts`). What is missing is
  only the *source*: today the resolver knows just the curated bundle
  manifest. To go arbitrary, feed it a full-tree index (`ls-R`, or a small
  `kpsewhich` endpoint) and add an on-miss fetch against a served TeX Live
  tree. **Quickest win — Node/CLI:** point `texmfDir` at the full local
  `texmf-dist` (+ `texmf-var` for formats) and widen the search paths; arbitrary
  packages read from disk synchronously, an afternoon of work. **Browser:** add
  the on-miss fetch in the worker path (main thread can't — no sync loader),
  cache in IndexedDB, serve the tree with CORS + `ls-R`; a few days. Caveat:
  no luaotfload, so `fontspec`/`unicode-math`/OpenType stay out, and fetching
  arbitrary/newer files breaks the byte-identical-to-TL2025 guarantee (fine for
  an explicit "arbitrary" mode).
- **Deploy the manual viewer** to `eschatolog.ist/software/mp-tikz-wasm/manual/`
  (loose end 11) — a compelling "browse the whole PGF manual in your browser"
  demo, and a good link for the TeX Live announcement.
- **Report upstream**: the seven mplib/psout bugs (patches 0003, 0004, 0005,
  0007, 0010, 0011, 0012) to the MetaPost maintainers — mentioned in the
  MacTeX-list announcement as forthcoming — and the luaotfload gap:
  `luaotfload.sty` advertises plain-TeX support but its DVI module needs a
  callback only LaTeX creates; `patches/texmf/0001` is the report and
  `docs/14` §15 the write-up. And dvisvgm's collection defect, to its author
  (Martin Gieseking, github.com/mgieseki/dvisvgm): `patches/dvisvgm/0001`
  applies to 3.6.1 with line offsets, and `uniqueName` has no other callers
  there (checked 2026-10-06). Needs the owner's go-ahead: it is posted under
  the owner's name.
- Smaller: automatic reruns for PDF output (cross-references, outlines;
  latexmk-style, driven by the "Rerun" warnings); `luamplib` for MetaPost inside LuaLaTeX; more packages
  (beamer, babel, siunitx and xstring — the last two are what circuitikz's
  `siunitx` option needs: one recipe line each in `scripts/build-texmf.sh`); persisting luaotfload's font cache across
  sessions (NODEFS in Node, IndexedDB in the browser); `mp.preload()` on the
  tags' `window.mpTikzWasm`; `~/emsdk` (loose end 3).

**The announcement.** v0.1.0 was announced to the MacTeX list (a wider TeX
Live announcement is planned once feedback settles). Expect bug reports and
questions; the `find_file`/bundle architecture and the fidelity claims
(byte-identical to TL 2025 on the golden corpora and the full PGF manual) are
the things people will probe.
