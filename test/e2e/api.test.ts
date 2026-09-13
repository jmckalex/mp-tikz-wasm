// End-to-end through the built library (dist/). Run after `npm run build`.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const REPO = path.resolve(new URL('../..', import.meta.url).pathname);
const built = fs.existsSync(path.join(REPO, 'dist/index.js')) && fs.existsSync(path.join(REPO, 'dist/mplib.wasm')) && fs.existsSync(path.join(REPO, 'dist/bundles/core/manifest.json'));

describe.skipIf(!built)('mp-tikz-wasm end to end', () => {
  let mp: any;
  beforeAll(async () => {
    const { MetaPost } = await import(path.join(REPO, 'dist/index.js'));
    mp = await MetaPost.create({ log: () => {} });
  }, 60_000);
  afterAll(() => mp?.dispose());

  it('compiles geometry to svg, eps and json', async () => {
    const r = await mp.run('beginfig(1); draw fullcircle scaled 100; endfig; end.', { format: ['svg', 'eps', 'json'] });
    expect(r.status).toBe('ok');
    expect(r.figures).toHaveLength(1);
    expect(r.figures[0].bbox).toEqual([-50.25, -50.25, 50.25, 50.25]);
    expect(r.figures[0].svg).toContain('<path d="M');
    expect(r.figures[0].eps).toMatch(/^%!PS/);
    expect(r.figures[0].json.objects[0].type).toBe('stroke');
    expect(r.figures[0].json.objects[0].closed).toBe(true);
  });

  it('renders label() with Type 1 glyph outlines (no TeX)', async () => {
    const r = await mp.run('prologues:=3; beginfig(1); label("MetaPost", origin); endfig; end.');
    expect(r.status).toBe('ok');
    expect(r.figures[0].svg).toContain('GLYPHcmr10_77');
    expect(r.stats.texRuns).toBe(0);
  });

  it('typesets btex with plain TeX, caches, and reuses', async () => {
    const src = 'beginfig(1); label(btex $x^2$ etex, origin); endfig; end.';
    const a = await mp.run(src);
    expect(a.status).toBe('ok');
    expect(a.stats.texRuns).toBe(1);
    expect(a.figures[0].svg).toContain('GLYPHcmmi10_120');
    const b = await mp.run(src);
    expect(b.stats.texRuns).toBe(0);
    expect(b.figures[0].svg).toBe(a.figures[0].svg);
  }, 30_000);

  it('auto-detects LaTeX from a verbatimtex preamble', async () => {
    const r = await mp.run('verbatimtex \\documentclass{article}\\usepackage{amsmath}\\begin{document} etex\nbeginfig(1); label(btex $\\begin{pmatrix}1&2\\\\3&4\\end{pmatrix}$ etex, origin); endfig; end.');
    expect(r.status).toBe('ok');
    expect(r.figures[0].svg).toContain('GLYPHcmex10');
  }, 30_000);

  it('runs TeX once for forty labels', async () => {
    let src = 'beginfig(1);\n';
    for (let i = 0; i < 40; i++) src += `label(btex $y_{${i}}$ etex, (${i * 10},0));\n`;
    src += 'endfig; end.';
    const r = await mp.run(src);
    expect(r.status).toBe('ok');
    expect(r.stats.texRuns).toBe(1);
  }, 30_000);

  it('reaches a fixpoint for scantokens-generated labels', async () => {
    // note: MetaPost strings have no escapes, so a single backslash reaches TeX
    const r = await mp.run('beginfig(1); scantokens("label(btex $\\beta_{99}$ etex, origin);"); endfig; end.');
    expect(r.status).toBe('ok');
    expect(r.stats.metapostRuns).toBe(2);
    expect(r.figures[0].svg).toContain('GLYPH');
  }, 30_000);

  it('reports MetaPost errors as diagnostics with help text', async () => {
    const r = await mp.run('beginfig(1); draw z1--z2; endfig; end.');
    expect(r.status).toBe('error');
    expect(r.diagnostics[0].message).toContain('Undefined x coordinate');
    expect(r.diagnostics[0].line).toBe(1);
  });

  it('exposes files written by the document as artifacts', async () => {
    const r = await mp.run('write "hello" to "out.txt"; beginfig(1); draw origin; endfig; end.');
    expect(new TextDecoder().decode(r.artifacts['out.txt'])).toBe('hello\n');
  });
});

describe.skipIf(!built || !fs.existsSync(path.join(REPO, 'dist/dvisvgm.wasm')))('LaTeX / TikZ pipeline', () => {
  let mp: any;
  beforeAll(async () => {
    const { MetaPost } = await import(path.join(REPO, 'dist/index.js'));
    mp = await MetaPost.create({ log: () => {} });
  }, 60_000);
  afterAll(() => mp?.dispose());

  it('typesets a standalone TikZ picture to SVG paths', async () => {
    const r = await mp.latex(`\\documentclass[tikz,border=2pt]{standalone}
\\begin{document}\\begin{tikzpicture}\\draw[->,thick] (0,0) -- (2,1) node[right] {$x^2$}; \\fill[red] (1,0) circle (2pt);\\end{tikzpicture}\\end{document}`);
    expect(r.status).toBe('ok');
    expect(r.pages).toHaveLength(1);
    expect(r.pages[0]).toContain('<svg');
    expect(r.pages[0]).toContain("<path id='g");   // glyph outlines, no <text>
    expect(r.pages[0]).not.toContain('<text');
    expect(r.stats.texMs).toBeGreaterThan(0);
    expect(r.stats.dvisvgmMs).toBeGreaterThan(0);
  }, 60_000);

  it('produces one SVG per page and maps errors to lines', async () => {
    const r = await mp.latex(`\\documentclass{article}\\pagestyle{empty}\\begin{document}one\\newpage two \\undefinedmacro\\end{document}`);
    expect(r.pages).toHaveLength(2);
    expect(r.status).toBe('error');
    const e = r.diagnostics.find((d: any) => d.severity === 'error');
    expect(e.message).toContain('Undefined control sequence');
    expect(e.line).toBe(1);
  }, 60_000);

  it('runs plain TeX with \\input tikz', async () => {
    const r = await mp.latex('\\input tikz \\tikzpicture \\draw (0,0) circle (1); \\endtikzpicture \\bye', { engine: 'plain' });
    expect(r.status).toBe('ok');
    expect(r.pages).toHaveLength(1);
  }, 60_000);
});
