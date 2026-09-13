/**
 * bridge.ts — the TeX Bridge (docs/05): lift TeX out of the MetaPost run.
 *
 *   scan → keys → cache → batch TeX (tex.wasm) → dvitomp (mplib.wasm) → split
 *
 * The bridge never runs inside make_text; it fills the snippet cache before
 * a MetaPost run and again between fixpoint iterations.
 */
import type { TexBlock } from './scanner.js';
import { buildTexJob } from './mpto.js';
import { splitMpx } from './mpx.js';
import { snippetKey } from './cache-key.js';
import { runTex, type TexFactory, type TexModule } from '../texengine.js';
import { dvitomp, mpxLastError, type MplibModule } from '../mplib.js';
import { writeFileDeep } from '../vfs/lazyfs.js';
import type { Diagnostic, TexEngine } from '../types.js';

export interface Snippet { key: string; chain: string[]; body: string; line?: number; file?: string }

export interface SnippetCache {
  get(key: string): string | undefined;
  set(key: string, chunk: string): void;
  clear(): void;
  readonly size: number;
}
export class MemorySnippetCache implements SnippetCache {
  private m = new Map<string, string>();
  get(k: string) { return this.m.get(k); }
  set(k: string, v: string) { this.m.set(k, v); }
  clear() { this.m.clear(); }
  get size() { return this.m.size; }
}

/** Canonical form of a snippet body for cache keys: whitespace runs collapsed,
 *  trimmed. mplib hands make_text a trimmed, newline-to-space converted body
 *  (texscriptmode=1) while the pre-scan sees the raw text; both map here. */
export function canonicalBody(s: string): string { return s.replace(/\s+/g, ' ').trim(); }

export type ResolvedEngine = 'plain' | 'etex' | 'latex';

export interface EngineInfo { engine: ResolvedEngine; format: string; progname: string; formatId: string; engineId: string }

export function resolveEngine(engine: TexEngine, blocks: TexBlock[], source: string): ResolvedEngine | 'none' {
  if (engine === 'none' || engine === 'plain' || engine === 'etex' || engine === 'latex') return engine;
  // auto (docs/05 §8)
  const first = source.split('\n', 1)[0] ?? '';
  if (/^%&\s*latex\b/i.test(first)) return 'latex';
  const firstVerb = blocks.find((b) => b.kind === 'verbatimtex');
  if (firstVerb && /\\documentclass|\\documentstyle/.test(firstVerb.body)) return 'latex';
  if (/%&\s*etex\b/i.test(first)) return 'etex';
  return 'plain';
}

export interface BridgeOptions {
  texFactory: TexFactory;
  mplib: MplibModule;
  /** prepare a fresh tex.wasm FS: mount/install /texmf, create /work */
  setupTexFS: (M: TexModule) => void;
  cache: SnippetCache;
  texPreamble?: string;
  workDir?: string;               // in mplib's FS
  onLine?: (line: string) => void;
  engineId: string;
  formatIds: Record<ResolvedEngine, string>;
}

export interface TypesetResult {
  texLog: string;
  exitCode: number;
  ms: number;
  pages: number;
  diagnostics: Diagnostic[];
  resolved: number;
}

const PROG: Record<ResolvedEngine, { fmt: string; progname: string }> = {
  plain: { fmt: 'plain', progname: 'tex' },
  etex: { fmt: 'etex', progname: 'etex' },
  latex: { fmt: 'latex', progname: 'latex' },
};

let jobCounter = 0;

export class TexBridge {
  constructor(private o: BridgeOptions) {}

  key(engine: ResolvedEngine, chain: string[], body: string): string {
    return snippetKey({ engineId: this.o.engineId, formatId: this.o.formatIds[engine], chain: chain.map(canonicalBody), body: canonicalBody(body) });
  }

  /**
   * Given the ordered blocks of a document, return the snippets whose chunk is
   * not cached (with their verbatimtex chain), in source order.
   */
  misses(engine: ResolvedEngine, blocks: TexBlock[]): { hits: number; misses: Snippet[]; chainFor: Map<number, string[]> } {
    const chain: string[] = [];
    const misses: Snippet[] = [];
    let hits = 0;
    const chainFor = new Map<number, string[]>();
    for (const b of blocks) {
      if (b.kind === 'verbatimtex') { chain.push(b.body); continue; }
      const key = this.key(engine, chain, b.body);
      chainFor.set(b.index, [...chain]);
      if (this.o.cache.get(key) !== undefined) { hits++; continue; }
      misses.push({ key, chain: [...chain], body: b.body, line: b.line, file: b.file });
    }
    return { hits, misses, chainFor };
  }

