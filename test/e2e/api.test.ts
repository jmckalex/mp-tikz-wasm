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
    mp = await MetaPost.create({ logLevel: 'silent' });
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
    mp = await MetaPost.create({ logLevel: 'silent' });
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

  it('keeps a classic arrow tip on the page: a wrapped figure is the standalone page, border included', async () => {
    // >=latex declares no hull, so TikZ's bounding box is the bare line and a
    // tight crop is a line with no head; the page pdflatex lays out for the
    // same document is 61.873 x 5.181 bp (2cm + 1.2pt line + 2pt border each side).
    const { renderFigure } = await import(path.join(REPO, 'dist/figures.js'));
    const r = await renderFigure(mp, { kind: 'tikz', source: '\\begin{tikzpicture}[scale=2,>=latex]\n\\draw[very thick,->] (0,0) -- (1,0);\n\\end{tikzpicture}', attrs: {} });
    expect(r.ok).toBe(true);
    const [, w, h] = /viewBox=['"][-\d.]+ [-\d.]+ ([\d.]+) ([\d.]+)['"]/.exec(r.svg)!;
    expect(Number(w)).toBeCloseTo(61.873, 2);
    expect(Number(h)).toBeCloseTo(5.181, 2);
    expect((r.svg.match(/<path /g) ?? []).length).toBe(2);   // the line and the head
  }, 60_000);

  it('typesets bodies that are their own picture (\\chemfig, circuitikz) on a cropped page', async () => {
    // nested in a second tikzpicture \\chemfig came out as a 4 x 4 bp page holding only
    // the border; left bare under standalone's tikz option a circuitikz is a letter page
    const { renderFigure } = await import(path.join(REPO, 'dist/figures.js'));
    const size = (svg: string) => /viewBox=['"][-\d.]+ [-\d.]+ ([\d.]+) ([\d.]+)['"]/.exec(svg)!.slice(1).map(Number);
    const chem = await renderFigure(mp, { kind: 'tikz', source: '\\chemfig{A-B}', attrs: { packages: 'chemfig' } });
    expect(chem.ok).toBe(true);
    const [cw, ch] = size(chem.svg);
    expect(cw).toBeGreaterThan(30); expect(ch).toBeGreaterThan(8);
    const circ = await renderFigure(mp, { kind: 'tikz', source: '\\begin{circuitikz}\\draw (0,0) to[R] (2,0);\\end{circuitikz}', attrs: { packages: 'circuitikz' } });
    expect(circ.ok).toBe(true);
    const [w, h] = size(circ.svg);
    expect(w).toBeGreaterThan(50); expect(w).toBeLessThan(120);
    expect(h).toBeLessThan(60);
  }, 60_000);

  it('puts svg class, svg id and svg attributes from the svg.attributes library on the SVG', async () => {
    // the keys hand their attributes to the <g> PGF opens for each scope, path and node;
    // renderFigure namespaces ids, classes pass as written, a clip path's are dropped
    const { renderFigure } = await import(path.join(REPO, 'dist/figures.js'));
    const r = await renderFigure(mp, { kind: 'tikz', attrs: { libraries: 'svg.attributes' }, source: [
      '\\begin{scope}[svg class=fragment, svg class=fade-up, svg attributes={data-fragment-index="2"}]',
      '  \\draw (0,0) rectangle (1,1); \\begin{scope}[svg id=inner] \\draw (0,0) -- (1,1); \\end{scope}',
      '\\end{scope}',
      '\\draw[svg id=line, svg class=thin] (2,0) -- (3,1);',
      '\\node[svg class=lbl] at (4,0.5) {N};',
      '\\clip[svg class=clipped] (5,0) rectangle (6,1); \\draw (5,0) -- (6,1);',
    ].join('\n') }, 'x');
    expect(r.ok).toBe(true);
    expect(r.svg).toMatch(/<g class='fragment fade-up' data-fragment-index='2'>/);
    expect(r.svg).toMatch(/<g id='mpwx-inner'>/);
    expect(r.svg).toMatch(/<g class='thin' id='mpwx-line'>/);
    expect(r.svg).toMatch(/<g class='lbl'>/);
    expect(r.svg).not.toContain('clipped');
    expect((r.svg.match(/class='fragment/g) ?? []).length).toBe(1);   // nothing inherited it
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

  it('LuaTeX in DVI mode ships rules: math and text, under both formats', async () => {
    // The DVI back-end's rule slot took three arguments while the ship-out passes four;
    // native C drops the extra one, WebAssembly's call_indirect traps on the mismatch. So
    // every \hrule, \sqrt, \over, \overline and \underline under luatex or lualatex threw
    // "null function or function signature mismatch" (patches/luatex/0001, docs/14 §14).
    const plain = await mp.latex('x $\\sqrt{2}$ and ${a\\over b}$\\par\\hrule\\par y\n\\bye', { engine: 'luatex' });
    expect(plain.status).toBe('ok');
    expect(plain.pages).toHaveLength(1);
    expect(plain.pages[0]).toContain('<rect');          // dvisvgm draws DVI rules as rects
    const latex = await mp.latex('\\documentclass{article}\\pagestyle{empty}\\begin{document}$\\frac{1}{2}$ \\underline{u}\\end{document}', { engine: 'lualatex' });
    expect(latex.status).toBe('ok');
    expect(latex.pages).toHaveLength(1);
    expect(latex.pages[0]).toContain('<rect');
  }, 60_000);
});
