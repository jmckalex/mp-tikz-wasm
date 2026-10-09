// PostScript through Ghostscript (docs/14 §17): PSTricks, EPS images, graphicx's
// dvips-driver transforms and raw ps: specials, drawn by dvisvgm with a separate
// Ghostscript module behind the opt-in `ghostscript` bundle. Run after `npm run
// build`; skipped where the module was not built (vendor/GHOSTSCRIPT.lock: CI has
// no copy of it).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const REPO = path.resolve(new URL('../..', import.meta.url).pathname);
const built = fs.existsSync(path.join(REPO, 'dist/index.js'))
  && fs.existsSync(path.join(REPO, 'dist/ghostscript/gs.wasm'))
  && fs.existsSync(path.join(REPO, 'dist/bundles/ghostscript/manifest.json'));

const EPS = '%!PS-Adobe-3.0 EPSF-3.0\n%%BoundingBox: 0 0 72 72\nnewpath 0 0 moveto 72 72 lineto 72 0 lineto closepath 0 0 1 setrgbcolor fill\n%%EOF\n';
const PSTRICKS = String.raw`\documentclass{article}\usepackage{pstricks}\pagestyle{empty}\begin{document}\begin{pspicture}(0,0)(3,2)\psframe[linecolor=blue,fillstyle=solid,fillcolor=yellow](0,0)(3,2)\pscircle[linewidth=2pt,linecolor=red](1.5,1){0.7}\end{pspicture}\end{document}`;
const colours = (svg: string) => new Set(svg.match(/(?:fill|stroke)='#[0-9a-f]+'/g) ?? []);
const viewBox = (svg: string) => (/viewBox='([^']*)'/.exec(svg)?.[1] ?? '').split(' ').map(Number);

