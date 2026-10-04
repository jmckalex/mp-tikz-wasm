// URW Classico, the opt-in `classico` bundle (Zapf's Optima revision for URW++; Aladdin Free
// Public License, so not in TeX Live and taken from a local tree -- see NOTICE.md). Skips where
// the bundle was built without it (CI's TeX Live has no Classico).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const REPO = path.resolve(new URL('../..', import.meta.url).pathname);
const manifest = path.join(REPO, 'dist/bundles/classico/manifest.json');
const built = fs.existsSync(path.join(REPO, 'dist/index.js')) && fs.existsSync(manifest)
  && Object.keys(JSON.parse(fs.readFileSync(manifest, 'utf8')).files).some((f) => f.endsWith('classico.sty'));

describe.skipIf(!built)('URW Classico (classico bundle)', () => {
  let mp: any, DEFAULT_BUNDLES: string[];
  beforeAll(async () => {
    const lib = await import(path.join(REPO, 'dist/index.js'));
    DEFAULT_BUNDLES = lib.DEFAULT_BUNDLES;
    mp = await lib.MetaPost.create({ logLevel: 'silent', bundles: [...DEFAULT_BUNDLES, 'classico'] });
  }, 60_000);
  afterAll(() => mp?.dispose());
  const doc = '\\documentclass[border=2pt]{standalone}\\usepackage{tikz}\\usepackage[T1]{fontenc}\\usepackage{classico}\\begin{document}'
    + '\\tikz\\node[font=\\sf, draw] {\\textbf{Bold} regular};\\end{document}';

  it('sets \\sf (and \\textbf within it) in Classico, as SVG', async () => {
    const r = await mp.latex(doc);
    expect(r.status).toBe('ok');
    expect(r.pages[0]).toContain('<path');
  }, 60_000);

  it('embeds Classico Regular and Bold in PDF output', async () => {
    const r = await mp.latex(doc, { output: 'pdf' });
    expect(r.status).toBe('ok');
    // font dictionaries sit in compressed object streams: inflate them before looking
    const zlib = await import('node:zlib');
    const raw = Buffer.from(r.pdf!).toString('latin1');
    let t = raw;
    for (const m of raw.matchAll(/stream\r?\n/g)) {
      const start = m.index! + m[0].length;
      try { t += zlib.inflateSync(Buffer.from(raw.slice(start, raw.indexOf('endstream', start)), 'latin1')).toString('latin1'); } catch { /* not Flate */ }
    }
    expect(t).toMatch(/\/BaseFont\s*\/[A-Z]{6}\+URWClassico-Regular/);
    expect(t).toMatch(/\/BaseFont\s*\/[A-Z]{6}\+URWClassico-Bold/);
  }, 60_000);

  it('is opt-in: a default engine reports the missing package', async () => {
    const lib = await import(path.join(REPO, 'dist/index.js'));
    const plain = await lib.MetaPost.create({ logLevel: 'silent' });
    try {
      const r = await plain.latex(doc);
      expect(r.status).not.toBe('ok');
      expect(r.diagnostics.some((d: any) => /classico\.sty/.test(d.message))).toBe(true);
    } finally { plain.dispose(); }
  }, 60_000);
});
