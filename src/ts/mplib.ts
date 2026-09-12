/**
 * mplib.ts — thin, typed wrapper over the Emscripten module built from
 * src/c (mpwasm_api.h). One `MpJob` = one MP instance = one compilation
 * (docs/04 §8). Everything here is synchronous.
 */
import type { EmscriptenFS } from './vfs/lazyfs.js';

export interface MplibHooks {
  findFile?: (name: string, ftype: number, mode: string) => string | null | undefined;
  makeText?: (text: string, mode: number) => string | null | undefined;
  runScript?: (script: string) => string | null | undefined;
}

export interface MplibModule {
  FS: EmscriptenFS;
  NODEFS?: unknown;
  MEMFS?: unknown;
  ccall(name: string, ret: string | null, argTypes: string[], args: unknown[]): any;
  cwrap(name: string, ret: string | null, argTypes: string[]): (...args: any[]) => any;
  UTF8ToString(ptr: number, max?: number): string;
  stringToNewUTF8(s: string): number;
  HEAPU8: Uint8Array;
  _malloc(n: number): number;
  _free(p: number): void;
  mpwasmHooks?: MplibHooks;
}

export type MplibFactory = (opts?: Record<string, unknown>) => Promise<MplibModule>;

/** mp_filetype enum (mplib.h) */
export const enum MpFtype {
  terminal = 0, error = 1, program = 2, log = 3, postscript = 4, bitmap = 5,
  memfile = 6, metrics = 7, fontmap = 8, font = 9, encoding = 10, text = 11,
}
export const MP_FTYPE_NAMES = ['terminal', 'error', 'program', 'log', 'postscript', 'bitmap', 'memfile', 'metrics', 'fontmap', 'font', 'encoding', 'text'] as const;

/** pseudo file types used by the dvitomp finder (mpwasm_mpx.c) */
export const MPX_FTYPE_TFM = 100;
export const MPX_FTYPE_VF = 101;

export interface MpJobOptions {
  mathMode?: 0 | 1 | 3;           // scaled | double | decimal
  extensions?: boolean;
  interaction?: 1 | 2 | 3;        // batch | nonstop | scroll
  haltOnError?: boolean;
  randomSeed?: number;
  memName?: string;               // "plain" / "mpost" (no .mp suffix)
  jobName?: string;
  banner?: string;
  recorder?: boolean;
  troff?: boolean;
  fileLineErrorStyle?: boolean;
  searchPaths?: Partial<Record<number, string[]>>;   // ftype -> dirs (-1 = all)
}

export class MpJob {
  private ctx: number;
  private freed = false;
  history = -1;
  constructor(readonly M: MplibModule, opts: MpJobOptions = {}) {
    this.ctx = M.ccall('mpwasm_new', 'number', [], []);
    const setInt = (k: string, v: number) => M.ccall('mpwasm_set_int', 'number', ['number', 'string', 'number'], [this.ctx, k, v]);
    const setStr = (k: string, v: string) => M.ccall('mpwasm_set_str', 'number', ['number', 'string', 'string'], [this.ctx, k, v]);
    setInt('math_mode', opts.mathMode ?? 0);
    setInt('extensions', opts.extensions === false ? 0 : 1);
    setInt('interaction', opts.interaction ?? 2);
    setInt('halt_on_error', opts.haltOnError ? 1 : 0);
    setInt('random_seed', opts.randomSeed ?? 42);
    setInt('recorder', opts.recorder ? 1 : 0);
    setInt('troff_mode', opts.troff ? 1 : 0);
    setInt('file_line_error_style', opts.fileLineErrorStyle ? 1 : 0);
    setStr('mem_name', opts.memName ?? 'plain');
    setStr('job_name', opts.jobName ?? 'job');
    if (opts.banner) setStr('banner', opts.banner);
    for (const [t, dirs] of Object.entries(opts.searchPaths ?? {})) {
      for (const d of dirs ?? []) M.ccall('mpwasm_add_path', null, ['number', 'number', 'string'], [this.ctx, Number(t), d]);
    }
  }

