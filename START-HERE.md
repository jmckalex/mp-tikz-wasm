# START HERE

**You are implementing a WebAssembly port of MetaPost.** This file is the only
one you need to read first. It tells you what is already known, what is already
proven, what to read next, and what to do in your first hour.

> **Status (2026-09-12): the port is built.** `mplib.wasm`, `tex.wasm`, the
> bundles, the TypeScript API, the CLI, the demo site and the test suites all
> exist and pass; the golden corpus is byte-identical to native `mpost`. Start
> with [`README.md`](README.md) for how to build and run, and
> [`docs/14-implementation-notes.md`](docs/14-implementation-notes.md) for what
> was learned (including nine patches to upstream, four of them real bugs).
> The rest of this file is the original plan, kept because every design
> decision in it still holds.

This repository began as a plan plus a set of *verified* findings — every
architectural claim was tested against the real MetaPost sources before it was
written down, and `scripts/reproduce-scoping.sh` re-derives all of it in about
two minutes.

---

## 1. The job, in one paragraph

MetaPost is John Hobby's graphics language, maintained by Taco Hoekwater and
Luigi Scarso inside TeX Live as a reentrant C library called `mplib`. Compile
it to WebAssembly and wrap it in a TypeScript API so that a browser or Node
process can turn MetaPost source into SVG, EPS and structured figure data —
including `btex ... etex` blocks typeset by a real TeX or LaTeX engine. Target
feature parity with the `mpost` command-line program.

## 2. Do this first (one hour, before writing any code)

```sh
./scripts/reproduce-scoping.sh
```

It downloads `mplibdir` from TeX Live, tangles the CWEB, compiles every module
against bare libc, links the reference embedding in
`reference/host_shim_reference.c`, and runs a MetaPost program through it. You
need `curl`, a C compiler, `ctangle`, and a TeX Live installation (which also
serves as the test oracle).

When it finishes you will have seen, with your own eyes, the four facts the
whole plan rests on:

1. mplib tangles with `ctangle` alone — **no web2c, no Pascal, no autotools**.
2. It compiles against **libc and a 35-line shim**. No kpathsea, no cairo, no
   GMP/MPFR, no zlib or libpng.
3. The `MP_options` callback contract works: our `find_file` resolved
   `plain.mp`, our `make_text` intercepted `btex ... etex`, and the run handed
   back a structured figure.
4. `prologues:=3` makes MetaPost emit **real Type 1 glyph outlines** into SVG,
   with no TeX in the loop.

Then open `reference/samples/latex-math.prologues0.svg` and
`reference/samples/latex-math.prologues3.svg` side by side in a browser. The
difference between those two files is the difference between a toy and a
product.

## 3. What is already settled, so you do not re-litigate it

| Question | Answer | Where |
| --- | --- | --- |
| Which MetaPost API? | `mplib`, non-interactive mode. Write the source to the VFS and call `mp_execute(mp, "input job")` — it reads only one line. Figures come back as `mp_edge_object` | `docs/04` §2b |
| How does `btex` work without `system()`? | Extract snippets up front, batch-typeset in one TeX run, cache by content hash, serve synchronously through `make_text`, re-run to a fixpoint on a miss | `docs/05` |
| How many wasm modules? | Three: `mplib.wasm`, `tex.wasm` (pdfTeX, DVI mode), optional `mppng.wasm` | `docs/01` |
| Where does it run? | A Web Worker. Not optional — it is what makes synchronous lazy loading, the watchdog and `runscript` possible | `docs/01` §2 |
| What replaces kpathsea? | Our `find_file` callback plus the Emscripten filesystem | `docs/06` |
| How does text render? | `prologues:=3` → glyph outlines. Three tiers: no-TeX / plain TeX / LaTeX | `docs/07` |
| Which TeX engine? | pdfTeX in DVI mode — it *is* `tex`, `etex` and `latex` | `docs/03` §4 |
| What is the schedule risk? | Building `tex.wasm`, not MetaPost | `docs/12` R1 |

## 4. Reading order

1. **`docs/13-verified-findings.md`** — what was actually tested and what came
   back. Read this before anything else so you know fact from design.
2. `PLAN.md` — scope, non-negotiables, milestone summary.
3. `docs/01-architecture.md` — the three modules and the lifecycle of a run.
4. `docs/04-mplib-embedding.md` — the API and every callback contract. The
   items marked **CONTRACT** will crash you if you get them wrong.
5. `docs/05-tex-bridge.md` — the hard part. Read it twice.
6. Then the rest in order as each milestone needs them:
   `02-upstream-and-patches`, `03-build-toolchain`,
   `06-filesystem-and-bundles`, `07-fonts-and-output`, `08-javascript-api`,
   `09-testing`, `10-performance-size-security`, `11-milestones`, `12-risks`.

## 5. What is in `reference/`

Not prose — working material.

