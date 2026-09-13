# 05 — The TeX Bridge

How `btex ... etex`, `verbatimtex ... etex` and `maketext` are made to work.
This is the hardest part of the project and the reason a naive port fails.

## 1. What upstream does, and why it cannot be copied

When `mpost` meets `btex` it needs a `.mpx` file — a MetaPost source file
containing one picture expression per typeset block. It calls
`run_make_mpx(mp, "job.mp", "job.mpx")` **from inside the scanner**, which in
TeX Live calls `mpx_makempx()`, which:

1. runs `mpto` over `job.mp`, producing a temporary `.tex`;
2. `execvp`s `tex` (or `latex`) on it, producing a multi-page `.dvi`;
3. runs `dvitomp` over the `.dvi`, producing `job.mpx`;
4. returns, and MetaPost `input`s the `.mpx`.

Step 2 is a synchronous subprocess call from the middle of a C call stack.
WebAssembly has no subprocesses, and the call cannot be suspended to await an
async JavaScript one without JSPI (not universally available) or Asyncify
(which would have to instrument a call chain running through most of a 684 KB
translation unit — large, slow, and fragile).

### 1.1 Rejected alternatives, for the record

| Approach | Why not |
| --- | --- |
| Asyncify with `ASYNCIFY_ONLY` | The stack from `mp_execute` → `mp_do_statement` → … → `mp_start_mpx_input` → `run_make_mpx` is long and version-sensitive. One missed frame is a silent corruption. |
| JSPI | Good long-term. Requires Chrome 137+/Node 24+ with flags in some configs; cannot be the only path in 2026. Revisit as an optimisation (`docs/12` Q4). |
| Both engines in one wasm module, called directly | web2c TeX is a globals-and-`longjmp` program; running it twice in one address space is undefined. Symbol collision risk with mplib. |
| Render text with MathJax/KaTeX and inject SVG | `btex` produces a MetaPost **`picture`** that must support `xscaled`, `rotated`, `clip`, `setbounds`, boolean ops on its bbox. An opaque SVG blob is not a picture. |
| Require a server round-trip | Defeats the point. Keep it as an *optional* remote-engine strategy for huge texmf needs (`docs/08` §6). |

## 2. The design: lift TeX out of the run

Use `extensions = 1`, which reroutes `btex`/`verbatimtex`/`maketext` to the
**`make_text` callback** (see `docs/04` §5.1). `make_text` must answer
synchronously — so make sure the answer is already sitting in a hash table
before the run starts.

```
        ┌────────────────────── before mp_execute ──────────────────────┐
        │                                                               │
 source ──► SCAN ──► keys ──► cache? ──miss──► BATCH TEX ──► DVI ──► dvitomp
        │              │                                                 │
        │              └──hit──────────────┐                             │
        │                                  ▼                             │
        └─────────────────────────► snippet cache ◄──────────────────────┘
                                           │
        ┌──────────────────── during mp_execute ─────────────────────────┐
        │  make_text(str, len, mode)                                     │
        │     mode==1 → push onto preamble chain, return ""              │
        │     mode==0 → key = H(chain, str); return cache[key]           │
        │               on miss: record, return "nullpicture"            │
        └────────────────────────────────────────────────────────────────┘
                                           │
                              misses? ─yes─► re-typeset, re-run (fixpoint)
```

**One TeX invocation per document, not per block.** Starting a TeX engine costs
far more than typesetting a formula; batching every snippet of a document into a
single multi-page DVI is what makes this fast enough to feel interactive.

## 3. Stage 1 — the scan

Produce, in source order, the list of blocks. Two implementations, and you need
both:

* **The oracle:** `mpx_mpto()` in `mpxout.c`, exposed by patch 0001
  (`docs/02` §5.1). This is upstream's own extractor; its output is by
  definition correct.
* **The scanner:** a TypeScript port in `src/ts/tex/scanner.ts`, used to build
  cache keys and to find blocks in `input`-ed files without writing temporaries.

The TS scanner must agree with the oracle. Make that a test: for every file in
the corpus, run both and diff. If they disagree, the oracle wins and the
scanner is fixed.

### 3.1 What `mpto` actually emits

Verified against TeX Live 2025. The generated `.tex` is:

```tex
\gdef\mpxshipout{\shipout\hbox\bgroup
  \setbox0=\hbox\bgroup}%
\gdef\stopmpxshipout{\egroup  \dimen0=\ht0 \advance\dimen0\dp0
  \dimen1=\ht0 \dimen2=\dp0
  \setbox0=\hbox\bgroup
    \box0
    \ifnum\dimen0>0 \vrule width1sp height\dimen1 depth\dimen2
    \else \vrule width1sp height1sp depth0sp\relax
    \fi\egroup
  \ht0=0pt \dp0=0pt \box0 \egroup}%
<contents of the first verbatimtex block, verbatim>
\mpxshipout% line 7 job.mp
<contents of btex block 1>
\stopmpxshipout
\mpxshipout% line 9 job.mp
<contents of btex block 2>
\stopmpxshipout
\end{document}
```

