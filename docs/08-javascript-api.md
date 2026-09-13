# 08 — JavaScript / TypeScript API

The full declaration file is in `reference/api.d.ts`. This document explains the
choices behind it.

## 1. Shape

```ts
import { MetaPost } from 'mp-tikz-wasm';

const mp = await MetaPost.create({
  bundles: ['core', 'cm-tfm', 'cm-type1', 'latex'],
  tex: 'auto',
});

const result = await mp.run(`
  verbatimtex \\documentclass{article}\\usepackage{amsmath}\\begin{document} etex
  beginfig(1);
    draw fullcircle scaled 100;
    label.top(btex $\\int_0^\\infty e^{-x^2}dx=\\tfrac{\\sqrt\\pi}{2}$ etex, (0,50));
  endfig;
  end.
`);

document.body.innerHTML = result.figures[0].svg;
```

Design rules:

`run(source)` writes `source` to `/work/<jobName>.mp` and drives MetaPost with
the one-line string `input <jobName>` — never by passing the source to
`mp_execute` directly, which reads only one line (`docs/04` §2b). Callers never
see this; it is noted here because it is the first thing an implementer gets
wrong.

* **`create()` is async, `run()` is async, everything else is sync.** The async
  boundary is where wasm instantiation and asset fetching happen.
* **One `MetaPost` object owns one worker.** `run()` serialises onto it. For
  parallelism, create more.
* **No global state.** Two instances with different bundles coexist.
* **Errors are values, not exceptions**, for MetaPost-level problems.
  Exceptions are reserved for host-level failures (wasm won't load, bundle 404).
  A MetaPost syntax error is a normal result with `status: 'error'`.

## 2. Options

```ts
interface MetaPostOptions {
  bundles?: (BundleName | BundleSpec)[];
  bundleBaseUrl?: string;

  numberSystem?: 'scaled' | 'double' | 'decimal' | 'binary' | 'interval';
  tex?: 'none' | 'plain' | 'etex' | 'latex' | 'auto';
  texPreamble?: string;               // MPTEXPRE equivalent

  deterministic?: boolean;            // default true: fixed seed + frozen date
  randomSeed?: number;
  interaction?: 'batch' | 'nonstop' | 'scroll';
  haltOnError?: boolean;
  extensions?: boolean;               // default true; false = classic .mpx path
  troff?: boolean;                    // default false; unsupported, see PLAN §1.2

  memoryLimitBytes?: number;          // default 512 MiB
  timeoutMs?: number;                 // default 20 000: a stall limit (no progress event for this long), not a total
  prefetch?: PrefetchKind[];          // 'metapost' | 'latex' | 'lualatex' | 'plain': fetch a first run's files in parallel after create()
  maxTexRuns?: number;                // default 5 (the fixpoint cap)

  runScript?: (code: string) => string;   // enables `runscript`; off if absent
  makeText?: (text: string, verbatim: boolean) => string | undefined;

  cache?: 'indexeddb' | 'memory' | 'fs' | false;
  cacheBudgetBytes?: number;
  log?: (line: string) => void;
}

interface RunOptions {
  format?: 'svg' | 'eps' | 'json' | 'binary' | 'png' | 'none' | ('svg'|'eps'|'json')[];
  prologues?: 0 | 1 | 2 | 3;          // default 3 for svg, 0 for eps
  files?: Record<string, string | Uint8Array>;
  jobName?: string;
  internals?: Record<string, number | string>;   // like mpost -s NAME=VALUE
  signal?: AbortSignal;
}
```

`format` accepting an array matters: the backends run over the already-exported
edge list, so producing SVG *and* JSON costs one extra walk, not one extra run.

## 3. Results

```ts
interface RunResult {
  status: 'ok' | 'warning' | 'error' | 'fatal';
  history: 0 | 1 | 2 | 3 | 4;          // mplib's history value, verbatim
  figures: FigureResult[];
  log: string;                          // MetaPost term_out + log_out
  texLog?: string;                      // the batched TeX run's log
  diagnostics: Diagnostic[];
  stats: { totalMs: number; metapostMs: number; texMs: number;
           texRuns: number; cacheHits: number; cacheMisses: number };
}

interface FigureResult {
  charcode: number;                     // the `beginfig(N)` number
  bbox: [number, number, number, number];
  svg?: string; eps?: string; json?: Figure; binary?: ArrayBuffer; png?: Blob;
}

interface Diagnostic {
  severity: 'error' | 'warning';
  source: 'metapost' | 'tex' | 'bundle' | 'host';
  message: string;
  help?: string[];                      // mplib supplies these; keep them
  file?: string; line?: number; column?: number;
  snippet?: string;                     // for TeX errors: the btex block
}
```

`figures` is empty when the source never calls `beginfig`/`shipout` — that is
not an error.

### 3.1 Diagnostics are a feature, not an afterthought

MetaPost's errors are unusually good (`mp_error` carries a `help[]` array
written by Hobby and Knuth). Parse them and keep them. The Knuthian format is:

```
! Undefined x coordinate has been replaced by 0.
<to be read again>
                   ;
l.4 draw z1--z2;
```

`term_out` is the source. The parser lives in `src/ts/diagnostics.ts` and is
itself golden-tested against a corpus of deliberately broken inputs.

For TeX errors, map DVI page → btex block → file+line using the
`% line N file` comments `mpto` emits (`docs/05` §3.1).

## 4. Streaming and progress

```ts
mp.on('progress', e => …);   // 'scanning' | 'typesetting' | 'running' | 'rendering'
mp.on('log', line => …);     // MetaPost's terminal output, live
```

MetaPost writes to `term_out` as it goes, but in non-interactive mode we only
see it after `mp_execute` returns. To stream, patch the write path in the shim
to call a JS callback per line (an `EM_JS` trampoline) rather than buffering.
Worth doing: a 5 000-line MetaPost job produces useful progress output.

## 5. The CLI

`mpost-wasm` should be a drop-in for `mpost` for the flags people actually use:

```
mpost-wasm [OPTION]... [&MEMNAME] [MPNAME[.mp]] [COMMANDS]
mpost-wasm --dvitomp DVINAME[.dvi] [MPXNAME[.mpx]]

  -interaction=MODE     batchmode|nonstopmode|scrollmode
  -numbersystem=SYSTEM  scaled|double|binary|interval|decimal
  -jobname=STRING
  -tex=PROGRAM          tex|latex|etex   (we accept only these)
  -s INTERNAL=VALUE
  -T, -troff            accepted, warns that troff mode is unsupported
  -file-line-error
  -halt-on-error
  -recorder             writes a .fls listing every file opened
  -help  -version

  --texmf=DIR           extra texmf root (MPWASM_TEXMF)
  --bundle=NAME         add a bundle
  --format=svg|eps|json default eps, matching upstream
```

Accept and ignore with a warning: `-ini`, `-mem=`, `-progname=`,
`-kpathsea-debug=`, `-restricted` (we are always restricted), `-debug`.

Exit codes must match `mpost`: 0 on success, 1 on error. Output files go to the
CWD with the same `outputtemplate` semantics (`%j`, `%c`, `%d`, …).

## 6. Extension points

* **`runScript`** — `runscript "…"` in MetaPost calls your function; the
  returned string is injected as MetaPost source. Opt-in (`docs/10` §3).
  The obvious uses: fetching data, computing with JS libraries, calling back
  into an application's model.
* **`makeText`** — override the TeX Bridge entirely. Return MetaPost source for
  a `btex` block, or `undefined` to fall through to the normal path. This is
  the hook for "render labels with MathJax and inject them as `special`s", or
  for a *remote* TeX service:

  ```ts
  makeText: (tex, verbatim) => verbatim ? '' : cacheFromServer(tex)
  ```

  Because the callback must be synchronous, a remote service has to be primed
  asynchronously first; the fixpoint loop (`docs/05` §5) is exactly the
  mechanism for that — return `undefined` on a miss and the bridge will
  re-run after your async prefetch resolves.
* **`onFindFile`** — last-chance hook before `find_file` returns `NULL`.

## 7. Framework glue (ship as examples, not as dependencies)

* `examples/react/` — a `<MetaPost source={...} />` component.
* `examples/observable/` — a notebook cell.
* `examples/vite-plugin/` — compile `.mp` files at build time to inline SVG.
* `examples/node-cli/` — batch-convert a directory.
* `examples/editor/` — CodeMirror + live preview + error gutter, which is the
  demo that sells the project.