| Path | What it is |
| --- | --- |
| `host_shim_reference.c` | A **verified** minimal embedding of mplib. Compiled and run during scoping. Comments marked `CONTRACT` record behaviour established empirically. Port this into `test/contract/` as your first test. |
| `w2c-config-shim.h` | The 35-line header that replaces TeX Live's autoconf-generated `w2c/config.h`. Verified sufficient for every module. |
| `stubs/png.h`, `stubs/zlib.h` | Four-line stubs; `mp.w` includes these only for version strings. |
| `generated-headers/` | Tangler output you will want to read without tangling: `mplib.h` (the whole public API), `mplibps.h` (the `mp_edge_object` graphic-object structs your JSON backend walks), `mplibsvg.h`, `mpxout.h`, `tfmin.h`. |
| `mpx-samples/` | A real `.mp` → `.mpx` pair from TeX Live. The `.mpx` format is the contract between TeX and MetaPost; `docs/05` §4.1 dissects it. |
| `samples/` | Oracle-produced EPS and SVG for the same figure at `prologues` 0 and 3, plus a no-TeX tier-0 SVG. Your first golden files. See `samples/README.md`. |
| `api.d.ts` | The proposed public TypeScript API. This is the contract milestone M7 must meet. |

## 6. The traps

Collected so you do not lose a day to any of them. Full list in `docs/12` §3.

1. `MP_options.mem_name = NULL` **segfaults**. Set it to `"plain"`.
2. Non-interactive mode **silently replaces** your `open_file`,
   `read_ascii_file`, `write_*`, `close_file`, `eof_file`, `flush_file` and
   `shipout_backend`. Only `find_file`, `make_text`, `run_script`,
   `run_make_mpx` and `run_editor` survive.
3. `read_ascii_file` must return `malloc`ed memory — mplib frees it. A static
   buffer crashes.
4. `read_binary_file` fills *the caller's* buffer: `*data` is in, `*size` is in
   **and** out.
5. `run_data.ship_out` is freed when the next figure opens. Copy immediately
   after each backend call, never batch.
6. MetaPost looks for **`mpost.map`**, not `psfonts.map`.
7. `prologues:=3` is required for usable SVG text. Upstream defaults to 0.
8. `mp.w` declares the cairo/GMP version symbols `extern` — define them as C
   objects, not macros, or you get a syntax error.
9. `mplib.h` needs `integer64` from `w2c/config.h`. Include that first.
10. TeX format files are already zlib-compressed. `latex.fmt` is 3.6 MB and
    will not gzip.
11. `etex` in TeX Live 2025 **is** pdfTeX, and `-ini` does not imply e-TeX. You
    need an explicit `-etex` or LaTeX refuses to build a format.
12. `ctangle` writes its output to the current directory, so run it there.
13. `mp_execute()` ends the job (`mp_final_cleanup` + `mp_close_files_and_terminate`).
    One call is one complete program, not a REPL feed. One `MP` instance per
    compilation.
14. **`mp_execute()` reads exactly ONE line from its string.** A multi-line
    source dies with `*** (job aborted, no legal end found)`. Write the document
    to `/work/job.mp` and execute the one-line string `input job`. This is the
    single most important implementation detail in the repo — `docs/04` §2b.

## 7. Before you start: pin the source

Scoping was done against **TeX Live master (MetaPost 3.00-dev)**, because that
is what GitHub's mirror serves, with **TeX Live 2025 / MetaPost 2.11** as the
local oracle. Those differ. Your first real task is to pin to a released
tarball and re-verify:

```sh
curl -O https://ftp.tug.org/texlive/historic/2025/texlive-20250308-source.tar.xz
```

Then assert, in `scripts/verify-pin.sh` and in CI, that the pinned source still
has:

* `MP_options.extensions` and `MP_options.make_text` (the `btex` route depends
  on them; if absent, fall back to the classic `run_make_mpx` path in
  `docs/05` §7, which exists in every version);
* `mpx_run_dvitomp()` exported from `mpxout.h`;
* `mp_execute()` still terminating the job.

Record the tarball name and SHA-256 in `vendor/SOURCES.lock`. Every golden file
in the test suite is meaningful only relative to that pin.

## 8. The first milestone

**M0 — Foundations** (`docs/11`). Repo layout, pinned sources, native
`ctangle`, the `w2c` shim, and — the highest-value item — the **L0 contract
harness**: port `reference/host_shim_reference.c` into `test/contract/` and
assert every `CONTRACT` from `docs/04`. It runs in seconds, has no wasm in the
loop, and it is how you will find out that a TeX Live bump changed the API.

**Gate:** `make contract` passes and `verify-pin.sh` is green.

Start the `tex.wasm` build spike in parallel during M1, not later. It is the
one thing in this project whose cost is genuinely unknown.

## 9. Two principles to hold onto

**Fidelity beats cleverness.** MetaPost has exact, testable semantics and an
official conformance suite (`mptrap`). Every graphical expectation in the test
suite is generated by real `mpost`, never hand-written. Run `mptrap` from M1 and
watch it improve — do not defer it to the end.

**Keep the C output byte-identical to upstream.** Where MetaPost's own output
needs polish (the SVG backend does — `docs/07` §3.1), fix it in a TypeScript
post-pass, not by patching `svgout.w`. That is what lets you keep comparing
against the oracle.
