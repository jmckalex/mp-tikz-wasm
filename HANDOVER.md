# Handover

Written 2026-09-13 (third session), revised 2026-09-15 (fourth and fifth
sessions) and 2026-09-16 (sixth). This file lives at the repository root;
until session 5 it was `docs/15-handover.md`. Everything below is verified
unless marked otherwise.
Read this before `docs/14` if you are picking the project up cold. The
repository is `~/Source/mp-tikz-wasm`, remote
<https://github.com/jmckalex/mp-tikz-wasm> (`origin`, branch `main`).

**State at the end of session 6 (2026-09-16):** everything is committed,
pushed and released; the working tree is clean. The last code commit is
6408c66 ("Release 0.2.0"), preceded by c99d1ac (saved figures) and e0a8be9
(logging); the commits after it only touch this file. **CI is green** on all
of them (runs 35109363657, 35113186940, 35113237374, 35113576643).
**v0.2.0 is released** on GitHub with both archives — the tarball's sha256
verified against the local build, and a clean extraction of it renders
through the Node API and pre-renders the tags page byte-identically to the
shipped figures — and the website is restaged and synced to both hosts with
the new pages and `site/figures/` (see "The website" for a cache caveat).

**State at the end of session 7 (2026-09-16, evening):** three commits on
top of 7081a15, **none tagged, pushed or released**, working tree clean:
a2a9795 (spath3 bundled, so `\usetikzlibrary{calligraphy}` and `knots`
work — the library is part of spath3, which pgf does not ship), adbd53b
(a wrapped TikZ figure's SVG is the standalone page, border included:
`renderFigure` passes `--bbox=papersize` for the bodies it wraps, because
TikZ leaves its classic arrow tips — `>=latex`, `stealth` — out of the
bounding box and the tight crop cut them off; `DB_VERSION` 3 drops the old
crops; found through Clew), and aac75ff (Release 0.2.1: version, guide, the
tags page's four TikZ saved figures re-rendered with `--force`; the engines
are unchanged). 244 tests, both golden corpora byte-identical.
`release/mp-tikz-wasm-0.2.1.{tar.gz,zip}` are built from aac75ff (tar.gz
37,203,244 bytes, sha256
2c3035392f77cdf0efe36eaa878b3f792d4ac66546ed3ad9f6a2655da0f25302) and
`release/notes-0.2.1.md` holds the notes. To publish, from "Publishing a
release": `git tag v0.2.1 && git push origin main --tags && gh release
create v0.2.1 release/mp-tikz-wasm-0.2.1.tar.gz
release/mp-tikz-wasm-0.2.1.zip --title "mp-tikz-wasm 0.2.1" --notes-file
release/notes-0.2.1.md`. **Upload exactly those files**: Clew's
`src/shared/mptikz-manifest.json` is already pinned to that tarball's
digest, so a rebuilt archive means a re-pin there. CI has not run on these
commits. The website is NOT restaged: its tags page still serves the
tight-crop saved figures until `site/` is synced.

## Where things stand, in one paragraph

The port is complete and released as a tree: four engines (MetaPost 2.11,
pdfTeX 1.40 and LuaTeX 1.21 in DVI mode, dvisvgm 3.4.3) compiled to
WebAssembly behind one TypeScript library, a Web Worker, the `mpost-wasm`
CLI, drop-in HTML tags, ten lazily fetched texmf bundles, five demo pages and
a feature guide. Output is byte-identical to TeX Live 2025 on both golden
corpora and the 1181-page PGF manual. 241 tests pass, the 48-check native
contract harness passes, there is no per-instance memory leak. Session 5
added levelled logging to the console (`logLevel`, six levels, MetaPost's
terminal streamed live; see "What happened in session 5"). Session 6 added
saved figures: a page can carry its diagrams as `figures/figure-HASH.svg`
files, written by `mpost-wasm --prerender` or `mpTikzWasm.saveFigures()`,
and the tags load them instead of starting the engines (see "What happened
in session 6"). The demos are live on the fast DigitalOcean droplet at
<https://eschatolog.ist/software/mp-tikz-wasm/> and mirrored (more slowly) on
Bluehost at <https://jmckalex.org/software/mp-tikz-wasm/>. **CI is green** and
**v0.2.0 is released** (v0.1.0 on 2026-09-13, v0.2.0 on 2026-09-16). Session
4 also added five MetaPost gallery figures, an in-browser page-by-page viewer
for the whole PGF manual, and fixed the upside-down brace in the guide's tree
figure (see "What happened in session 4").

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

## CI — green as of 2026-09-16 (session 6; first green in session 4)

`.github/workflows/ci.yml` runs two jobs on every push, both green:

- **native** (ubuntu-latest): apt TeX Live as the oracle, the pinned vendor
  tree, `make contract` (the 48-check harness since session 5), and the unit
  tests (`npx vitest run test/unit`).
- **wasm** (ubuntu-latest, Emscripten 6.0.9): builds all four engines
  (`mplib`, `tex`, `dvisvgm`, `luatex`), the texmf tree, formats and
  bundles, the TypeScript, then the e2e tests (`test/e2e`: API, memory,
  prefetch, logging, prerender) and the **MetaPost** golden `--check`.

Latest green run: <https://github.com/jmckalex/mp-tikz-wasm/actions/runs/35113237374>
(the 0.2.0 release commit 6408c66; a tag push starts a second run of the
same commit). First green run: 34769341698 (commit c24dbb3, session 4). The
README badge is green.

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

**The TikZ/LaTeX golden (`node scripts/golden-tikz.mjs --check`) is a dev
gate, not on CI.** Its SVG output tracks the system pgf and font versions,
and the runner's `texlive-pictures` is Ubuntu's 2023 pgf, not TeX Live
2025's; `03-shading-clip` differed by a fraction of a point in its bounding
box for that reason (the MetaPost golden, reproducible from the pinned mplib
and Computer Modern, passes on the runner). Run `npm run test:golden:tikz`
(no `--check`) on a TeX Live 2025 machine to regenerate `tikz-expected/`
before committing, then `--check` locally. The CI e2e step exercises the
LaTeX/TikZ pipeline for behaviour.

To watch a run:

```sh
gh run list --limit 3
gh run view <run-id> --json jobs --jq '.jobs[] | "\(.name): \(.conclusion) — " + ([.steps[] | select(.conclusion=="failure") | .name] | join(", "))'
gh api repos/jmckalex/mp-tikz-wasm/actions/jobs/<job-id>/logs > /tmp/job.log   # gh run view --log was empty
grep -n -i "error" /tmp/job.log | tail -30
```

## The website

The demos are served from **two** hosts, both from the local staging copy
`~/Sites/jmckalex/software/mp-tikz-wasm/` (generated by `stage-site.sh`, never
edited by hand except its `Makefile` and `exclude`):

```sh
cd ~/Source/mp-tikz-wasm && npm run build:standalone   # if site/examples.js changed
scripts/stage-site.sh ~/Sites/jmckalex/software/mp-tikz-wasm   # or `make stage` there
cd ~/Sites/jmckalex/software/mp-tikz-wasm
make sync-eschatolog ARGS=-n && make sync-eschatolog   # droplet (fast); dry-run first
make sync           ARGS=-n && make sync               # Bluehost (slow)
make sync-all                                          # both
```

- **eschatolog.ist (fast, ~50 ms)** is the DigitalOcean droplet `jmck-web`
  (139.59.191.156; ssh alias `jmck-web`, root, key `~/.ssh/digitalocean_trocp`).
  Its nginx server block shares the webroot `/var/www/jmckalex` with the
  default block; content lands in `/var/www/jmckalex/software/mp-tikz-wasm`.
  **No nginx change was needed:** the config already types `.wasm`
  (`application/wasm`) and `.mjs` (`text/javascript`) and caches assets 30 d,
  denies `Makefile`/dotfiles, and its basic auth is currently commented out so
  `/software/` is public. Sync needs `--chown=web:web --chmod=D755,F644` (the
  `sync-eschatolog` target does this). nginx ignores `.htaccess`.
- **jmckalex.org (slow, ~570 ms TTFB)** is Bluehost, the original host, kept as
  a mirror. `stage-site.sh` writes its `.htaccess` (MIME + gzip + cache).
  Bluehost occasionally refuses SSH after a burst ("Connection closed by
  162.241.218.115"); it recovers within minutes — retry.

`~/Sites/jmckalex/CLAUDE.md` is the authoritative deployment reference (the
two droplets, the migration, what never to upload).

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

Cold-load cost on Bluehost (measured): a first TikZ figure waits ~12 s for the
three engines, and graph drawing (adds `luatex.wasm` 1.7 MB + `dvilualatex.fmt`
6.5 MB, does not compress) ~55 s; second visits render from the IndexedDB
result cache in ~1.5 s. On the droplet these are a few seconds — the
slow-server problem is why the droplet deployment happened.

## Build and test, from scratch

Prerequisites are in the README ("Building from source"): C/C++17 toolchain,
Node ≥ 20, Emscripten 6.0.9 (`.emsdk-version`; on this machine at
`~/emsdk` — see "Loose ends"), a full TeX Live 2025 (the oracle and the
source of the bundled files; here `/usr/local/texlive/2025`).

```sh
export PATH=$HOME/emsdk/upstream/emscripten:$PATH
./scripts/extract-vendor.sh && ./scripts/verify-pin.sh
make contract                    # native mplib + 48 checks
scripts/native-texlive.sh        # once: web2c pass for pdfTeX
scripts/native-dvisvgm.sh        # once: dvisvgm config
scripts/native-luatex.sh         # once: native LuaTeX build, compile commands recorded
npm run build                    # all wasm, texmf, formats, bundles, TypeScript, hot lists
npm test && npm run test:golden && npm run test:golden:tikz
npm run build:guide; npm run build:pages; npm run build:standalone
node dist/cli.js --prerender site/tags.html   # site/figures/ (committed; only if the tags page changed)
npm run package
```

`make contract` and `make wasm` now work on a clean tree (the Makefile lists
every generated header and no longer relies on a vpath).

## Publishing a release

```sh
npm run build && npm run build:guide && npm run build:pages && npm run build:standalone
npm run package                                   # release/mp-tikz-wasm-<version>.{tar.gz,zip}
git tag v<version> && git push origin main --tags
gh release create v<version> release/mp-tikz-wasm-<version>.tar.gz release/mp-tikz-wasm-<version>.zip \
  --title "mp-tikz-wasm <version>" --notes-file <notes>
