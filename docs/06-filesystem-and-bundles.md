# 06 — Virtual filesystem, texmf bundles, lazy loading

## 1. The layout inside the VFS

```
/work/            job.mp, generated .tex, .dvi, .mpx, outputs   (writable)
/texmf/
  metapost/base/  plain.mp mpost.mp boxes.mp graph.mp format.mp sarith.mp ...
  fonts/tfm/      cmr10.tfm ... (flat or mirrored tree; see §3)
  fonts/type1/    cmr10.pfb ...
  fonts/map/      mpost.map  psfonts.map  texfonts.map
  tex/            latex.ltx, .sty, .cls, .clo, .def ...
  web2c/          texmf.cnf, latex.fmt, plain.fmt
  mptexpre.tex
/home/            user-mounted files (Node: NODEFS; browser: caller-supplied)
```

`find_file` searches a per-`ftype` ordered list of directories under `/texmf`,
plus `/work` and any caller-added roots.

## 2. `find_file` — the kpathsea replacement

```ts
const SEARCH: Record<MpFiletype, string[]> = {
  program:  ['.', '/work', '/texmf/metapost/base', '/texmf/metapost'],
  metrics:  ['/texmf/fonts/tfm'],
  font:     ['/texmf/fonts/type1'],
  fontmap:  ['/texmf/fonts/map'],
  encoding: ['/texmf/fonts/enc'],
  memfile:  ['/texmf/metapost/base'],
  text:     ['.', '/work', '/texmf'],
  postscript: ['/work'],   // output
  bitmap:     ['/work'],   // output
  log:        ['/work'],
};
```

Rules, in order:

1. If `fmode[0] !== 'r'`, return the path unchanged (resolved against `/work`
   if relative). Writing never searches.
2. If the path already exists, return it (this handles the
   already-resolved-path case — see `docs/04` §4).
3. If the name has no extension, append the default for the type
   (`.mp` for `program`, `.tfm` for `metrics`, …). MetaPost does some of this
   itself; match `kpathsea`'s behaviour, which is "try as given, then with the
   suffix".
4. Walk the search list; first hit wins. Recursive (`//`) subdirectory search
   for the font trees, because TeX Live's TFM tree is deep
   (`fonts/tfm/public/cm/cmr10.tfm`). Either flatten at bundle-build time
   (simpler, and what §3 recommends) or implement `//`.
5. Miss → try to lazily fetch from the bundle (§4.3). Still a miss → `NULL`.

Keep a negative cache: MetaPost probes for files that do not exist
(`mpost.map` in a minimal bundle), and a failed lazy fetch must not repeat.

## 3. Bundle format

A bundle is a **manifest + a content-addressed blob store**, not a tar.

```json
{
  "name": "@metapost-wasm/bundle-latex",
  "version": "2025.1",
  "texlive": "2025",
  "files": {
    "fonts/tfm/cmr10.tfm":  { "sha": "ab12…", "size": 1324 },
    "fonts/type1/cmr10.pfb":{ "sha": "cd34…", "size": 36364 },
    "tex/article.cls":      { "sha": "ef56…", "size": 20194 }
  },
  "aliases": { "cmr10": "fonts/tfm/cmr10.tfm" },
  "eager": ["metapost/base/plain.mp", "metapost/base/mpost.mp",
            "fonts/map/mpost.map"]
}
```

* **Flatten the font trees.** TeX Live nests TFMs under `public/cm/…`; nothing
  in MetaPost cares. Flattening kills the need for recursive search and shrinks
  the manifest. Detect and report collisions at bundle-build time.
* `eager` files are fetched with the manifest; everything else is on demand.
* Blobs are served by SHA, so two bundles that share `cmr10.tfm` share a cache
  entry, and a bundle update only re-fetches what changed.

### 3.1 Recommended bundles and measured sizes

Sizes measured against TeX Live 2025 during scoping.

| Bundle | Contents | Raw | gzip |
| --- | --- | --- | --- |
| `core` | `metapost/base/*` (plain, mpost, boxes, graph, format, sarith, …) | 124 KB | 31 KB |
| `cm-tfm` | all 75 Computer Modern TFMs | 300 KB | 51 KB |
| `cm-type1` | all 150 CM Type 1 `.pfb` | 2.7 MB | 2.1 MB |
| `tex-plain` | `plain.tex` + `plain.fmt` | ~1.0 MB | ~1.0 MB |
| `latex-core` | `latex.ltx`, `base/*`, `latex.fmt` | ~6.6 MB | ~6.5 MB |
| `latex-extra` | amsmath, amsfonts, graphicx, … on demand | — | — |

