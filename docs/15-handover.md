# Handover

Written 2026-09-13 at the end of the build sessions. Everything below is
verified unless marked otherwise. Read this before `docs/14` if you are
picking the project up cold.

## What exists

Four engines compiled to WebAssembly — MetaPost 2.11 (`mplib.wasm`, 1.2 MB),
pdfTeX 1.40 in DVI mode (`tex.wasm`, 1.1 MB), LuaTeX 1.21 in DVI mode
(`luatex.wasm`, 4.2 MB, fetched on demand), dvisvgm 3.4.3 (`dvisvgm.wasm`,
2.6 MB) — behind one TypeScript library (`dist/index.js`), a Web Worker, a
CLI (`mpost-wasm`), drop-in HTML tags (`dist/auto.js`), ten lazily fetched
texmf bundles (56 MB on the server, per-file fetch), and five demo pages in
`site/`: the editor demo (`index.html`), the tags page, the feature guide,
the two-editor page (`minimal.html`) and the real-time graphics page
(`live.html`). `release/metapost-wasm-0.1.0.{tar.gz,zip}` is the prebuilt
distribution (`npm run package`).

Fidelity: MetaPost golden corpus 15/15 and TikZ corpus 8/8 byte-identical to
TeX Live 2025; the complete 1181-page PGF manual byte-identical in DVI and
page-identical after dvisvgm (`scripts/stress-pgfmanual.mjs`); the `mtrap`
half of MetaPost's trap test identical to native. 204 unit/e2e tests, a
46-check native contract harness.

## Build and test, from scratch

Prerequisites: C compiler, Node ≥ 20, Emscripten 6.0.9 (`.emsdk-version`;
this machine has it at `~/emsdk`, `export PATH=$HOME/emsdk/upstream/emscripten:$PATH`),
TeX Live 2025 at `/usr/local/texlive/2025` (oracle and source of bundled files).

```sh
./scripts/extract-vendor.sh && ./scripts/verify-pin.sh
make contract                    # native mplib + 46 checks
scripts/native-texlive.sh        # once: web2c pass for pdfTeX (Route B)
scripts/native-dvisvgm.sh        # once: dvisvgm config
scripts/native-luatex.sh         # once: native LuaTeX build, compile commands recorded
npm run build                    # all wasm, texmf, formats, bundles, TypeScript
npm test && npm run test:golden && npm run test:golden:tikz
npm run build:guide; npm run build:pages; npm run build:standalone
npm run package
```

`REPO_URL=https://github.com/<you>/metapost-wasm` on `build:guide` and
`build:pages` replaces the placeholder links. `GUIDE_URL` does the same for
the guide link in the single-file pages.

## Known issues, honestly

1. **Residual per-instance leak, ~1 KB.** Patches 0010/0011 took it from
   319 KB to about 1 KB per MetaPost instance (docs/14 §11 has the remaining
   sites with line numbers). A 200,000-frame soak in Node showed 0.8 KB of
   heap growth per frame and no errors: at 60 instances a second the wasm
   ceiling would be reached after some twelve hours. The live page's
   animation cards therefore recycle their engine every 30,000 frames
   (replacement created first, no frame lost; verified over 70,000 frames
   with two swaps). `test/e2e/memory.test.ts` guards the fix itself.
2. **One unexplained hang.** One of five API runs of the 1181-page manual
   hung at 0 % CPU after the TeX phase (Node, in-process). Never reproduced.
3. **CI unverified on Linux.** `.github/workflows/ci.yml` was extended
   (texlive-luatex, the luatex.wasm step) without a run; the apt package set
   for the URW and EC fonts is a guess.
4. **Fresh-machine build untested since LuaTeX.** `scripts/native-luatex.sh`
   relies on libraries (`libs/lua53`, `pplib`, `zziplib`) that the existing
   native configure happened to prepare in `vendor/native-build`.
5. **No OpenType font loading.** LuaTeX runs without luaotfload; `fontspec`,
   `unicode-math` and system fonts are out. Text uses the Type 1 fonts.
6. **Licence texts not vendored.** `LICENSE.md` links to the LGPL-3.0 and
   GPL-3.0 texts; copy them in before a release. pplib's licence is not
   stated in the vendored source.
7. **Artifact viewer quirks** (claude.ai only): a freshly published ~8 MB page
   can take up to a minute to render; Emscripten glue must be in
   `<script type="module">` (it uses `import.meta`); blob Workers need a
   `locateFile` so the glue does not resolve the wasm name against the blob
   URL.

## Where to look

- `docs/14-implementation-notes.md` — what was learned, section per subsystem:
  §7 TikZ pipeline, §8 tags and snapshot, §9 the PGF manual test, §10 LuaTeX,
  §11 the leak.
- `patches/` — eleven unified diffs against the vendored MetaPost sources,
  each explained in the code; `scripts/apply-patches.sh` applies them into
  `build/patched/`. Six are real upstream bugs (0003, 0004, 0005, 0007, 0010,
  0011) worth reporting to the MetaPost maintainers.
- `scripts/` — the whole pipeline; each script's header says what it does.
- `test/leak/` — the leak harnesses and how to run them (README there).

## Published artifacts (private to the account, for viewing)

- Feature guide: https://claude.ai/code/artifact/e1a76b27-d84a-40ff-91e5-7a9612ee91cc
- Single-file demo: https://claude.ai/code/artifact/c33159fd-b8b9-4d6f-8699-d4a7f1252c01
- Two-editor page: https://claude.ai/code/artifact/bc4edab2-1332-4130-aa5f-9de7a3a38838
- Real-time graphics: https://claude.ai/code/artifact/9f220ce6-4791-4478-8197-d0645fce7785

## Suggested next steps

PDF export through pdfTeX's PDF backend (already compiled in; two style files
and an option); `luamplib` for MetaPost inside LuaLaTeX; more packages
(beamer, babel, siunitx, circuitikz, chemfig — one recipe line each); a
Linux CI run; reporting the six upstream bugs.
