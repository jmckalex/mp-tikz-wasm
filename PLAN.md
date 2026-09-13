# mp-tikz-wasm — Master Plan

**Audience:** the engineer (human or model) implementing this. Read this file,
then `docs/13-verified-findings.md` (so you know what is established fact
versus what is design), then the numbered docs in order.

**Prime directive:** MetaPost is a 40-year-old program with exact, testable
semantics and an official conformance suite. *Fidelity beats cleverness.* When
a design choice trades correctness for convenience, take the correct one and
write the inconvenience down.

---

## 1. Goal

Ship `mp-tikz-wasm`: an npm package and a set of `.wasm` artifacts that let a
browser or Node process compile MetaPost source to vector graphics, with
feature parity against the `mpost` command-line program as shipped in TeX Live,
including `btex ... etex` typesetting via TeX and LaTeX.

### 1.1 In scope

* The complete MetaPost language as implemented by `mplib` (MetaPost 2.11 /
  3.00-dev), including `plain.mp`, `mpost.mp`, `boxes`, `graph`, `format`,
  `metafun`-compatible primitives where they exist in mplib, pens, dashes,
  clipping, bounds, colour models (grey/RGB/CMYK), `withprescript`/
  `withpostscript`, `special`, and TFM font generation.
* All five number systems: `scaled`, `double`, `decimal` (phase 1–2);
  `binary`, `interval` (phase 4, MPFR/MPFI).
* `btex ... etex`, `verbatimtex ... etex`, and the `maketext` primitive,
  driven by a real TeX engine, with plain TeX **and** LaTeX (arbitrary
  preambles and packages, subject to what is in the loaded texmf bundle).
* Output: SVG (with embedded glyph outlines), EPS/PostScript, a structured
  JSON/typed-array figure format for web-native rendering, TFM metrics, and
  PNG (phase 3).
* A `runscript` bridge to JavaScript (opt-in), and the `maketext` hook.
* A Node CLI that is a drop-in for `mpost` for the common flag set.
* Deterministic, reproducible output.

### 1.2 Out of scope (state these clearly in the README when shipping)

* Troff mode (`-troff`, `dmp`, `makempx -troff`). The code compiles; we do not
  ship the troff support files or test it. Leave the code paths in, mark
  unsupported.
* XeTeX and LuaTeX as the `btex` engine. `dvitomp` reads DVI, not XDV; LuaTeX
  embeds its own mplib and is a different product.
* PDF as a native MetaPost output format (MetaPost has never had one).
  `outputformat:="pdf"` does not exist upstream; offer SVG→PDF in JS instead.
* Interactive error recovery at a terminal prompt (`errorstopmode`). The
  library runs non-interactively; errors are reported, not prompted.

---

## 2. The shape of the solution

Three WebAssembly modules, one TypeScript orchestrator, one asset system.

```
                   ┌─────────────────────────────────────────────┐
                   │  @mp-tikz-wasm/core  (TypeScript, Worker)  │
                   │  ─────────────────────────────────────────  │
   source.mp  ───► │  1. scan for btex/verbatimtex + inputs      │
                   │  2. TeX Bridge: batch-typeset misses        │ ◄──┐
                   │  3. run MetaPost; serve snippets sync       │    │
                   │  4. render edges through a backend          │    │
                   └───┬──────────────────┬───────────────┬──────┘    │
                       │                  │               │           │
                  ┌────▼─────┐      ┌─────▼──────┐   ┌────▼────┐  ┌───┴────┐
                  │mplib.wasm│      │  tex.wasm  │   │vfs (FS) │  │ cache  │
                  │          │      │            │   │         │  │IndexedDB│
                  │ mp.c     │      │ pdftex,    │   │ MEMFS   │  │ or fs  │
                  │ psout.c  │      │ DVI mode   │   │ NODEFS  │  └────────┘
                  │ svgout.c │      │ kpathsea   │   │ lazy    │
                  │ mpxout.c │      │            │   │ fetch   │
                  │ tfmin.c  │      └────────────┘   └─────────┘
                  │ mpmath*  │
                  └──────────┘
```

* **`mplib.wasm`** — MetaPost itself plus its PostScript and SVG backends, the
  TFM reader, the maths backends, and `mpxout` (which contains both `mpto` and
  `dvitomp`). Synchronous. One instance per compilation.
* **`tex.wasm`** — pdfTeX in DVI mode, from TeX Live's web2c sources. Covers
  `tex`, `etex` and `latex` (all three are the same binary plus a format file).
  A fresh instance per invocation, because web2c TeX is not reentrant.
* **The orchestrator** runs in a Web Worker. That single decision buys
  synchronous lazy asset loading, a non-blocking UI, a killable watchdog, and
  the ability to make `runscript` synchronous via `Atomics.wait`.