  /** Run ONE line of MetaPost (normally "input job"). Returns history 0..4. */
  run(commands: string): number {
    if (this.freed) throw new Error('MpJob already freed');
    this.history = this.M.ccall('mpwasm_run', 'number', ['number', 'string'], [this.ctx, commands]);
    return this.history;
  }
  get termOut(): string { return this.M.ccall('mpwasm_term_out', 'string', ['number'], [this.ctx]); }
  get logOut(): string { return this.M.ccall('mpwasm_log_out', 'string', ['number'], [this.ctx]); }
  get errorOut(): string { return this.M.ccall('mpwasm_error_out', 'string', ['number'], [this.ctx]); }
  get lastError(): string { return this.M.ccall('mpwasm_last_error', 'string', ['number'], [this.ctx]); }
  get openedFiles(): { name: string; type: number; path: string }[] {
    return JSON.parse(this.M.ccall('mpwasm_opened_files_json', 'string', ['number'], [this.ctx]) || '[]');
  }
  get figureCount(): number { return this.M.ccall('mpwasm_figure_count', 'number', ['number'], [this.ctx]); }
  charcode(i: number): number { return this.M.ccall('mpwasm_figure_charcode', 'number', ['number', 'number'], [this.ctx, i]); }
  dims(i: number): { bbox: [number, number, number, number]; width: number; height: number; depth: number; italicCorrection: number; prologues: number; procset: number } {
    const d = (k: number) => this.M.ccall('mpwasm_figure_dim', 'number', ['number', 'number', 'number'], [this.ctx, i, k]) as number;
    return { bbox: [d(0), d(1), d(2), d(3)], width: d(4), height: d(5), depth: d(6), italicCorrection: d(7), prologues: d(8), procset: d(9) };
  }
  /** CONTRACT: each call re-renders and copies out immediately (drain rule). */
  /** prologues -1 = the document's value at shipout time (patch 0009) */
  svg(i: number, prologues = -1): string | null {
    return this.M.ccall('mpwasm_figure_svg', 'string', ['number', 'number', 'number'], [this.ctx, i, prologues]);
  }
  ps(i: number, prologues = -1, procset = -1): string | null {
    return this.M.ccall('mpwasm_figure_ps', 'string', ['number', 'number', 'number', 'number'], [this.ctx, i, prologues, procset]);
  }
  json(i: number): string | null {
    return this.M.ccall('mpwasm_figure_json', 'string', ['number', 'number'], [this.ctx, i]);
  }
  /** Evaluate a numeric expression in the finished job's state (e.g. an internal like "prologues"). */
  numeric(expr: string): number { return this.M.ccall('mpwasm_get_numeric', 'number', ['number', 'string'], [this.ctx, expr]); }
  string(expr: string): string | null { return this.M.ccall('mpwasm_get_string', 'string', ['number', 'string'], [this.ctx, expr]); }
  free(): void {
    if (!this.freed) { this.freed = true; this.M.ccall('mpwasm_free', null, ['number'], [this.ctx]); }
  }
}

export function mplibVersion(M: MplibModule): string { return M.ccall('mpwasm_version', 'string', [], []); }
export function mplibBuildId(M: MplibModule): string { return M.ccall('mpwasm_build_id', 'string', [], []); }

/** Run mpto (btex extraction) inside mplib.wasm: returns 0 on success. */
export function mpto(M: MplibModule, mpPath: string, texPath: string, mptexpre: string | null = null, troff = false): number {
  return M.ccall('mpwasm_mpto', 'number', ['number', 'number', 'number', 'number'],
    [M.stringToNewUTF8(mpPath), M.stringToNewUTF8(texPath), mptexpre ? M.stringToNewUTF8(mptexpre) : 0, troff ? 1 : 0]);
}
/** Run dvitomp inside mplib.wasm: returns 0 on success. */
export function dvitomp(M: MplibModule, dviPath: string, mpxPath: string, banner?: string): number {
  return M.ccall('mpwasm_dvitomp', 'number', ['string', 'string', 'number'], [dviPath, mpxPath, banner ? M.stringToNewUTF8(banner) : 0]);
}
export function mpxAddPath(M: MplibModule, dir: string): void { M.ccall('mpwasm_mpx_add_path', null, ['string'], [dir]); }
export function mpxLastError(M: MplibModule): string { return M.ccall('mpwasm_mpx_last_error', 'string', [], []); }
