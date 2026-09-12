# 01 — Architecture

## 1. Module inventory

### 1.1 `mplib.wasm`

Everything that is synchronous and reentrant lives here.

| Object | From | Purpose |
| --- | --- | --- |
| `mp.o` | `mp.w` (1.2 MB CWEB) | The MetaPost interpreter. Fully instance-based: all state hangs off `struct MP_instance`. Reentrant. |
| `psout.o` | `psout.w` | PostScript/EPS backend **and** the Type 1 font machinery (`.pfb` parsing, charstring interpretation, subsetting, `psfonts.map` reading). The SVG backend depends on it. |
| `svgout.o` | `svgout.w` | SVG backend. Emits glyph outlines when `prologues=3`. |
| `tfmin.o` | `tfmin.w` | TFM metric reader. |
| `mpmath.o` | `mpmath.w` | `scaled` arithmetic (the original 32-bit fixed point). |
| `mpmathdouble.o` | `mpmathdouble.w` | IEEE double arithmetic. |
| `mpmathdecimal.o` | `mpmathdecimal.w` + `decNumber` | Arbitrary-precision decimal. Pure C, no external lib. |
| `mpxout.o` | `mpxout.w` | `mpto` (btex extraction) and `dvitomp` (DVI → MetaPost pictures). We use both, but never its `system()` path. |
| `mpstrings.o`, `avl.o` | — | String pool, AVL trees. |
| `mpwasm_*.o` | **ours** | Host shim: allocator, `find_file`, exported C API, the JSON figure backend, stubs for the unlinked optional libraries. |

Not included: `pngout.w` (needs cairo + pixman + libpng), `mpmathbinary.w`
and `mpmathinterval.w` (need GMP/MPFR/MPFI). Each is stubbed; see
`docs/02-upstream-and-patches.md` §4.

**Expected size:** ~1.1 MB of native object code measured during scoping;
budget 1.3–1.8 MB `.wasm`, 400–600 KB gzipped. See `docs/10`.

### 1.2 `tex.wasm`

pdfTeX from TeX Live's `texk/web2c/pdftexdir`, built in DVI mode. One binary
serves three roles, selected by format file:

| Role | Format | Used for |
| --- | --- | --- |
| `tex` | `plain.fmt` | default `btex` engine, matches upstream MetaPost's `TEX=tex` |
| `etex` | `etex.fmt` | e-TeX primitives without LaTeX |
| `latex` | `latex.fmt` | `mpost -tex=latex`, the common case in practice |

Why pdfTeX and not plain `tex`: TeX Live no longer ships a separate `etex`
binary, LaTeX 2e refuses to load without e-TeX, and `l3backend-dvips` (pulled
in by every modern LaTeX run) expects pdfTeX primitives. Verified: `pdftex -ini
-etex '\pdfoutput=0 \input latex.ltx \dump'` builds a 3.6 MB `latex.fmt` that
produces DVI. See `docs/13` §7.

`tex.wasm` is instantiated **fresh for every invocation**. web2c TeX is a
single-instance program full of file-scope globals and `longjmp`-based exits;
re-running it in a dirty address space is a category of bug we refuse to own.
Instantiation of a ~2 MB module costs single-digit milliseconds once the module
is compiled and cached (`WebAssembly.Module` is cached; only `Instance` is new).

### 1.3 `mppng.wasm` (phase 3, optional)

Either cairo + pixman + libpng compiled to wasm to light up
`outputformat:="png"`, or `resvg`-wasm to rasterise our SVG. Decide at M9 on
measured size; the second is smaller and does not require patching MetaPost.

## 2. Process and thread model

Everything runs in a **Web Worker** (browser) or on the main thread (Node,
where the distinction does not exist).

This is not an optimisation, it is load-bearing:

* **Synchronous lazy loading.** `find_file` and `fopen` are synchronous C. In a
  worker we can satisfy a miss with a synchronous `XMLHttpRequest`, or with
  `Atomics.wait` against a fetch driven from the main thread. On the main
  thread neither is available.
* **Watchdog.** `forever: endfor` is legal MetaPost. A runaway run is killed by
  `worker.terminate()`. There is no other way to interrupt wasm.
* **UI.** A 200 ms compile should not drop a frame.
* **`runscript`.** An opt-in synchronous callback into user JavaScript on the
  main thread, over `SharedArrayBuffer` + `Atomics`.

Consequences to design around: `SharedArrayBuffer` requires cross-origin
isolation (COOP/COEP headers). Provide a documented fallback that works without
it — async-only `runscript`, and asset preloading instead of lazy fetch. Do not
make the happy path depend on headers the user may not control.

## 3. The lifecycle of one compilation