Key facts:

* Every `btex` block becomes **exactly one shipped-out page**, in source order.
  Page *k* of the DVI ↔ block *k*. This is what makes batching work.
* The `\vrule width1sp` is how the box's height and depth survive into the DVI
  so `dvitomp` can recover the bounding box.
* `verbatimtex` blocks are emitted **verbatim at their source position**, so a
  `verbatimtex` appearing after block 3 affects blocks 4+ only. The cache key
  must therefore include the *chain of verbatimtex blocks preceding* the
  snippet, not just a global preamble.
* `\end{document}` is appended only in TeX mode; in troff mode nothing is.
  (`mpx_postdoc[] = { "\\end{document}\n", "" }`.) Note that means the **user**
  supplies `\documentclass` and `\begin{document}` in a `verbatimtex` block,
  which is exactly the LaTeX convention MetaPost users already know.
* If the first btex block is a single line starting with `%`, no `%` is
  appended — this is the `%&format` special case. Preserve it.

### 3.2 Resolving `input`

A `btex` block can live in an `input`-ed file. Resolve `input <name>` and
`input "<name>"` against the VFS search path, recursively, with a visited set.
This is a lexical approximation — `scantokens "input " & f` defeats it — and
that is fine, because the fixpoint loop (§5) catches what the scanner misses.

## 4. Stage 2 — batch typesetting

```
buildTexJob(blocks, engine) → string
  emit the \mpxshipout prologue
  for each block in source order:
     verbatimtex → emit body verbatim
     btex        → emit "\mpxshipout% line N file\n" + body + "\n\stopmpxshipout\n"
  if engine is LaTeX → emit "\end{document}\n"
```

Write it to `/work/mpx-<hash>.tex` in the VFS, then:

```ts
const tex = await TexEngine.run({
  format: opts.engine,                 // 'plain' | 'etex' | 'latex'
  args: ['-interaction=nonstopmode', '-halt-on-error=0', '-parse-first-line'],
  input: '/work/mpx-<hash>.tex',
  vfs
});
// tex.dvi, tex.log, tex.exitCode
```

Then convert, inside `mplib.wasm` (not a separate module — `mpxout.c` is linked
there):

```ts
mplib.ccall('mpwasm_dvitomp', 'number',
            ['string','string','string'],
            ['/work/mpx.dvi', '/work/mpx.mpx', banner]);
```

`mpx_run_dvitomp()` needs to find `.tfm` and `.vf` files for every font the DVI
references. It has its own `find_file` hook (`mpx_file_finder`, with format
codes `mpx_tfm_format`, `mpx_vf_format`, …) — wire it to the same VFS search.

### 4.1 Splitting the `.mpx`

The output looks like this (real output, `reference/mpx-samples/latex-math.mpx`):

```
% Written by metapost version 2.11
begingroup save _p,_r,_s,_n; picture _p; _p=nullpicture;
string _n[];
vardef _s(expr _t,_f,_m,_x,_y)(text _c)=
  addto _p also _t infont _f scaled _m shifted (_x,_y) _c; enddef;
_n0="cmex10";
_s("Z",_n0,1.00000,0.0000,13.5604,);
...
setbounds _p to (0,-9.0772)--(82.3862,-9.0772)--
 (82.3862,14.7126)--(0,14.7126)--cycle;
_p endgroup
mpxbreak
begingroup save _p,_r,_s,_n; ... _p endgroup
mpxbreak
```

* Drop the leading `%` banner line.
* Split on lines equal to `mpxbreak`.
* Chunk *k* corresponds to btex block *k*.
* **Each chunk is self-contained**: it opens with `save _p,_r,_s,_n`, so the
  `_n0`, `_n8`… numbering that continues across chunks is cosmetic. This is
  what makes per-snippet caching sound, and it was checked explicitly.
* A chunk is a valid MetaPost **primary** (`begingroup … _p endgroup`), so it
  can be returned from `make_text` verbatim.

## 5. Stage 3 — serving, and the fixpoint

```c
char *mpwasm_make_text(MP mp, const char *str, size_t len, int mode) {
  ctx *c = mp_userdata(mp);
  if (mode == 1) {                       /* verbatimtex */
    chain_append(c, str, len);
    return mpwasm_strdup("");
  }
  char key[65];
  hash_key(key, c->engine_id, c->format_id, chain_of(c), str, len);
  const char *chunk = cache_get(c, key);
  if (chunk) return mpwasm_strdup(chunk);
  miss_record(c, key, chain_of(c), str, len);
  return mpwasm_strdup("nullpicture");
}
```

After `mp_execute` returns, JS asks for the misses. If there are any:

1. typeset them (another batched TeX run),
2. store them,
3. **throw the `MP` instance away and run the whole thing again.**

Repeat until no misses, capped at 5 iterations, then fail with a clear error
naming the snippets that never resolved.

### 5.1 Why a full re-run rather than patching in place

`mp_execute` is a one-shot job (see `docs/04` §8), so there is nothing to
resume. And the re-run is cheap: TeX has already been run, the cache is warm,
and MetaPost interpretation is the fast part.

