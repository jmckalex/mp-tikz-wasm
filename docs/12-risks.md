# 12 — Risks and open questions

## 1. Risk register

| # | Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| R1 | Building `tex.wasm` from TeX Live's autotools is a multi-week slog | High | High | Route B in `docs/03` §4.2: snapshot the web2c-generated C once and own a simple CMake build. Timebox Route A to two days. |
| R2 | The pinned TeX Live's mplib lacks `extensions`/`make_text` | Medium | High | Verify at M0 with `scripts/verify-pin.sh`. Fallback: the classic `run_make_mpx` path (`docs/05` §7), which exists in every version and needs no new API. |
| R3 | `mp_execute` semantics differ between 2.11 and 3.00 | Medium | Medium | The L0 contract harness asserts them. Pin, then test, then build. |
| R4 | `mptrap` fails due to wasm/x86 arithmetic differences | Medium | High | `scaled` mode is pure integer arithmetic — should be bit-exact. `double` mode uses IEEE 754, which wasm implements exactly; the risk is x87 80-bit intermediates on 32-bit x86 *hosts*, not wasm. Run `mptrap` early (M1), not at M8. |
| R5 | SVG output quality is worse than users expect | High | Medium | Known and scoped: `docs/07` §3.1. Post-process, do not patch the C. |
| R6 | Bundle size makes LaTeX impractical on mobile | Medium | Medium | Tiering, lazy loading, IndexedDB, and an honest size table in the README. Offer a remote-TeX `makeText` for constrained clients. |
| R7 | `SharedArrayBuffer`/COOP-COEP unavailable in the target deployment | High | Low | Sync-XHR fallback is the default path, not a degraded one. Test with isolation off in CI. |
| R8 | Memory-safety bug in `.tfm`/`.pfb`/`.dvi` parsing | Medium | Medium | Fuzz natively with ASan (`docs/09` §L5). Wasm sandboxing limits blast radius. |
| R9 | LGPL obligations mishandled | Low | High | `docs/02`; ship sources + a reproducible build; state it in the package README. |
| R10 | The fixpoint loop oscillates on a pathological input | Low | Low | Capped at 5, with an error naming the unresolved snippets. Determinism makes oscillation nearly impossible. |
| R11 | Emscripten FS performance with thousands of lazily-fetched files | Low | Medium | Flatten font trees, negative-cache misses, and keep the manifest in memory. |
| R12 | Upstream MetaPost 3.00 lands mid-project and changes the API | Medium | Medium | Pin hard. Track upstream in a branch, not on main. |

## 2. Open questions to resolve during implementation

**Q1 — Does the pinned MetaPost really terminate the job inside `mp_execute`?**
Read from `mp.w` on master; assert it in L0. If a 2.x version allows repeated
`mp_execute` calls, the fixpoint loop gets cheaper (no re-parse of `plain.mp`)
but nothing else changes.

**Q2 — How slow is re-parsing `plain.mp` per run?**
Measure at M1. Decides whether the memory-snapshot optimisation is worth
designing for. Do not pre-optimise.

**Q3 — Should the classic `.mpx` path be the default for the CLI?**
Arguments for: byte-identical behaviour with `mpost`, `mptrap` compatibility,
`.mpx` files land on disk where users expect them. Arguments against: two code
paths to maintain. Note the objection that "`extensions=0` cannot work with
string input" is void — the driver always writes a real file (`docs/04` §2b).
Recommendation: default `extensions=1` in the library, `extensions=0` in the
CLI, and test both.

**Q4 — JSPI instead of the fixpoint loop?**
When JSPI is universally available, `make_text` could `await` a TeX run
directly, removing the scan and the fixpoint entirely. That is a significantly
simpler design. Revisit at M9: if the numbers say Chrome + Node cover the
audience, ship a JSPI variant behind a flag and keep the batched path as the
compatible default. Note the batched path is still *faster* (one TeX run per
document versus one per snippet), so JSPI simplifies rather than accelerates.

**Q5 — Does `dvitomp` need virtual fonts (`.vf`)?**
It looks for them (`mpx_vf_format`). LaTeX with T1 encoding (`\usepackage[T1]{fontenc}`)
uses virtual fonts heavily. Test early with a T1 document; if `.vf` support
works, add `fonts/vf` to the bundles. If it does not, document OT1 as the
supported encoding and investigate.

**Q6 — What happens to `withprescript`/`withpostscript` in SVG?**
They are PostScript fragments. MetaPost's SVG backend handles some (notably
transparency via ConTeXt conventions) and ignores others. Characterise the
behaviour with tests and document it; do not try to "fix" it.

**Q7 — Should we support `mfplain.mp` / METAFONT compatibility?**
It is in `texmf-dist/metapost/base`. It mostly works and costs nothing to
include in the `core` bundle. Include it; test it; make no promises about
bitmap font output.

**Q8 — Node without a worker?**
Node's `worker_threads` are real threads and everything above applies. But a
simple synchronous API is nicer for a CLI. Offer both: `MetaPost.createSync()`
in Node only, with lazy loading served from the real filesystem (synchronous by
nature) and no watchdog.

## 3. Things that will surprise the implementer

Collected so nobody loses a day to them.

1. `mem_name = NULL` segfaults. Set it to `"plain"`.
2. Non-interactive mode silently replaces your I/O callbacks. Only `find_file`
   survives.
3. `read_ascii_file` must return `malloc`ed memory; mplib frees it.
4. `read_binary_file` fills *your caller's* buffer — `*data` is in, `*size` is
   in **and** out.
5. `run_data.ship_out` is freed when the next figure opens. Copy immediately.
6. MetaPost looks for `mpost.map`, not `psfonts.map`.
7. `prologues:=3` is required for usable SVG text.
8. `mp.w` declares the cairo/GMP version symbols `extern` — define them as
   objects, not macros.
9. `mplib.h` needs `integer64`, which comes from `w2c/config.h`; include that
   first.
10. TeX format files are already compressed. `latex.fmt` will not gzip.
11. `etex` in TeX Live 2025 *is* pdfTeX, and `pdftex -ini` needs an explicit
    `-etex` flag or LaTeX refuses to build.
12. `ctangle` must run in the directory containing the `.w` file; it writes its
    outputs to the CWD.
13. `mp_execute` reads exactly one line from its string argument. Multi-line
    sources abort with "no legal end found". Write a file, execute
    `input job`. See `docs/04` §2b and `docs/13` §13.