Two things to internalise:

* **Format files do not compress.** `latex.fmt` is 3 605 968 bytes and gzips to
  3 558 958 — web2c already zlib-compresses format dumps. Do not budget for
  compression you will not get.
* **Type 1 fonts dominate.** But a typical figure uses 5–9 fonts. Lazily loading
  `.pfb` files turns 2.1 MB into ~200–350 KB for a real document. Make lazy
  loading of `.pfb` the default and eager loading an opt-in for offline use.

## 4. Loading strategies

### 4.1 Eager (simple, offline, Node)

Fetch a `.tar.zst`/`.tar.gz` of the whole bundle, unpack into MEMFS at startup.
Right for Node, Electron, and any app that will run MetaPost more than a few
times. In Node, prefer mounting the host filesystem with NODEFS and skipping
the copy entirely.

### 4.2 Preloaded via Emscripten

`--preload-file` produces a `.data` blob loaded before `main`. Convenient, but
it welds assets to the wasm build. Use it only for the handful of files in
`eager`. Prefer §4.3.

### 4.3 Lazy, synchronous (the browser default)

`find_file` and `fopen` are synchronous C. In a **Web Worker** you can satisfy
a miss synchronously two ways:

1. **Synchronous XHR** (`new XMLHttpRequest(); xhr.open(..., false)`).
   Deprecated on the main thread, still fine in a worker. This is what
   `FS.createLazyFile` uses. Simplest; works with no special headers.
2. **`Atomics.wait` on a `SharedArrayBuffer`.** The worker posts a request to
   the main thread, blocks on `Atomics.wait`, the main thread `fetch`es and
   fills the buffer, then `Atomics.notify`. Faster and uses the normal fetch
   stack (HTTP/2, cache, service workers) — but requires cross-origin isolation
   (COOP/COEP).

Implement (2) with automatic fallback to (1) when `crossOriginIsolated` is
false. Never require headers the user may not control.

Both need an **IndexedDB** layer in front so a second run of the same document
does no network I/O at all. Key by SHA; store the bytes; an LRU over a
configurable budget.

### 4.4 Caller-supplied files

The API takes `files: Record<string, string | Uint8Array>` which are written
into `/work` before the run. That is how a user supplies their own `.mp`
library, an included data file for `readfrom`, or an EPS for `special`.

## 5. Bundle construction

`bundles/build-bundle.py` takes a recipe and a TeX Live installation and emits
the manifest + blobs.

```yaml
# bundles/recipes/latex-core.yml
texlive: 2025
include:
  - tex/latex/base/**            # .cls .clo .def .sty .ltx
  - tex/latex/l3backend/l3backend-dvips.def
  - tex/generic/**/*.tex
formats:
  - name: latex
    engine: pdftex
    ini: '\pdfoutput=0 \input latex.ltx \dump'
fonts:
  tfm: [cm, cmextra, amsfonts, latex-fonts]
  type1: [amsfonts/cm]
maps: [mpost.map, psfonts.map, texfonts.map]
```

Two build-time responsibilities beyond copying:

* **Build the format with `tex.wasm` itself**, not the host's TeX
  (`docs/03` §4.5).
* **Emit a `font → package` index** so a missing-font error can say *"cmbx12
  not in this bundle; it is in `cm`. Add `@metapost-wasm/bundle-cm-tfm`."*

### 5.1 Trimming `psfonts.map`

The TeX Live `psfonts.map` is 5.5 MB — larger than everything else combined —
and MetaPost reads it linearly. Generate a trimmed map containing only entries
for fonts present in the bundle. Keep the full one available as an opt-in for
users with exotic fonts.

Remember MetaPost looks for **`mpost.map`** first (`docs/04` §4). Emit that name.

## 6. Node specifics

* Mount the real filesystem: `FS.mount(NODEFS, {root: process.cwd()}, '/work')`.
  Then `input`, `readfrom`, `write … to` and EPS `special`s all behave like the
  real `mpost`.
* Respect `TEXMFHOME`/`TEXMFLOCAL`-style overrides via
  `MPWASM_TEXMF=/path/to/texmf`, appended to the search lists ahead of the
  bundle. This lets a user with a real TeX Live installation use it directly.
* If a real `kpsewhich` is on `PATH` and `options.useSystemKpathsea` is set,
  shell out to it for misses. Off by default (it is a subprocess), but it turns
  the CLI into a genuine drop-in for users with TeX Live installed.
