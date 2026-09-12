/**
 * texengine.ts — one invocation of tex.wasm (pdfTeX in DVI mode). A fresh
 * module instance per run (docs/01 §1.2): web2c TeX is not reentrant.
 */
import type { EmscriptenFS } from './vfs/lazyfs.js';

export interface TexModule {
  FS: EmscriptenFS;
  NODEFS?: unknown;
  ENV: Record<string, string>;
  callMain(args: string[]): number | undefined;
}
export type TexFactory = (opts?: Record<string, unknown>) => Promise<TexModule>;

export interface TexRunOptions {
  /** e.g. ['-ini', '-etex', '-jobname=latex', 'latex.ini'] */
  args: string[];
  /** called after the FS exists and before main(): mount/install the texmf tree, write inputs */
  setup: (M: TexModule) => void;
  /** called after main() returned, while the FS is still alive: read outputs */
  collect?: (M: TexModule) => void;
  env?: Record<string, string>;
  onLine?: (line: string) => void;
  /** argv[0] as the engine sees it; default '/bin/pdftex' (luatex.wasm: '/bin/luatex') */
  program?: string;
}

export interface TexRunResult { exitCode: number; log: string; ms: number; setupMs: number; mainMs: number }

const FIXED_EPOCH = '1735689600'; // 2025-01-01T00:00:00Z, docs/04 §7 (4)

export async function runTex(factory: TexFactory, opts: TexRunOptions): Promise<TexRunResult> {
  const lines: string[] = [];
  const t0 = now();
  let exitCode = -1;
  const M = await factory({
    print: (s: string) => { lines.push(s); opts.onLine?.(s); },
    printErr: (s: string) => { lines.push(s); opts.onLine?.(s); },
    noInitialRun: true,
    thisProgram: opts.program ?? '/bin/pdftex',
    preRun: [(m: TexModule) => {
      m.ENV.TEXMFCNF = '/texmf/web2c';
      m.ENV.SOURCE_DATE_EPOCH = FIXED_EPOCH;
      m.ENV.FORCE_SOURCE_DATE = '1';
      m.ENV.HOME = '/home';
      for (const [k, v] of Object.entries(opts.env ?? {})) m.ENV[k] = v;
    }],
    onExit: (code: number) => { exitCode = code; },
  });
  const t1 = now();
  try { M.FS.mkdir('/bin'); } catch { /* exists */ }
  M.FS.writeFile(opts.program ?? '/bin/pdftex', '');   // kpathsea wants dirname(argv[0]) to exist
  opts.setup(M);
  const t2 = now();
  try {
    const r = M.callMain(opts.args);
    if (typeof r === 'number') exitCode = r;
  } catch (e: any) {
    if (e && e.name === 'ExitStatus') exitCode = e.status;
    else throw e;
  }
  const t3 = now();
  opts.collect?.(M);
  return { exitCode, log: lines.join('\n'), ms: now() - t0, setupMs: t2 - t1, mainMs: t3 - t2 };
}

function now(): number { return typeof performance !== 'undefined' ? performance.now() : Date.now(); }