### 5.2 Why this terminates

Because the run is deterministic (`docs/04` §7), iteration *n+1* asks for a
superset of the snippets of iteration *n*, and the cache only grows. The only
way to loop is a source that generates unbounded distinct snippets from its own
output — which the iteration cap catches.

The lexical pre-scan means iteration 2 is almost never needed in practice: it
exists for `scantokens`, computed `input`, and `maketext` on a computed string.

## 6. Caching

Two layers, both content-addressed with SHA-256.

| Layer | Key | Value | Lives in |
| --- | --- | --- | --- |
| L1 document | H(full generated `.tex`, engineId, formatId) | the whole `.mpx` | memory + IndexedDB |
| L2 snippet | H(engineId, formatId, verbatimtex-chain, snippet body, texscriptmode) | one chunk | memory + IndexedDB |

* **`engineId`** = wasm build id of `tex.wasm`. **`formatId`** = hash of the
  format file. Both must be in the key: a new LaTeX release changes output.
* L1 turns "recompile an unchanged document" into zero TeX runs.
* L2 turns "edit one label out of forty" into one TeX run for one snippet.
* In Node, back the cache with a directory under `~/.cache/mp-tikz-wasm/`.
* In the browser, IndexedDB, with an LRU cap (default 64 MB) and a
  `cache.clear()` in the API.
* Cache the *`.mpx` chunk text*, not the DVI — it is smaller and skips
  `dvitomp` on a hit.

## 7. The classic `.mpx` path (compatibility)

For the Node CLI and for anyone who wants byte-identical behaviour with
`mpost`, support `extensions = 0` too. This is more viable than it first looks:
because the driver writes the user's source to a real VFS file and executes
`input job` (`docs/04` §2b), MetaPost is genuinely "reading a file", which is
the precondition `mp_t_next` checks before allowing the `.mpx` route. The trick is the same — pre-compute —
but at file granularity:

1. Before `mp_execute`, for every `.mp` file reachable from the job, run
   `mpwasm_mpto` + TeX + `mpwasm_dvitomp` and write `<name>.mpx` into the VFS.
2. Implement `run_make_mpx` as: *does `mpxname` exist and is it newer than
   `origname`? return 1 : return 0.*

Note upstream's own `mpx_makempx` starts with exactly that staleness check
(`mpx_newer(mpname, mpxname)`), so this is not a hack — it is the same
contract. Emscripten's FS supports `utime`, so set mtimes deliberately.

This path also gives us a free `--dvitomp` CLI mode, matching
`mpost --dvitomp`.

## 8. Choosing the engine

| Trigger | Engine |
| --- | --- |
| `options.tex === 'latex'` or CLI `-tex=latex` | `latex.fmt` |
| source contains `%&latex` on the first line | `latex.fmt` (respect `-parse-first-line`) |
| first `verbatimtex` block contains `\documentclass` | `latex.fmt` — auto-detect, and say so in the log |
| otherwise | `plain.fmt` |

Upstream resolves this from the `TEX` / `MPXMAINCMD` kpathsea variables and the
`-tex=` flag. Reproduce the flag and the `%&` line; the `\documentclass`
sniff is an addition — it is what users expect, but log it so it is never a
surprise.

## 9. `mptexpre`

Upstream supports an `MPTEXPRE` file (default `mptexpre.tex`) prepended to the
generated TeX. Support it: `options.texPreamble` (a string) and
`/texmf/mptexpre.tex` (a file). It goes before everything, including the
`\mpxshipout` definitions.

## 10. Failure handling

* **TeX errored.** `tex.exitCode != 0` or the log matches `^! `. Surface the
  TeX log as a first-class error with the snippet that caused it — map DVI page
  *k* back to block *k*, and block *k* back to a file and line (the
  `% line N file` comment `mpto` emits is exactly for this). Do not let a
  LaTeX error masquerade as a MetaPost error.
* **Fewer pages than blocks.** A block produced no output (e.g. an empty
  `btex etex`). Pad with `nullpicture` and warn.
* **`dvitomp` errored.** Usually a missing TFM. Report the font name.
* **A font has no TFM in the bundle.** Report it as a *bundle* error with the
  name, and suggest the package that provides it (`docs/06` §5 keeps a
  `font → package` index).

## 11. Acceptance tests for this document

1. `reference/mpx-samples/latex-math.mp` compiled by mp-tikz-wasm produces an
   SVG identical (modulo the creation-date comment) to native `mpost -tex=latex`.
2. A document with 40 identical `btex $x$ etex` blocks runs TeX **once** and
   hits L2 for 39 of them.
3. Editing one label in a 40-label document re-runs TeX with exactly one page.
4. `verbatimtex \font\foo=cmr17 etex` placed halfway down the file affects only
   later blocks.
5. `btex` inside an `input`-ed file works.
6. A `scantokens`-generated `btex` resolves on iteration 2, and the log says so.
7. A LaTeX error in one snippet reports the right file and line and does not
   corrupt the other 39.