  /**
   * Typeset a list of snippets in ONE TeX run and store the resulting chunks.
   * Snippets must be in source order; chains are emitted incrementally.
   */
  async typeset(engine: ResolvedEngine, snippets: Snippet[]): Promise<TypesetResult> {
    const blocks: TexBlock[] = [];
    let emitted: string[] = [];
    let idx = 0;
    const lineOf: { block: TexBlock; snippet: Snippet }[] = [];
    for (const s of snippets) {
      // emit any verbatimtex entries not yet emitted (chains normally extend each other)
      let common = 0;
      while (common < emitted.length && common < s.chain.length && emitted[common] === s.chain[common]) common++;
      for (let i = common; i < s.chain.length; i++) {
        blocks.push({ kind: 'verbatimtex', body: s.chain[i], raw: s.chain[i], line: s.line ?? 0, file: s.file ?? 'job.mp', index: idx++ });
      }
      emitted = [...s.chain];
      const b: TexBlock = { kind: 'btex', body: s.body, raw: s.body, line: s.line ?? 0, file: s.file ?? 'job.mp', index: idx++ };
      blocks.push(b);
      lineOf.push({ block: b, snippet: s });
    }
    const tex = buildTexJob(blocks, { mode: 'tex', mptexpre: this.o.texPreamble });
    const name = `mpx${(++jobCounter).toString(36)}`;
    const { fmt, progname } = PROG[engine];
    let dvi: Uint8Array | null = null;
    let logFile = '';
    const r = await runTex(this.o.texFactory, {
      args: [`-fmt=${fmt}`, `-progname=${progname}`, '-interaction=nonstopmode', '-parse-first-line', `${name}.tex`],
      setup: (M) => {
        this.o.setupTexFS(M);
        writeFileDeep(M.FS, `/work/${name}.tex`, tex);
        M.FS.chdir('/work');
      },
      collect: (M) => {
        try { dvi = M.FS.readFile(`/work/${name}.dvi`, { encoding: 'binary' }) as Uint8Array; } catch { dvi = null; }
        try { logFile = M.FS.readFile(`/work/${name}.log`, { encoding: 'utf8' }) as string; } catch { logFile = r?.log ?? ''; }
      },
      onLine: this.o.onLine,
    });
    const texLog = logFile || r.log;
    const diagnostics = parseTexLog(texLog, tex, lineOf);
    let pages = 0, resolved = 0;
    if (dvi) {
      const M = this.o.mplib;
      const work = this.o.workDir ?? '/work';
      writeFileDeep(M.FS, `${work}/${name}.dvi`, dvi);
      const rc = dvitomp(M, `${work}/${name}.dvi`, `${work}/${name}.mpx`, '% Written by mp-tikz-wasm');
      if (rc !== 0) {
        let err = mpxLastError(M);
        try { err += '\n' + (M.FS.readFile(`${work}/mpxerr.log`, { encoding: 'utf8' }) as string); } catch { /* none */ }
        diagnostics.push({ severity: 'error', source: 'tex', message: `dvitomp failed: ${err.trim()}` });
      } else {
        const mpx = M.FS.readFile(`${work}/${name}.mpx`, { encoding: 'utf8' }) as string;
        const chunks = splitMpx(mpx);
        pages = chunks.length;
        for (let i = 0; i < lineOf.length; i++) {
          const chunk = chunks[i];
          if (chunk !== undefined) { this.o.cache.set(lineOf[i].snippet.key, chunk); resolved++; }
          else {
            this.o.cache.set(lineOf[i].snippet.key, 'nullpicture');
            diagnostics.push({ severity: 'warning', source: 'tex', message: 'btex block produced no output; replaced by nullpicture', file: lineOf[i].snippet.file, line: lineOf[i].snippet.line, snippet: lineOf[i].snippet.body });
          }
        }
        try { M.FS.unlink(`${work}/${name}.mpx`); } catch { /* ignore */ }
      }
      try { M.FS.unlink(`${work}/${name}.dvi`); } catch { /* ignore */ }
    } else {
      // no DVI at all: every snippet becomes nullpicture so the run can proceed
      for (const s of snippets) this.o.cache.set(s.key, 'nullpicture');
      if (!diagnostics.some((d) => d.severity === 'error')) {
        diagnostics.push({ severity: 'error', source: 'tex', message: `TeX produced no DVI (exit ${r.exitCode})` });
      }
    }
    return { texLog, exitCode: r.exitCode, ms: r.ms, pages, diagnostics, resolved };
  }
}

/**
 * Map TeX errors back to btex blocks: the generated .tex has one
 * `\mpxshipout% line N file` wrapper line per block; a TeX `l.<n>` line number
 * inside [wrapper, \stopmpxshipout] belongs to that block.
 */
export function parseTexLog(log: string, tex: string, blocks: { block: TexBlock; snippet: Snippet }[]): Diagnostic[] {
  const out: Diagnostic[] = [];
  const texLines = tex.split('\n');
  // wrapper line index (0-based) for each btex block, in order of appearance
  const starts: number[] = [];
  texLines.forEach((l, i) => { if (l.startsWith('\\mpxshipout%')) starts.push(i); });
  const lines = log.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = /^! (.*)$/.exec(lines[i]);
    if (!m) continue;
    let texLine: number | undefined;
    const help: string[] = [];
    let j = i + 1;
    for (; j < lines.length && j < i + 40; j++) {
      const lm = /^l\.(\d+)/.exec(lines[j]);
      if (lm) { texLine = Number(lm[1]); break; }
      if (/^! /.test(lines[j])) break;
    }
    // help paragraph follows the context lines
    for (let k = (texLine !== undefined ? j + 2 : i + 1); k < lines.length && k < i + 40; k++) {
      if (lines[k].trim() === '' || /^! /.test(lines[k]) || /^l\.\d+/.test(lines[k])) break;
      help.push(lines[k]);
    }
    let blockIdx = -1;
    if (texLine !== undefined) {
      for (let b = 0; b < starts.length; b++) if (starts[b] < texLine) blockIdx = b;
    }
    const d: Diagnostic = { severity: 'error', source: 'tex', message: m[1], help: help.length ? help : undefined };
    if (blockIdx >= 0 && blocks[blockIdx]) {
      d.file = blocks[blockIdx].snippet.file;
      d.line = blocks[blockIdx].snippet.line;
      d.snippet = blocks[blockIdx].snippet.body;
    }
    out.push(d);
  }
  return out;
}
