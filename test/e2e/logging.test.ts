// Logging through the built library (dist/): what each level lets through,
// the live engine output, the runtime level change. Runs after `npm run build`.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const REPO = path.resolve(new URL('../..', import.meta.url).pathname);
const built = fs.existsSync(path.join(REPO, 'dist/index.js')) && fs.existsSync(path.join(REPO, 'dist/mplib.wasm')) && fs.existsSync(path.join(REPO, 'dist/bundles/core/manifest.json'));

interface Rec { level: string; source: string; message: string; time: number }

const BTEX = 'beginfig(1); label(btex $x^2$ etex, origin); draw fullcircle scaled 20; endfig; end.';
const BROKEN = 'beginfig(1); draw z1--z2; endfig; end.';
const TIKZ = '\\documentclass[tikz,border=2pt]{standalone}\\begin{document}\\tikz\\draw (0,0) circle (1);\\end{document}';

describe.skipIf(!built)('logging', () => {
  let MetaPost: any;
  let mp: any;
  let records: Rec[] = [];
  let rawLines: string[] = [];
  beforeAll(async () => {
    ({ MetaPost } = await import(path.join(REPO, 'dist/index.js')));
    mp = await MetaPost.create({ logLevel: 'debug', logger: (r: Rec) => records.push(r), log: (l: string) => rawLines.push(l) });
  }, 60_000);
  afterAll(() => mp?.dispose());
  const reset = () => { records = []; rawLines = []; };
  const levels = () => new Set(records.map((r) => r.level));
  const of = (source: string, level?: string) => records.filter((r) => r.source === source && (!level || r.level === level)).map((r) => r.message);

  it('create() reports the engine at info', () => {
    expect(of('host', 'info').some((m) => /^ready: MetaPost 2\.11, pdfTeX .*bundles?, \d+ files/.test(m))).toBe(true);
  });

  it('debug streams the engines\' terminal output as it runs, with the summaries at info', async () => {
    reset();
    const r = await mp.run(BTEX);
    expect(r.status).toBe('ok');
    const metapost = of('metapost', 'debug');
    expect(metapost[0]).toMatch(/^This is MetaPost, Version 2\.11/);   // the banner, streamed before the job starts
    expect(metapost.some((m) => /\(job\.mp \[1\] \)/.test(m))).toBe(true);
    expect(metapost.some((m) => /^1 figure created\.$/.test(m))).toBe(true);
    const tex = of('tex', 'debug');
    expect(tex[0]).toMatch(/^This is pdfTeX/);
    expect(tex.some((m) => /Output written on mpx\w+\.dvi/.test(m))).toBe(true);
    const host = of('host', 'info');
    expect(host.some((m) => /^run job\.mp: 84 bytes, svg, 1 btex block via plain$/.test(m))).toBe(true);
    expect(host.some((m) => /^TeX \(plain\): 1 label in [\d.]+ ms$/.test(m))).toBe(true);
    expect(host.some((m) => /^run job\.mp: ok, 1 figure in [\d.]+ ms \(MetaPost [\d.]+ ms, TeX [\d.]+ ms in 1 run, 1 cached label\)$/.test(m))).toBe(true);
    expect(of('host', 'debug')).toContain('running 1');
    expect(levels().has('trace')).toBe(false);
    // the raw 'log' option still sees every engine line, MetaPost's now live
    expect(rawLines).toContain(metapost[0]);
    expect(rawLines).toContain(tex[0]);
    // the transcript the result carries is the same text that was streamed
    expect(r.log.trimEnd().split('\n')).toEqual(metapost);
  }, 30_000);

  it('trace adds the file lookups and the label cache', async () => {
    mp.logLevel = 'trace';
    reset();
    await mp.run(BTEX);
    const trace = of('host', 'trace');
    expect(trace.some((m) => /^btex cached: "\$x\^2\$"$/.test(m))).toBe(true);
    expect(of('metapost', 'trace').some((m) => /^opened plain\.mp \(program\) = \/texmf\/metapost\/base\/plain\.mp$/.test(m))).toBe(true);
    expect(of('bundle').length + trace.length).toBeGreaterThan(0);
  }, 30_000);

  it('error reports the errors of a run with their help text, and nothing for a clean one', async () => {
    mp.logLevel = 'error';
    reset();
    const r = await mp.run(BROKEN);
    expect(r.status).toBe('error');
    expect(levels()).toEqual(new Set(['error']));
    const errors = of('metapost', 'error');
    expect(errors.length).toBe(r.diagnostics.length);
    expect(errors[0]).toMatch(/^job\.mp:1: Undefined x coordinate has been replaced by 0\.\n  I need a `known' x value/);
    reset();
    await mp.run('beginfig(1); draw origin; endfig; end.');
    expect(records).toEqual([]);
  }, 30_000);

  it('silent writes nothing, even for a failing run', async () => {
    mp.logLevel = 'silent';
    reset();
    await mp.run(BROKEN);
    expect(records).toEqual([]);
    expect(rawLines.length).toBeGreaterThan(0);   // the raw line channel is not subject to the level
  }, 30_000);

  it('latex() logs TeX and dvisvgm the same way', async () => {
    mp.logLevel = 'debug';
    reset();
    const r = await mp.latex(TIKZ);
    expect(r.status).toBe('ok');
    expect(of('tex', 'debug')[0]).toMatch(/^This is pdfTeX/);
    expect(of('dvisvgm', 'debug').some((m) => /processing page 1/.test(m))).toBe(true);
    const host = of('host', 'info');
    expect(host.some((m) => /^latex doc\.tex: \d+ bytes, engine latex, format tikz$/.test(m))).toBe(true);
    expect(host.some((m) => /^TeX: \d+-byte DVI in [\d.]+ ms$/.test(m))).toBe(true);
    expect(host.some((m) => /^dvisvgm: 1 page in [\d.]+ ms$/.test(m))).toBe(true);
    expect(host.some((m) => /^latex doc\.tex: ok, 1 page in [\d.]+ ms \(TeX [\d.]+ ms, dvisvgm [\d.]+ ms\)$/.test(m))).toBe(true);
  }, 60_000);

  it('a LaTeX error is an error record with the document line', async () => {
    mp.logLevel = 'warn';
    reset();
    const r = await mp.latex('\\documentclass{article}\\begin{document}\\undefinedmacro\\end{document}');
    expect(r.status).toBe('error');
    expect(of('tex', 'error').some((m) => /^doc\.tex:1: Undefined control sequence\./.test(m))).toBe(true);
    expect(levels().has('info')).toBe(false);
  }, 60_000);

  it('the record event carries the same records as the logger option', async () => {
    mp.logLevel = 'info';
    reset();
    const seen: Rec[] = [];
    const off = mp.on('record', (r: Rec) => seen.push(r));
    await mp.run('beginfig(1); draw origin; endfig; end.');
    off();
    expect(seen).toEqual(records);
    expect(seen.length).toBeGreaterThan(0);
  }, 30_000);

  it('rejects an unknown level', async () => {
    expect(() => { mp.logLevel = 'loud'; }).toThrow(/unknown logLevel/);
    await expect(MetaPost.create({ logLevel: 'loud' })).rejects.toThrow(/unknown logLevel/);
    expect(mp.logLevel).toBe('info');
  });

  it('the default level is warn and the default sink is the console', async () => {
    const calls: string[] = [];
    const orig = console.error;
    console.error = (s: string) => { calls.push(String(s)); };
    try {
      const m = await MetaPost.create();
      expect(m.logLevel).toBe('warn');
      await m.run(BROKEN);
      m.dispose();
    } finally { console.error = orig; }
    expect(calls.some((s) => /^mp-tikz-wasm metapost: job\.mp:1: Undefined x coordinate/.test(s))).toBe(true);
  }, 60_000);
});
