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