---

## 3. The three hard problems, and the answers

### 3.1 `btex ... etex` needs a TeX engine mid-run

MetaPost's classic path shells out to `makempx` from inside the scanner. You
cannot `system()` from WebAssembly, and you cannot suspend a synchronous wasm
call to await an async one without JSPI or Asyncify — both of which are either
not universally available or impose a heavy cost on a 700 KB C translation unit.

**Answer:** don't call TeX from inside the run. Use mplib's `extensions=1`
mode, in which `btex ... etex` is routed to the `make_text` callback instead of
to the `.mpx` machinery. Extract every snippet lexically *before* the run,
typeset them all in **one** batched TeX job, convert the resulting multi-page
DVI with MetaPost's own `dvitomp`, split it on `mpxbreak`, and cache the chunks
by content hash. During the run, `make_text` is a synchronous hash lookup. On a
cache miss (a snippet produced dynamically, e.g. via `scantokens`) return
`nullpicture`, record the miss, and re-run to a fixpoint — exactly the way
LaTeX reruns for cross-references.

Full detail, including the classic `run_make_mpx` compatibility path, in
[`docs/05-tex-bridge.md`](docs/05-tex-bridge.md).

### 3.2 File lookup without kpathsea

**Answer:** mplib never links kpathsea. In non-interactive mode every file open
goes through `mplib_open_file`, which calls the user's `find_file` callback and
then `fopen`s the string it returns. So `find_file` *is* our kpathsea, and the
bytes come from the Emscripten filesystem. We implement a small path-search
engine over a manifest-described texmf bundle, with lazy per-file fetch backed
by IndexedDB. [`docs/06-filesystem-and-bundles.md`](docs/06-filesystem-and-bundles.md).

### 3.3 Text has to be drawable without a font server

**Answer:** MetaPost already solves this. With `prologues:=3` the SVG backend
reads the Type 1 `.pfb`, interprets the charstrings, and emits real glyph
outlines into `<defs>` with `<use>` references — verified, sample in
[`docs/13-verified-findings.md`](docs/13-verified-findings.md) §6. No web fonts,
no font-loading race, self-contained SVG. Ship the TFMs always and the PFBs
lazily. [`docs/07-fonts-and-output.md`](docs/07-fonts-and-output.md).

---

## 4. Milestone summary

| # | Milestone | Gate |
| --- | --- | --- |
| M0 | Repo, toolchain, vendored sources, native contract harness | `host_shim_reference.c` builds and runs natively in CI |
| M1 | `mplib.wasm` — geometry only, no text | `draw fullcircle scaled 100` → identical SVG to native `mpost` |
| M2 | VFS + bundle loader + `plain.mp` | `input graph; input boxes;` work in a browser |
| M3 | Non-TeX text: TFM metrics + Type 1 outlines | `label("x",origin)` byte-identical to native |
| M4 | `tex.wasm`: plain TeX, DVI out | `tex.wasm` reproduces a reference `.dvi` byte-for-byte |
| M5 | TeX Bridge, plain TeX `btex` | `reference/mpx-samples/*` round-trip |
| M6 | LaTeX: format building, packages, arbitrary preambles | amsmath sample renders identically to native |
| M7 | Full JS/TS API, CLI, JSON backend, `runscript` | API frozen, docs published |
| M8 | Conformance: `mptrap`, golden corpus, CI matrix | `mptrap` passes; corpus diff clean |
| M9 | Size/perf hardening, PNG, extra number systems | Budgets in `docs/10` met |

Detail and acceptance criteria in [`docs/11-milestones.md`](docs/11-milestones.md).

---

## 5. Non-negotiables

1. **No forked semantics.** Every patch to upstream source is a numbered,
   reviewable diff in `patches/`, with a comment saying why. If a patch changes
   behaviour rather than plumbing, it needs a test proving the behaviour is
   unchanged for every input that does not exercise the new path.
2. **Determinism by default.** Fix the random seed and the date/time internals
   unless the caller explicitly asks for wall-clock behaviour. Two runs of the
   same input must produce byte-identical output, and the TeX Bridge's fixpoint
   iteration *depends* on this.
3. **The native oracle.** Every graphical test compares against real `mpost`
   from TeX Live, not against a stored expectation someone typed. Golden files
   are generated by the oracle and regenerated when the pinned TeX Live moves.
4. **LGPL compliance.** MetaPost's own source is public domain, but the shipped
   binary includes LGPL-3+ code (`avl.c`) and ICU-licensed code (`decNumber`).
   The distributed `.wasm` is therefore LGPL-3+. Ship the licence, the source,
   and — because LGPL §4 requires relinking be possible — the object files or a
   reproducible build. Document this in the package README, not just a LICENSE
   file.
