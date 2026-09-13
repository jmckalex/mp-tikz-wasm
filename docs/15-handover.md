# Handover

Written 2026-09-13, end of the third session. Everything below is verified
unless marked otherwise. Read this before `docs/14` if you are picking the
project up cold. The repository is `~/Source/mp-tikz-wasm`, remote
<https://github.com/jmckalex/mp-tikz-wasm> (`origin`, branch `main`).

## Where things stand, in one paragraph

The port is complete and released as a tree: four engines (MetaPost 2.11,
pdfTeX 1.40 and LuaTeX 1.21 in DVI mode, dvisvgm 3.4.3) compiled to
WebAssembly behind one TypeScript library, a Web Worker, the `mpost-wasm`
CLI, drop-in HTML tags, ten lazily fetched texmf bundles, five demo pages and
a feature guide. Output is byte-identical to TeX Live 2025 on both golden
corpora and the 1181-page PGF manual. 207 tests pass, the 46-check native
contract harness passes, there is no per-instance memory leak. The demos are
live at <https://jmckalex.org/software/mp-tikz-wasm/>. **Two things are open:
the GitHub Actions CI has never gone green (see "CI", the next task), and six
commits are on `main` but not yet pushed.**

## What happened this session (2026-09-13)

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

## CI — the next task

`.github/workflows/ci.yml` runs two jobs on every push: `native` (TeX Live
from apt, vendor download, `make contract`, `npm test`) and `wasm`
(Emscripten 6.0.9, every engine, texmf, formats, bundles, both golden
suites). Three runs so far, all red, each further than the last:

| Run | Failed at | Cause | State |
| --- | --- | --- | --- |
| 1 | vendor download | `ftp.math.utah.edu` unreachable from the runners | fixed and pushed: mirror fallback in `scripts/extract-vendor.sh` + `actions/cache` for the tarball |
| 2, native | `make contract` | `mp.c` compiled before `mpmath.w` was tangled: `GEN_H` listed four of twelve generated headers; and the vpath-based object rule cannot build on a clean tree under macOS make 3.81 either | **fixed locally (commit f822ff3), not pushed**; verified with a clean rebuild here |
| 2, wasm | `scripts/native-texlive.sh` | unknown: it died with "exit code 2" while building kpathsea or pdftex natively, and the make output went to a log file the runner does not show | **not yet diagnosed.** Commit 9f5eef2 makes the native scripts print the failing log's tail, so the next run shows the reason |

Do this first:

```sh
git push origin main                      # 6 commits; CI starts by itself
gh run list --limit 3                     # wait for the new run
gh run view <run-id> --json jobs --jq '.jobs[] | "\(.name): \(.conclusion) — " + ([.steps[] | select(.conclusion=="failure") | .name] | join(", "))'
gh api repos/jmckalex/mp-tikz-wasm/actions/jobs/<job-id>/logs > /tmp/job.log   # gh run view --log was empty for me
grep -n -i "error" /tmp/job.log | tail -30
```

Then fix what `native-texlive.sh` reports. Plausible suspects, none confirmed:
a library the TeX Live tree expects on Linux that the apt list lacks (the
list is texlive-* packages plus dvisvgm; it has no `-dev` packages, and
`--disable-all-pkgs` still configures `libs/`), or `make -j8` ordering in
`texk/kpathsea`. The same script has only ever run on this Mac. After the
wasm job, `native-luatex.sh` and the golden suites have also never run on
Linux and may need their own fixes. Expect two or three iterations. The
badge in the README goes green when a run passes.

## The website

The demos are served from Bluehost at
<https://jmckalex.org/software/mp-tikz-wasm/> (landing page, `site/guide.html`
and the five demo pages, `dist/`, licence files). The local copy is
`~/Sites/jmckalex/software/mp-tikz-wasm/`, generated, never edited by hand:

```sh
scripts/stage-site.sh ~/Sites/jmckalex/software/mp-tikz-wasm   # from the build outputs (or `make stage` there)
cd ~/Sites/jmckalex/software/mp-tikz-wasm && make sync ARGS=-n  # dry run, then
make sync                                                       # rsync --delete to /home3/jmckalex/public_html/software/mp-tikz-wasm
```

`stage-site.sh` also writes the `.htaccess` (MIME types for `.wasm`/`.mjs`,
gzip, and cache lifetimes: 30 days for `bundles/`, 1 day for the engines and
JavaScript) and a landing `index.html`. Bluehost occasionally closes SSH
after a burst of connections ("Connection closed by 162.241.218.115"); it
comes back within minutes.

Measured from here: 0.57 s to first byte on every request and 150–250 KB/s.
A cold first TikZ figure therefore waits ~12 s for the three engines (5 MB,
2.5 MB on the wire); graph drawing adds `luatex.wasm` (1.7 MB) and
`dvilualatex.fmt` (6.5 MB, does not compress), about 55 s. Second visits
render from the IndexedDB result cache in ~1.5 s. The fix is bandwidth, i.e.
hosting: the DigitalOcean droplet in `~/Sites/jmckalex/CLAUDE.md` answers in
~50 ms; the staged directory works unchanged there (nginx needs `.mjs` in its
MIME map, already done on `jmck-web`), and a `sync-droplet` target in the
Makefile would follow `simulations/Makefile` (`--chown=web:web`). Not done:
the user's decision.

