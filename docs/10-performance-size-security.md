# 10 — Performance, size, security

## 1. Size budget

Measured inputs: the native object files for the full mplib set totalled
1 051 488 bytes during scoping (`-O1`, arm64). Use that as the anchor.

| Artefact | Target raw | Target gzip | Notes |
| --- | --- | --- | --- |
| `mplib.wasm` | ≤ 1.8 MB | ≤ 600 KB | `-O3 -flto`, no cairo/GMP |
| `mplib.mjs` glue | ≤ 120 KB | ≤ 30 KB | |
| `tex.wasm` | ≤ 3.0 MB | ≤ 1.0 MB | pdfTeX + kpathsea |
| bundle `core` | 124 KB | 31 KB | verified |
| bundle `cm-tfm` | 300 KB | 51 KB | verified |
| bundle `cm-type1` | 2.7 MB | 2.1 MB | verified; lazy per font |
| `plain.fmt` | ~0.9 MB | ~0.9 MB | verified: formats do not compress |
| `latex.fmt` | 3.6 MB | 3.56 MB | verified |

**Tier-0 first load** (geometry + `label`, no TeX): ~700 KB gzipped. That is
the number to advertise and to defend. Tier 2 (LaTeX) is ~7 MB on first use and
~0 thereafter thanks to IndexedDB; make the staging visible in the API
(`mp.preload(['latex'])`) so applications can warm it deliberately.

### 1.1 Levers if you miss budget

* Drop the `decimal` number system from the default build (decNumber is ~65 KB
  of object code) and ship it as a separate `mplib-decimal.wasm`.
* Build a `mplib-nosvg.wasm` / `mplib-nops.wasm`? **No** — `svgout` depends on
  `psout` for the Type 1 machinery. They ship together.
* `-Oz` instead of `-O3` for the SVG-only variant; measure the runtime cost.
* Strip `mp_show_library_versions` and the troff paths.
* `wasm-opt -Oz --strip-debug --strip-producers` as a post-pass.

## 2. Performance

### 2.1 Where the time goes

1. **Module instantiation.** Compile once (`WebAssembly.Module` is cacheable and
   structured-cloneable), instantiate per run. Cache the compiled module in the
   worker.
2. **`plain.mp` parsing, every run.** MetaPost 2.x has no binary mem dumps —
   `mem_name` names a `.mp` *source* file. ~3 000 lines get re-parsed for every
   compilation. **Measure at M1.** If it is over ~30 ms, the fix is a linear
   memory snapshot, not a format file: run `mp_initialize`, let the first
   `mp_execute` load the preamble, and… note that `mp_execute` also *ends* the
   job, so a snapshot must be taken from inside a patched hook. Treat this as a
   real but deferred optimisation; do not design around it before measuring.
3. **TeX.** Dominated by format loading (3.6 MB of `latex.fmt`) plus the actual
   typesetting. Batching (`docs/05` §4) means one format load per document
   rather than one per label — this is the single biggest win in the design.
4. **Rendering.** Linear in objects. The SVG post-pass (numeric compaction) is
   not free; make it optional for hot paths.

### 2.2 Targets

| Scenario | Target |
| --- | --- |
| cold start, tier 0 | < 400 ms |
| warm compile, 200-line geometry figure | < 60 ms |
| warm compile, 40 `btex` blocks, cold cache | < 1.5 s |
| the same, warm cache | < 120 ms |
| live editor keystroke → preview | < 150 ms p95 |

For a live editor, also implement **debounced incremental compilation**: the
snippet cache means only genuinely changed labels re-typeset, and MetaPost
itself is fast enough to re-run wholesale.

### 2.3 Multiple documents

`MetaPost.create()` owns one worker. For a batch job (a site generator
compiling 500 figures) expose `MetaPostPool({ size: navigator.hardwareConcurrency })`
sharing one IndexedDB cache. Figures are independent; this is embarrassingly
parallel.

## 3. Security model

Treat MetaPost source as **untrusted input**. It is a Turing-complete language
that people will paste from the internet.

| Vector | Control |
| --- | --- |
| Arbitrary code execution | No `system()`, `popen()`, `fork()`, `execvp()` anywhere in `mplib.wasm`. Enforce with an `nm` check in CI (`docs/02` §5.3). |
| `runscript` → JS | **Off by default.** Only active if the caller passes `runScript`. Document loudly that enabling it hands the document author a JS callback. Never `eval` the returned string yourself. |
| `\write18` in TeX | `shell_escape=f` in the generated `texmf.cnf`, plus a runtime assert in `tex.wasm`. |
| Filesystem escape | `find_file` is the only resolver, and it only walks configured roots. Reject `..` segments and absolute paths outside the roots. In Node, `--texmf` roots are explicit. |
| Reading host files | Browser: MEMFS only, nothing to read. Node: NODEFS mount is explicitly scoped to the CWD; document it. |
| Infinite loop | Worker + `timeoutMs` + `worker.terminate()`. There is no in-wasm interrupt. |
| Memory exhaustion | `-sMAXIMUM_MEMORY`, `memoryLimitBytes`, and an allocation hook that aborts cleanly rather than growing forever. |
| Malicious binary input | `.tfm`, `.pfb`, `.dvi` parsers all read untrusted bytes. Fuzz them (`docs/09` §L5). This is the most likely place for a real memory-safety bug — and wasm contains it to the sandbox, which is a genuine advantage over native `mpost`. |
| Output injection | SVG output can contain arbitrary text from `special` and from label content. **Never `innerHTML` it without sanitising** — say so in the API docs and ship `result.figures[0].svgSafe` (DOMPurify-equivalent, or a strict allow-list serialiser built from the JSON backend). |

### 3.1 The `special` primitive

`special "…"` injects raw PostScript into the output, and
`withprescript`/`withpostscript` do the same per object. In SVG output these
land in the document. This is the intended MetaPost mechanism for advanced
effects (transparency, shading), so it cannot simply be disabled — but it is an
XSS vector if a host innerHTMLs the result. Provide `options.allowSpecial`
(default `true` for parity) and document the sanitising path.

## 4. Resource limits, concretely

```ts
{
  timeoutMs: 20_000,          // wall clock for the whole run
  texTimeoutMs: 15_000,       // per TeX invocation
  memoryLimitBytes: 512 * 1024 * 1024,
  maxTexRuns: 5,              // fixpoint cap
  maxFigures: 10_000,
  maxOutputBytes: 64 * 1024 * 1024,
}
```

All enforceable from the worker side except memory, which needs the
`MAXIMUM_MEMORY` link flag plus an `emscripten_resize_heap` hook that reports
rather than aborts silently.
