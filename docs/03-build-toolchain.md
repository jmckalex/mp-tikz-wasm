# 03 — Build toolchain

## 1. Prerequisites

What the build as implemented actually uses (the README's "Building from
source" section has the install commands):

| Tool | Version | Used for |
| --- | --- | --- |
| Emscripten SDK | 6.0.9, pinned in `.emsdk-version` | every `.wasm`; `emcc` on PATH is enough, `emsdk_env.sh` is not needed |
| Node + npm | ≥ 20 (22 in CI, 23 on the build machine) | build scripts, formats, bundles, tests |
| C and C++17 compilers, `make`, `patch` | any recent | `ctangle`, the native mplib and the contract harness, the native web2c pass for pdfTeX, the native LuaTeX build whose compile commands are replayed with `emcc`, dvisvgm's configure |
| `curl`, xz-capable `tar`, `shasum` | | `scripts/extract-vendor.sh` fetches and verifies the pinned TeX Live source |
| `python3` | 3.x | `scripts/native-luatex.sh` parses the native build log into compile commands |
| `zip`, `gzip` | | release archives, size measurements |
| TeX Live | 2025, full | the **oracle** (`mpost`, `latex`, `dvilualatex`, `dvisvgm`) and, through `kpsewhich`, the source of every macro package and font copied into the bundles. `makeindex` only for the PGF-manual stress test. CI installs the Debian packages listed in `.github/workflows/ci.yml`. |

Not used: CMake, Ninja, autoconf/automake (TeX Live's tarball ships its
`configure` scripts).

## 2. Repository layout

```
mp-tikz-wasm/
├── vendor/
│   ├── SOURCES.lock            # tarball names + SHA-256
│   └── texlive-source/         # sparse checkout (submodule or script-populated)
├── patches/                    # 00NN-*.patch, applied in order
├── native/                     # host tools built during the build
│   └── CMakeLists.txt          #   ctangle, tangle, web2c, tangleboot
├── src/
│   ├── c/
│   │   ├── mpwasm_api.c        # the exported C surface (see docs/04 §6)
│   │   ├── mpwasm_api.h
│   │   ├── mpwasm_host.c       # xmalloc family, find_file, version stubs
│   │   ├── mpwasm_text.c       # make_text / run_script trampolines to JS
│   │   ├── mpwasm_figure.c     # JSON / typed-array figure backend
│   │   ├── mpwasm_mpx.c        # mpto + dvitomp entry points
│   │   └── include/w2c/config.h
│   ├── ts/
│   │   ├── index.ts            # public API, main-thread side
│   │   ├── worker.ts           # the worker entry point
│   │   ├── engine.ts           # mplib.wasm lifecycle
│   │   ├── tex/
│   │   │   ├── bridge.ts       # the TeX Bridge orchestration
│   │   │   ├── scanner.ts      # btex/verbatimtex/input lexical scan
│   │   │   ├── tex-engine.ts   # tex.wasm lifecycle
│   │   │   └── cache.ts        # content-addressed snippet cache
│   │   ├── vfs/
│   │   │   ├── vfs.ts          # Emscripten FS wrapper
│   │   │   ├── bundle.ts       # manifest + lazy fetch
│   │   │   └── kpse.ts         # the find_file path-search engine
│   │   ├── render/
│   │   │   ├── svg.ts  ps.ts  json.ts  png.ts
│   │   └── diagnostics.ts      # MetaPost log → structured errors
│   └── cli/mpost.ts
├── bundles/
│   ├── recipes/                # which texmf files go in which bundle
│   └── build-bundle.py
├── build/
│   ├── CMakeLists.txt
│   └── emscripten.cmake
├── test/
│   ├── contract/               # native harness, docs/09 §2
│   ├── golden/                 # oracle-generated expectations
│   ├── conformance/mptrap/
│   └── e2e/
├── examples/
└── docs/
```

## 3. Building `mplib.wasm`

### 3.1 Stage 1 — native host tools

```cmake
# native/CMakeLists.txt, configured with the HOST compiler
add_executable(ctangle
  ${VENDOR}/texk/web2c/cwebdir/ctangle.c
  ${VENDOR}/texk/web2c/cwebdir/common.c)
target_compile_definitions(ctangle PRIVATE ... )
```

Use CMake's `ExternalProject` or a superbuild so the native tools are built with
the host toolchain while the rest uses the Emscripten toolchain file. Do **not**
try to build both in one CMake configure.

### 3.2 Stage 2 — tangle

```
for f in mp psout svgout tfmin mpxout mpmath mpmathdouble mpmathdecimal mpstrings; do
  ctangle vendor/.../mplibdir/$f.w   # writes build/gen/$f.c and its headers
done
```

Add a CMake custom command per file with the `.w` as dependency so incremental
builds work. Tangling all nine takes under a second.

### 3.3 Stage 3 — compile and link

```
emcc -O3 -flto \
  build/gen/{mp,psout,svgout,tfmin,mpxout,mpmath,mpmathdouble,mpmathdecimal,mpstrings}.c \
  vendor/.../mplibdir/{avl,decNumber,decContext}.c \
  src/c/mpwasm_{api,host,text,figure,mpx}.c \
  -Isrc/c/include -Ibuild/gen -Ivendor/.../mplibdir \
  -o dist/mplib.mjs \
  -sMODULARIZE=1 -sEXPORT_ES6=1 -sENVIRONMENT=web,worker,node \
  -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=33554432 -sMAXIMUM_MEMORY=2147483648 \
  -sSTACK_SIZE=1048576 \
  -sFILESYSTEM=1 -sFORCE_FILESYSTEM=1 \
  -sEXPORTED_FUNCTIONS=@src/c/exports.json \
  -sEXPORTED_RUNTIME_METHODS=ccall,cwrap,FS,stringToNewUTF8,UTF8ToString,HEAPU8,HEAPF64 \
  -sALLOW_TABLE_GROWTH=1 \
  --js-library src/c/mpwasm_library.js \
  -sERROR_ON_UNDEFINED_SYMBOLS=1
```

Notes on the flags that matter:

* `-sERROR_ON_UNDEFINED_SYMBOLS=1` is deliberate. Undefined symbols must be a
  build failure, not a runtime trap (see `docs/02` §5.3).
* `-sALLOW_MEMORY_GROWTH=1` — MetaPost's memory is dynamic and unbounded by
  design (`mp_reallocate_*`). `MAXIMUM_MEMORY` is the real guard; pair it with
  the watchdog in `docs/10` §4.
* `-sSTACK_SIZE`: `mp.c` recurses in the path solver and in `mp_print_exp`.
  1 MB is a starting guess — raise if `mptrap` overflows, and add a stack-
  overflow test to the corpus.
* `-flto` gave a meaningful size win on similar codebases; measure both ways.
* Build a `-O0 -g -sASSERTIONS=2 -sSAFE_HEAP=1` debug variant too and run the
  conformance suite against it at least nightly. MetaPost does pointer
  arithmetic on its own node arena; `SAFE_HEAP` will catch shim mistakes that
  `-O3` silently tolerates.

### 3.4 Exported C functions

Keep the list in `src/c/exports.json` so it is reviewable. At minimum:
`_mpwasm_new`, `_mpwasm_run`, `_mpwasm_figure_count`, `_mpwasm_figure_svg`,
`_mpwasm_figure_ps`, `_mpwasm_figure_json`, `_mpwasm_log`, `_mpwasm_free`,
`_mpwasm_mpto`, `_mpwasm_dvitomp`, `_mpwasm_version`, `_malloc`, `_free`.
(See `docs/04` §6 for the signatures.)

## 4. Building `tex.wasm`

This is the long pole. Budget real time for it.

### 4.1 Why it is harder than mplib

web2c programs are Pascal WEB translated to C by tools that themselves must be
built and *run* on the host, and the resulting C expects kpathsea, `texmf.cnf`,
and a `tex.pool` string pool. The chain is:

```
tangle.web ──(bootstrap tangle.c)──► tangle ──► tex.p + tex.pool
tex.p ──(web2c + fixwrites + splitup)──► texini.c tex0.c … tex9.c texcoerce.h
+ texmfmp.c + kpathsea ──(emcc)──► tex.wasm
```

TeX Live's build already knows how to do all of this. The question is only how
to make the final compile use `emcc`.

### 4.2 Two routes

**Route A — TeX Live's autotools under `emconfigure` (recommended).**

```sh
# 1. native pass: build the host tools TeX Live needs
mkdir build-native && cd build-native
../vendor/texlive-source/configure --disable-all-pkgs \
    --enable-web2c --enable-pdftex --without-x --disable-shared
make -C texk/web2c tangle web2c ...       # produces the translators
cd ..

# 2. cross pass
mkdir build-wasm && cd build-wasm
emconfigure ../vendor/texlive-source/configure \
    --host=wasm32-unknown-emscripten --build=$(../vendor/.../config.guess) \
    --disable-all-pkgs --enable-web2c --enable-pdftex --disable-shared \
    --disable-largefile --without-x \
    --with-banner-add=/mp-tikz-wasm \
    ac_cv_func_mmap_fixed_mapped=no
emmake make -C texk/web2c pdftex
```

The cross pass will try to *run* `tangle`, `web2c`, `pdftex -ini` etc. Point it
at the native ones (`TANGLEBOOT`, `WEB2C`, `TANGLE` make variables, or simply
put `build-native/texk/web2c` first on `PATH`). Expect to iterate on
`ac_cv_*` cache variables; keep them in `scripts/tex-wasm-configure.cache` so
the build is reproducible.

**Route B — hand-rolled CMake over the pre-translated C.** Run the native pass
once, snapshot the generated `tex0.c … tex9.c`, `texcoerce.h`, `texd.h` and
`tex.pool` into `vendor/gen-tex/`, commit them, and compile those with a
CMakeLists you control. Loses the ability to re-translate when the pin moves;
gains an enormously simpler build. **Take Route B if Route A costs more than
two days**, and write a `scripts/regen-tex-c.sh` that reproduces the snapshot.

### 4.3 kpathsea for `tex.wasm`

Unlike mplib, web2c TeX *is* welded to kpathsea. Compile kpathsea to wasm — it
is portable C and works against the Emscripten FS — and drive it with a
generated `texmf.cnf` pointing at `/texmf` inside the VFS. Set
`TEXMFCNF=/texmf/web2c`, `SELFAUTOLOC`, and friends via `ENV` before `main()`.

Disable at configure time: `--disable-ipc` (no sockets), and make sure
`\write18` is off (`shell_escape=f` in `texmf.cnf`, plus the `--disable-...`
guard and a runtime assert).

### 4.4 Invocation

Emscripten `main()` with `argv`. One instance per run:

```ts
const mod = await TexModule({ arguments: ['-interaction=nonstopmode',
                                          '-fmt=latex', '/work/mpx.tex'],
                              preRun: [mountVfs] });
```

Collect the exit code, `/work/mpx.dvi`, and `/work/mpx.log`.

### 4.5 Format files

`latex.fmt` is engine-, version- and endianness-specific. **Generate it with
the wasm engine itself**, at build time, under Node:

```sh
node scripts/make-format.mjs latex   # runs tex.wasm -ini -etex '\input latex.ltx \dump'
```

This guarantees the format matches the engine byte-for-byte and removes any
dependency on the host's TeX Live at runtime. Verified sizes (TL2025):
`plain.fmt` ≈ 0.9 MB, `latex.fmt` ≈ 3.6 MB. Note that TeX format files are
already zlib-compressed internally — they do **not** shrink further over the
wire (3.6 MB → 3.56 MB gzipped). Budget accordingly (`docs/10`).

Ship formats as separate lazily-fetched assets, never in the wasm module.

## 5. Reproducibility

* `SOURCE_DATE_EPOCH` for anything that embeds a timestamp.
* Pin emsdk, Node, CMake and TeX Live versions in CI and in `SOURCES.lock`.
* `scripts/verify-reproducible.sh` builds twice in different directories and
  diffs the `.wasm`. Emscripten is deterministic if you avoid absolute paths;
  use `-ffile-prefix-map`.

## 6. Packaging

Publish one npm package with subpath exports:

```json
{
  "name": "mp-tikz-wasm",
  "exports": {
    ".":            { "import": "./dist/index.mjs",  "require": "./dist/index.cjs", "types": "./dist/index.d.ts" },
    "./worker":     "./dist/worker.mjs",
    "./mplib.wasm": "./dist/mplib.wasm",
    "./tex.wasm":   "./dist/tex.wasm"
  },
  "bin": { "mpost-wasm": "./dist/cli.mjs" }
}
```

Bundles (texmf assets) go in **separate** packages —
`@mp-tikz-wasm/bundle-core`, `-plain`, `-latex`, `-cm-fonts` — so a user who
only draws geometry never downloads a 3.6 MB format file. See `docs/06` §4.
