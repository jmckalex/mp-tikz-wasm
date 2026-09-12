/**
 * dvisvgm.ts — one invocation of dvisvgm.wasm (DVI → SVG, with PGF/TikZ
 * special support). A fresh instance per run, like tex.wasm.
 */
import type { TexModule, TexFactory } from './texengine.js';

export type DvisvgmModule = TexModule;
export type DvisvgmFactory = TexFactory;

export interface DvisvgmRunOptions {
  args: string[];
  setup: (M: DvisvgmModule) => void;
  collect?: (M: DvisvgmModule) => void;
  onLine?: (line: string) => void;
}

export async function runDvisvgm(factory: DvisvgmFactory, opts: DvisvgmRunOptions): Promise<{ exitCode: number; log: string; ms: number }> {
  const lines: string[] = [];
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  let exitCode = -1;
  const M = await factory({
    print: (s: string) => { lines.push(s); opts.onLine?.(s); },
    printErr: (s: string) => { lines.push(s); opts.onLine?.(s); },
    noInitialRun: true,
    thisProgram: '/bin/dvisvgm',
    preRun: [(m: DvisvgmModule) => {
      m.ENV.TEXMFCNF = '/texmf/web2c';
      m.ENV.SOURCE_DATE_EPOCH = '1735689600';
      m.ENV.HOME = '/home';
    }],
    onExit: (code: number) => { exitCode = code; },
  });
  try { M.FS.mkdir('/bin'); } catch { /* exists */ }
  M.FS.writeFile('/bin/dvisvgm', '');
  opts.setup(M);
  try {
    const r = M.callMain(opts.args);
    if (typeof r === 'number') exitCode = r;
  } catch (e: any) {
    if (e && e.name === 'ExitStatus') exitCode = e.status; else throw e;
  }
  opts.collect?.(M);
  return { exitCode, log: lines.join('\n'), ms: (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0 };
}
