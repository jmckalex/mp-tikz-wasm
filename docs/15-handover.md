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
(`live.html`). `release/mp-tikz-wasm-0.1.0.{tar.gz,zip}` is the prebuilt
distribution (`npm run package`).

The project was renamed from `metapost-wasm` to `mp-tikz-wasm` on
2026-09-13 (the npm name was free that day). Deliberately unchanged: the
CLI is still `mpost-wasm` (it is the `mpost` drop-in), the C shim keeps its
`mpwasm_` prefix, and the working directory on the build machine is still
`~/Source/Metapost-WASM`.

Fidelity: MetaPost golden corpus 15/15 and TikZ corpus 8/8 byte-identical to
TeX Live 2025; the complete 1181-page PGF manual byte-identical in DVI and
page-identical after dvisvgm (`scripts/stress-pgfmanual.mjs`); the `mtrap`
half of MetaPost's trap test identical to native. 204 unit/e2e tests, a
46-check native contract harness. No per-instance memory leak: `leaks`
reports 0 bytes over 31 MetaPost instances and 200,000 consecutive jobs on
one wasm engine leave the allocator's bytes in use unchanged
(`scripts/soak-memory.mjs`; docs/14 §11 tells the story of patches
0010–0012).

## Build and test, from scratch

Prerequisites are listed in the README ("Building from source"): a C/C++
toolchain, Node ≥ 20, Emscripten 6.0.9 (`.emsdk-version`; on this machine at
`~/emsdk`, `export PATH=$HOME/emsdk/upstream/emscripten:$PATH`) and a full
TeX Live 2025 (the oracle for the tests and the source of the bundled files;
here at `/usr/local/texlive/2025`).

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

The pages link to <https://github.com/jmckalex/mp-tikz-wasm> (the default in
`build:guide` and `build:pages`; `REPO_URL` and `GUIDE_URL` override it).

## Publishing a release

```sh
npm run build && npm run build:guide && npm run build:pages && npm run build:standalone
npm run package                                   # release/mp-tikz-wasm-<version>.{tar.gz,zip}
git tag v<version> && git push origin main --tags
gh release create v<version> release/mp-tikz-wasm-<version>.tar.gz release/mp-tikz-wasm-<version>.zip \
  --title "mp-tikz-wasm <version>" --notes-file <notes>
```

The archives are what the guide's "Get it" section points users at; `dist/`
is not committed, so a clone alone has no wasm. Bump `version` in
`package.json` first (the archive name and the guide take it from there).

## Known issues, honestly

1. **One unexplained hang.** One of five API runs of the 1181-page manual
   hung at 0 % CPU after the TeX phase (Node, in-process). Never reproduced.
2. **CI unverified on Linux.** `.github/workflows/ci.yml` was extended
   (texlive-luatex, the luatex.wasm step) without a run; the apt package set
   for the URW and EC fonts is a guess.
3. **Fresh-machine build untested since LuaTeX.** `scripts/native-luatex.sh`
   relies on libraries (`libs/lua53`, `pplib`, `zziplib`) that the existing
   native configure happened to prepare in `vendor/native-build`.
4. **No OpenType font loading.** LuaTeX runs without luaotfload; `fontspec`,
   `unicode-math` and system fonts are out. Text uses the Type 1 fonts.
5. **pplib's licence** is not stated in the vendored TeX Live source; NOTICE.md
   describes it as permissive on the strength of its README upstream.
6. **Artifact viewer quirks (claude.ai only): a freshly published ~8 MB page
   can take up to a minute to render; Emscripten glue must be in
   `<script type="module">` (it uses `import.meta`); blob Workers need a
   `locateFile` so the glue does not resolve the wasm name against the blob
   URL.

## Where to look

- `docs/14-implementation-notes.md` — what was learned, section per subsystem:
  §7 TikZ pipeline, §8 tags and snapshot, §9 the PGF manual test, §10 LuaTeX,
  §11 the leak.
- `patches/` — twelve unified diffs against the vendored MetaPost sources,
  each explained in the code; `scripts/apply-patches.sh` applies them into
  `build/patched/`. Seven are real upstream bugs (0003, 0004, 0005, 0007,
  0010, 0011, 0012) worth reporting to the MetaPost maintainers.
- `scripts/` — the whole pipeline; each script's header says what it does.
- `test/leak/` — the native leak harness and how to run it (README there);
  `scripts/soak-memory.mjs` is the wasm-side soak.

## Published artifacts (private to the account, for viewing)

- Feature guide: https://claude.ai/code/artifact/e1a76b27-d84a-40ff-91e5-7a9612ee91cc
- Single-file demo: https://claude.ai/code/artifact/c33159fd-b8b9-4d6f-8699-d4a7f1252c01
- Two-editor page: https://claude.ai/code/artifact/bc4edab2-1332-4130-aa5f-9de7a3a38838
- Real-time graphics: https://claude.ai/code/artifact/9f220ce6-4791-4478-8197-d0645fce7785

## Suggested next steps

PDF export through pdfTeX's PDF backend (already compiled in; two style files
and an option); `luamplib` for MetaPost inside LuaLaTeX; more packages
(beamer, babel, siunitx, circuitikz, chemfig — one recipe line each); a
Linux CI run; reporting the seven upstream bugs.