describe.skipIf(!built)('PostScript through Ghostscript', () => {
  let MetaPost: any, DEFAULT_BUNDLES: string[];
  const engines: any[] = [];
  const records: string[] = [];
  const create = async (opts: Record<string, unknown>) => {
    const mp = await MetaPost.create({ logLevel: 'info', logger: (r: any) => records.push(r.message), ...opts });
    engines.push(mp);
    return mp;
  };
  let mp: any;

  beforeAll(async () => {
    ({ MetaPost } = await import(path.join(REPO, 'dist/index.js')));
    ({ DEFAULT_BUNDLES } = await import(path.join(REPO, 'dist/bundles-config.js')));
    mp = await create({ bundles: [...DEFAULT_BUNDLES, 'ghostscript'] });
  }, 60_000);
  afterAll(() => { for (const e of engines) e?.dispose(); });

  it('draws PSTricks', async () => {
    const r = await mp.latex(PSTRICKS);
    expect(r.status).toBe('ok');
    expect(r.diagnostics).toEqual([]);
    expect(colours(r.pages[0])).toEqual(new Set(["fill='#ff0'", "stroke='#00f'", "stroke='#f00'"]));
  }, 120_000);

  it('includes an EPS image, opened by Ghostscript from the working directory', async () => {
    const r = await mp.latex(String.raw`\documentclass{article}\usepackage{graphicx}\pagestyle{empty}\begin{document}\includegraphics{fig.eps}\end{document}`, { files: { 'fig.eps': EPS } });
    expect(r.status).toBe('ok');
    expect(colours(r.pages[0])).toContain("fill='#00f'");
    expect(viewBox(r.pages[0]).slice(2)).toEqual([72, 72]);
  }, 120_000);

  it('includes an EPS that TeX itself wrote (filecontents)', async () => {
    const r = await mp.latex(`\\begin{filecontents*}[overwrite]{made.eps}\n${EPS}\\end{filecontents*}\n\\documentclass{article}\\usepackage{graphicx}\\pagestyle{empty}\\begin{document}\\includegraphics{made.eps}\\end{document}`);
    expect(r.status).toBe('ok');
    expect(colours(r.pages[0])).toContain("fill='#00f'");
  }, 120_000);

  it("rotates and scales under graphicx's default (dvips) driver, with the right bounding box", async () => {
    const r = await mp.latex(String.raw`\documentclass{article}\usepackage{graphicx}\pagestyle{empty}\begin{document}A\rotatebox{90}{Rotated}B\scalebox{3}{big}\end{document}`);
    expect(r.status).toBe('ok');
    expect((r.pages[0].match(/transform=/g) ?? []).length).toBe(2);
    // TeX Live's dvisvgm with Ghostscript gives this box; without Ghostscript, the
    // rotated word is clipped (or, under the dvips driver, never rotated at all)
    const [, , w, h] = viewBox(r.pages[0]);
    expect(w).toBeCloseTo(60.530949, 4);
    expect(h).toBeCloseTo(40.880078, 4);
  }, 120_000);

  it('leaves Ghostscript unloaded for documents whose PostScript draws nothing', async () => {
    const fresh = await create({ bundles: [...DEFAULT_BUNDLES, 'ghostscript'] });
    records.length = 0;
    const r = await fresh.latex(String.raw`\documentclass{article}\usepackage{xcolor,hyperref}\begin{document}\textcolor{blue}{x}\href{https://x.org}{y}\end{document}`);
    expect(r.status).toBe('ok');
    expect(r.dvisvgmLog).toMatch(/PostScript specials? ignored/);   // the kernel's header and hyperref's pdfmarks, skipped as before
    expect(records.filter((m) => /through Ghostscript/.test(m))).toEqual([]);
  }, 120_000);

  it('runs document after document on one engine', async () => {
    for (let i = 0; i < 6; i++) {
      const r = await mp.latex(PSTRICKS.replace('(1.5,1){0.7}', `(1.5,1){0.${3 + i}}`));
      expect(r.status).toBe('ok');
      expect(colours(r.pages[0])).toContain("stroke='#f00'");
    }
  }, 240_000);

  it('works in a worker', async () => {
    const w = await create({ bundles: [...DEFAULT_BUNDLES, 'ghostscript'], worker: true });
    const r = await w.latex(PSTRICKS);
    expect(r.status).toBe('ok');
    expect(colours(r.pages[0])).toContain("fill='#ff0'");
  }, 120_000);

  it("keeps a real texmf directory (texmfDir) out of PostScript's reach", async () => {
    // dvisvgm runs Ghostscript without SAFER, so a document's PostScript can use file
    // operators: Ghostscript is only given in-memory trees, never a NODEFS mount
    const marker = path.join(REPO, 'build/texmf/mpw-gs-write-probe');
    fs.rmSync(marker, { force: true });
    const t = await create({ texmfDir: path.join(REPO, 'build/texmf'), ghostscript: true });
    const exitBefore = process.exitCode;
    const r = await t.latex(String.raw`\documentclass{article}\begin{document}x\special{ps: (/texmf/mpw-gs-write-probe) (w) file closefile 0 0 moveto 10 10 lineto stroke}\end{document}`);
    try {
      expect(fs.existsSync(marker)).toBe(false);
      expect(r.diagnostics.map((d: any) => d.message).join('\n')).toMatch(/PostScript error/);
      // dvisvgm failed (exit -2): its status is in the result, not left in the host's exit code
      expect(process.exitCode).toBe(exitBefore);
    } finally {
      fs.rmSync(marker, { force: true });
    }
  }, 120_000);

  it("names the 'ghostscript' bundle when PostScript is skipped without it", async () => {
    const plain = await create({});
    const r = await plain.latex(String.raw`\documentclass{article}\usepackage{graphicx}\begin{document}\rotatebox{30}{y}\end{document}`);
    expect(r.status).toBe('ok');
    expect(r.diagnostics.find((d: any) => /PostScript was ignored/.test(d.message))?.message).toMatch(/add the 'ghostscript' bundle/);
  }, 120_000);
});
