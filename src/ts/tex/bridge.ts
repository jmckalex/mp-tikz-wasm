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
    let logBytes: Uint8Array | undefined;
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
        try { logBytes = M.FS.readFile(`/work/${name}.log`, { encoding: 'binary' }) as Uint8Array; } catch { logBytes = undefined; }
      },
      onLine: this.o.onLine,
    });
    const texLog = logFile || r.log;
    // the bytes, where TeX broke a line inside a letter
    const diagnostics = parseTexLog(logBytes?.length ? logBytes : texLog, tex, lineOf);
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
 * The message of the `! ...` error on lines[i] (logLines). A package's or class's error goes on over
 * lines prefixed `(name)`; fontspec's first line is empty and the whole message is on them.
 */
export function texErrorMessage(lines: string[], i: number): string {
  const head = texLogLine(lines, i);
  const first = head.text.slice(2);
  const pkg = /^(?:Package|Class) (\S+) Error:/.exec(first);
  if (!pkg) return logText(first);
  const parts = [first.trimEnd()];
  for (let j = head.last + 1; j < lines.length && lines[j].startsWith(`(${pkg[1]}) `);) {
    const l = texLogLine(lines, j);
    parts.push(l.text.slice(pkg[1].length + 2).trim());
    j = l.last + 1;
  }
  return logText(parts.join(' '));
}

const utf8 = new TextEncoder();
const utf8Text = new TextDecoder();

/**
 * A TeX log's lines as bytes, the way TeX counts them when it breaks a line: one UTF-16 unit per byte,
 * ASCII as itself and a byte from 0x80 up as U+F700 + byte (a private-use character, which no trim or
 * \s touches). pdfTeX breaks inside a letter (its 79th byte the first of two), and a decoded string
 * has lost the letter; here the lines join back into its bytes. logText decodes what is read from them.
 */
export function logLines(log: string | Uint8Array): string[] {
  if (typeof log === 'string' && !/[^\x00-\x7f]/.test(log)) return log.split('\n');
  const b = typeof log === 'string' ? utf8.encode(log) : log;
  const u = new Uint16Array(b.length);
  for (let i = 0; i < b.length; i++) u[i] = b[i] < 0x80 ? b[i] : 0xf700 + b[i];
  let s = '';
  for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode(...u.subarray(i, i + 8192));
  return s.split('\n');
}

/** Text from logLines' lines, decoded as UTF-8 (bytes that are not UTF-8 as U+FFFD, as texLog has them). */
export function logText(s: string): string {
  if (!/[-]/.test(s)) return s;
  const b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); b[i] = c >= 0xf780 ? c - 0xf700 : c; }
  return utf8Text.decode(b);
}

/**
 * lines[i] (logLines) with the lines TeX broke it into, and the index of the last of them. TeX ends a
 * log line after max_print_line (79) bytes and goes on in the next; LuaTeX, in what it prints from C
 * or Lua (a font's error, luaotfload's messages), after 80. pdfTeX breaks inside a letter; LuaTeX
 * moves a letter of k bytes that would end on byte 79 or later to the next line, so its line has
 * 79 - k to 78. A line can also end at that length by itself, so an empty next line, or one that
 * opens an error's context (`l.N`, `<to be read again>`), is not joined.
 */
export function texLogLine(lines: string[], i: number): { text: string; last: number } {
  let text = lines[i];
  while (i + 1 < lines.length && texLineGoesOn(lines[i], lines[i + 1])) text += lines[++i];
  return { text, last: i };
}

function texLineGoesOn(line: string, next: string): boolean {
  if (next === '' || /^(l\.\d+ |<[^>]+>)/.test(next)) return false;
  const n = line.length, b = next.charCodeAt(0) - 0xf700;
  const k = b >= 0xf8 ? 1 : b >= 0xf0 ? 4 : b >= 0xe0 ? 3 : b >= 0xc0 ? 2 : 1;   // the next line's first letter, in bytes
  return n === 79 || n === 80 || (k > 1 && n < 79 && n + k >= 79);
}

/**
 * The help TeX prints after an error's context: lines (logLines), lines[i] the error, lines[k] the first line after its
 * context. It follows the context at once and ends at an empty line; but a LaTeX3 message's (fontspec's:
 * "For immediate help type H <return>.") opens with an empty line and goes on over paragraphs, each ended
 * by one, to two empty lines. A paragraph break is an empty string.
 */
export function texErrorHelp(lines: string[], i: number, k: number, end: number): string[] {
  const help: string[] = [];
  if (lines[k]?.trim() === '' && lines.slice(i + 1, k).includes('For immediate help type H <return>.')) {
    for (k++, end = k + 40; k < lines.length && k < end && !/^! |^l\.\d+/.test(lines[k]); k++) {
      if (lines[k].trim() === '' && (k + 1 >= lines.length || lines[k + 1].trim() === '' || /^! /.test(lines[k + 1]))) break;
      help.push(lines[k].trim() === '' ? '' : logText(lines[k]));
    }
    return help;
  }
  for (; k < lines.length && k < end; k++) {
    if (lines[k].trim() === '' || /^! /.test(lines[k]) || /^l\.\d+/.test(lines[k])) break;
    help.push(logText(lines[k]));
  }
  return help;
}

/**
 * Map TeX errors back to btex blocks: the generated .tex has one
 * `\mpxshipout% line N file` wrapper line per block; a TeX `l.<n>` line number
 * inside [wrapper, \stopmpxshipout] belongs to that block.
 */
export function parseTexLog(log: string | Uint8Array, tex: string, blocks: { block: TexBlock; snippet: Snippet }[]): Diagnostic[] {
  const out: Diagnostic[] = [];
  const texLines = tex.split('\n');
  // wrapper line index (0-based) for each btex block, in order of appearance
  const starts: number[] = [];
  texLines.forEach((l, i) => { if (l.startsWith('\\mpxshipout%')) starts.push(i); });
  const lines = logLines(log);
  for (let i = 0; i < lines.length; i++) {
    const m = /^! (.*)$/.exec(lines[i]);
    if (!m) continue;
    let texLine: number | undefined;
    let j = i + 1;
    for (; j < lines.length && j < i + 40; j++) {
      const lm = /^l\.(\d+)/.exec(lines[j]);
      if (lm) { texLine = Number(lm[1]); break; }
      if (/^! /.test(lines[j])) break;
    }
    // help paragraph follows the context lines
    const help = texErrorHelp(lines, i, texLine !== undefined ? j + 2 : i + 1, i + 40);
    let blockIdx = -1;
    if (texLine !== undefined) {
      for (let b = 0; b < starts.length; b++) if (starts[b] < texLine) blockIdx = b;
    }
    const d: Diagnostic = { severity: 'error', source: 'tex', message: texErrorMessage(lines, i), help: help.length ? help : undefined };
    if (blockIdx >= 0 && blocks[blockIdx]) {
      d.file = blocks[blockIdx].snippet.file;
      d.line = blocks[blockIdx].snippet.line;
      d.snippet = blocks[blockIdx].snippet.body;
    }
    out.push(d);
  }
  return out;
}