```
run(source, options)
  │
  ├─ 1. PREPARE
  │     • create/reuse VFS, ensure the bundle manifest is loaded
  │     • write `source` to /work/job.mp
  │     • resolve `input`-ed files transitively, fetch them into the VFS
  │
  ├─ 2. SCAN                                        [docs/05 §3]
  │     • lexically extract verbatimtex/btex blocks from job.mp and from
  │       every reachable input file, in source order
  │     • compute a cache key per snippet: H(engine, fmt, preamble-chain,
  │       snippet, texscriptmode)
  │     • partition into hits and misses
  │
  ├─ 3. TYPESET (skipped entirely when there are no snippets)
  │     • build one .tex containing the \mpxshipout prologue, the interleaved
  │       verbatimtex blocks, and every missed btex block
  │     • instantiate tex.wasm, run it, collect the DVI (N pages)
  │     • call mpx_run_dvitomp() inside mplib.wasm → N chunks split on
  │       `mpxbreak`
  │     • store chunks under their keys
  │
  ├─ 4. RUN                                          [docs/04]
  │     • mp_options(): extensions=1, noninteractive=1, nonstop,
  │       mem_name="plain", fixed random_seed, our callbacks
  │     • mp_initialize()
  │     • mp_execute(mp, "input job")   <- ONE LINE; the document itself was
  │                                        written to /work/job.mp in step 1.
  │                                        docs/04 section 2b explains why.
  │         make_text callback → synchronous cache lookup
  │         run_script callback → user JS bridge (if enabled)
  │         find_file callback  → VFS path search
  │     • collect mp_rundata(mp)->edges (a linked list of mp_edge_object)
  │
  ├─ 5. FIXPOINT
  │     • if any make_text call missed the cache, goto 3 with the newly
  │       discovered snippets (max 5 iterations, then error)
  │
  ├─ 6. RENDER                                       [docs/07]
  │     • for each edge object, call the requested backend
  │       (mp_svg_ship_out / mp_ps_ship_out / our JSON walker)
  │     • DRAIN run_data.ship_out after EACH figure — opening a new output
  │       resets the stream (verified, docs/13 §5)
  │
  └─ 7. FINISH
        • mp_finish(mp); free the instance
        • return { figures[], log, errors[], status }
```

### 3.1 Why the run is restarted rather than resumed

`mp_execute()` ends with `mp_final_cleanup()` + `mp_close_files_and_terminate()`,
so one `mp_execute` call *is* one complete job — it is not a REPL feed. This was
read directly from `mp.w` and is confirmed by the reference harness. Therefore:

* one `MP` instance per compilation;
* the fixpoint loop creates a new instance each iteration;
* startup cost = parsing `plain.mp` (~3 000 lines) every time. **Measure this at
  M1.** If it exceeds ~30 ms, the optimisation is a linear-memory snapshot taken
  after `plain.mp` has been read, not a mem-dump file — MetaPost 2.x removed
  `.mem` dumps entirely (`mem_name` now names a `.mp` *source* file to preload).

## 4. Data flow for figures

```
MetaPost `shipout`
   └─► mp_ship_out()
        └─► mp->shipout_backend(mp, h)
             │
             ├─ default in non-interactive mode: mplib_shipout_backend
             │    → mp_gr_export(mp, h) → mp_edge_object
             │    → appended to run_data.edges          ◄── WHAT WE USE
             │
             └─ (interactive default: writes PS/SVG/PNG to a file)
```

`mp_edge_object` (defined in the generated `mplibps.h`) is a linked list of
`mp_graphic_object`s: fill, stroked, text, start/stop clip, start/stop bounds,
special. Each carries doubles, not MetaPost `scaled` values, so it is directly
consumable by JavaScript. This is the anchor for:

* the JSON/typed-array backend (`docs/07` §5),
* hit testing and interactive editing in a host application,
* re-rendering at a different resolution without re-running MetaPost.

Backends are called *after* the run, on the collected list — so a single run can
produce SVG *and* JSON with no extra interpretation cost.

## 5. Error and log routing

In non-interactive mode mplib redirects five streams into memory
(`mp_run_data`): `term_out`, `term_in`, `log_out`, `error_out`, `ship_out`.
`mp_execute` resets all of them on entry, and opening a new shipout output frees
the previous `ship_out`. The orchestrator must therefore read `term_out` and
`log_out` after `mp_execute` returns, and `ship_out` after *each* backend call.

`mp_status(mp)` / the return of `mp_execute` gives the history value:
`mp_spotless(0)`, `mp_warning_issued(1)`, `mp_error_message_issued(2)`,
`mp_fatal_error_stop(3)`, `mp_system_error_stop(4)`. Map these onto the JS
result; anything ≥ 3 means the instance is dead and must not be reused.

Parse errors out of `term_out` into structured diagnostics (`{file, line,
column, message, help[]}`). Setting `file_line_error_style = 1` makes MetaPost
emit `file:line: message`, which is far easier to parse than the Knuthian
`! message` + context-line format — **but** it also forces `find_file` to be
consulted twice per open. Prefer parsing the Knuthian form; the format is
stable and documented in `mp.w`.