```

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
and sync the website (`make sync-all`) after a release.

## Loose ends, honestly

1. ~~**CI red**~~ — fixed 2026-09-13 (session 4); see "CI" above. Green.
2. ~~**Six commits unpushed**~~ — pushed; `main` is clean.
3. **`~/emsdk`** (1.8 GB) was installed there by the assistant on 2026-09-12
   without asking. It is relocatable (its config uses `$CFGDIR`). Move it
   into the project as `tools/emsdk` (add `tools/` to `.gitignore`) or
   delete it (CI installs its own; reinstalling is `git clone
   https://github.com/emscripten-core/emsdk && ./emsdk install 6.0.9 &&
   ./emsdk activate 6.0.9`). The user has not said which.
4. ~~**No GitHub release yet**~~ — v0.1.0 and v0.2.0 released; see
   "Publishing a release".
5. ~~**Bluehost is slow**~~ — deployed to the fast droplet (eschatolog.ist);
   Bluehost kept as a mirror. See "The website".
6. **One unexplained hang**: one of five API runs of the 1181-page manual
   hung at 0 % CPU after the TeX phase (Node, in-process). Never reproduced.
7. ~~**Fresh-machine build untested since LuaTeX**~~ — resolved: CI now
   builds all four engines from a clean checkout on Ubuntu each run
   (`libs/lua53`, `pplib`, `zziplib` are configured explicitly by
   `scripts/native-common.sh`).
8. **No OpenType font loading**: LuaTeX runs without luaotfload; `fontspec`,
   `unicode-math` and system fonts are out. Text uses the Type 1 fonts.
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
    `dist/*.js` in nginx. See "The website".
13. **Saved-figure caveats, documented rather than solved** (session 6): a
    MetaPost element with several `beginfig` blocks saves the several
    `<svg>` roots it injects, joined by newlines — exact for the tags, not a
    valid single SVG file; and `--prerender` never deletes orphaned
    `figure-*.svg` files when a diagram changes.

## Where to look

- `README.md` — public-facing; also the prerequisites and the patch table.
- `docs/14-implementation-notes.md` — what was learned, per subsystem: §7
  TikZ pipeline, §8 tags and snapshot, §9 the PGF manual test, §10 LuaTeX,
  §11 the leaks (three patches), §12 logging, §13 saved figures.
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
release and the site sync. Still open:

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
- **Report the seven upstream mplib/psout bugs** (patches 0003, 0004, 0005,
  0007, 0010, 0011, 0012) to the MetaPost maintainers — mentioned in the
  MacTeX-list announcement as forthcoming.
- Smaller: PDF export through pdfTeX's PDF backend (compiled in; two style
  files and an option); `luamplib` for MetaPost inside LuaLaTeX; more packages
  (beamer, babel, siunitx, circuitikz, chemfig: one recipe line each in
  `scripts/build-texmf.sh`); cache-busting for `dist/*.js` on the droplet
  (loose end 12).

**The announcement.** v0.1.0 was announced to the MacTeX list (a wider TeX
Live announcement is planned once feedback settles). Expect bug reports and
questions; the `find_file`/bundle architecture and the fidelity claims
(byte-identical to TL 2025 on the golden corpora and the full PGF manual) are
the things people will probe.