`npm run pages` (`scripts/publish-pages.sh`) is the GitHub Pages alternative,
tested against a throwaway repository only.

## Build and test, from scratch

Prerequisites are in the README ("Building from source"): C/C++17 toolchain,
Node ≥ 20, Emscripten 6.0.9 (`.emsdk-version`; on this machine at
`~/emsdk` — see "Loose ends"), a full TeX Live 2025 (the oracle and the
source of the bundled files; here `/usr/local/texlive/2025`).

```sh
export PATH=$HOME/emsdk/upstream/emscripten:$PATH
./scripts/extract-vendor.sh && ./scripts/verify-pin.sh
make contract                    # native mplib + 46 checks
scripts/native-texlive.sh        # once: web2c pass for pdfTeX
scripts/native-dvisvgm.sh        # once: dvisvgm config
scripts/native-luatex.sh         # once: native LuaTeX build, compile commands recorded
npm run build                    # all wasm, texmf, formats, bundles, TypeScript, hot lists
npm test && npm run test:golden && npm run test:golden:tikz
npm run build:guide; npm run build:pages; npm run build:standalone
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

No release exists yet. The guide's "Get it" and the README point at the
releases page, and `dist/` is not committed, so until a release is uploaded
a visitor can only build from source. Bump `version` in `package.json` first.
`package.json` is `private: true`: nothing is on npm; remove that line if
you publish there. Then restage and sync the website.

## Loose ends, honestly

1. **CI red** — above.
2. **Six commits unpushed** (`git log origin/main..main`).
3. **`~/emsdk`** (1.8 GB) was installed there by the assistant on 2026-09-12
   without asking. It is relocatable (its config uses `$CFGDIR`). Move it
   into the project as `tools/emsdk` (add `tools/` to `.gitignore`) or
   delete it (CI installs its own; reinstalling is `git clone
   https://github.com/emscripten-core/emsdk && ./emsdk install 6.0.9 &&
   ./emsdk activate 6.0.9`). The user has not said which.
4. **No GitHub release yet** — above.
5. **Bluehost is slow** — above; move to the droplet when ready.
6. **One unexplained hang**: one of five API runs of the 1181-page manual
   hung at 0 % CPU after the TeX phase (Node, in-process). Never reproduced.
7. **Fresh-machine build untested since LuaTeX**: `scripts/native-luatex.sh`
   relies on libraries (`libs/lua53`, `pplib`, `zziplib`) that the native
   configure happened to prepare in `vendor/native-build`; CI will tell.
8. **No OpenType font loading**: LuaTeX runs without luaotfload; `fontspec`,
   `unicode-math` and system fonts are out. Text uses the Type 1 fonts.
9. **pplib's licence** is not stated in the vendored source; NOTICE.md
   calls it permissive on the strength of its upstream README.
10. **Artifact viewer quirks** (claude.ai only): a fresh ~8 MB page can take
    up to a minute to render; Emscripten glue must be `<script
    type="module">`; blob Workers need a `locateFile`. The console warnings
    seen there come from the viewer, not the pages.

## Where to look

- `README.md` — public-facing; also the prerequisites and the patch table.
- `docs/14-implementation-notes.md` — what was learned, per subsystem: §7
  TikZ pipeline, §8 tags and snapshot, §9 the PGF manual test, §10 LuaTeX,
  §11 the leaks (three patches).
- `docs/00-START-HERE.md` and `docs/01`–`docs/09` — the original design.
- `patches/` — twelve unified diffs, each explained in the code; seven are
  upstream bugs (0003, 0004, 0005, 0007, 0010, 0011, 0012) worth reporting
  to the MetaPost maintainers.
- `scripts/` — the pipeline; each script's header says what it does.
  `stage-site.sh`, `publish-pages.sh`, `make-hotlists.mjs`, `soak-memory.mjs`
  and `highlight.mjs` are this session's.
- `test/leak/` — the native leak harness (README there).
- `~/Sites/jmckalex/CLAUDE.md` — the website's conventions (rsync
  Makefiles, the droplet, what never to upload).

## Published artifacts (private to the account, for viewing)

- Feature guide: https://claude.ai/code/artifact/e1a76b27-d84a-40ff-91e5-7a9612ee91cc
- Single-file playground: https://claude.ai/code/artifact/c33159fd-b8b9-4d6f-8699-d4a7f1252c01
- Two-editor page: https://claude.ai/code/artifact/bc4edab2-1332-4130-aa5f-9de7a3a38838
- Real-time graphics: https://claude.ai/code/artifact/9f220ce6-4791-4478-8197-d0645fce7785

The website copies are the same pages and are what the README links to.

## Suggested next steps, after CI

A GitHub release; the droplet; PDF export through pdfTeX's PDF backend
(compiled in; two style files and an option); `luamplib` for MetaPost inside
LuaLaTeX; more packages (beamer, babel, siunitx, circuitikz, chemfig: one
recipe line each in `scripts/build-texmf.sh`); reporting the seven upstream
bugs.
