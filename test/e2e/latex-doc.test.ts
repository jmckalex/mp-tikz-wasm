// Whole documents: the latex-doc bundle, bibtex.wasm and makeindex.wasm, as a host
// exporting a note to PDF drives them (latex, bibtex, makeindex, latex, latex).
// Byte-for-byte agreement with TeX Live is scripts/golden-pdf.mjs's job; this is
// behaviour. Run after `npm run build`.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const REPO = path.resolve(new URL('../..', import.meta.url).pathname);
const built = ['dist/index.js', 'dist/bibtex.wasm', 'dist/makeindex.wasm', 'dist/bundles/latex-doc/manifest.json'].every((f) => fs.existsSync(path.join(REPO, f)));
const text = (b?: Uint8Array) => (b ? new TextDecoder().decode(b) : '');
// on failure, say why: the first diagnostics of each run
const why = (...rs: any[]) => JSON.stringify(rs.map((r) => r.diagnostics?.slice(0, 6).map((d: any) => `${d.severity}: ${d.message}${d.file ? ` (${d.file}:${d.line})` : ''}`)), null, 1);

const BIB = `@book{knuth84, author={Donald E. Knuth}, title={The {\\TeX}book}, publisher={Addison-Wesley}, year={1984}}
@article{nash50, author={John F. Nash}, title={Equilibrium points in n-person games}, journal={PNAS}, volume={36}, pages={48--49}, year={1950}}
@book{gödel31, author={Kurt Gödel}, title={Über formal unentscheidbare Sätze}, publisher={Monatshefte}, year={1931}}
`;

describe.skipIf(!built)('latex-doc: whole documents with a bibliography and an index', () => {
  let mp: any;
  beforeAll(async () => {
    const { MetaPost, DEFAULT_BUNDLES } = await import(path.join(REPO, 'dist/index.js'));
    mp = await MetaPost.create({ logLevel: 'silent', bundles: [...DEFAULT_BUNDLES, 'opentype', 'latex-doc'] });
  }, 60_000);
  afterAll(() => mp?.dispose());

  // latex, bibtex, makeindex, latex, latex: what latexmk would run
  const compile = async (doc: string, engine: string, files: Record<string, string | Uint8Array> = {}) => {
    await mp.removeFiles();
    let r = await mp.latex(doc, { engine, output: 'pdf', files });
    const steps: any[] = [r];
    let carry = { ...files, ...r.artifacts };
    if (/\\bibliography\{/.test(doc)) { const b = await mp.bibtex({ files: carry }); steps.push(b); carry = { ...carry, ...b.artifacts }; }
    if (/\\makeindex/.test(doc)) { const i = await mp.makeindex({ files: carry }); steps.push(i); carry = { ...carry, ...i.artifacts }; }
    for (let k = 0; k < 2; k++) { r = await mp.latex(doc, { engine, output: 'pdf', files: carry }); carry = { ...carry, ...r.artifacts }; steps.push(r); }
    return { r, steps };
  };

  it('runs natbib and imakeidx through three passes under pdfLaTeX, a UTF-8 citation key included', async () => {
    const doc = String.raw`\documentclass{article}\usepackage[utf8]{inputenc}\usepackage[T1]{fontenc}\usepackage{lmodern}
\usepackage{natbib}\usepackage{imakeidx}\makeindex\usepackage{hyperref}\usepackage{cleveref}
\begin{document}\section{One}\label{s}See \cref{s}, \citet{knuth84}, \citep{nash50} and \citet{gödel31}.\index{game}\index{Gödel}\index{equilibrium!Nash}
\bibliographystyle{plainnat}\bibliography{refs}\printindex\end{document}`;
    const { r, steps } = await compile(doc, 'latex', { 'refs.bib': BIB });
    expect(steps.map((s) => s.status), why(...steps)).toEqual(['ok', 'ok', 'ok', 'ok', 'ok']);
    const [, bib, idx] = steps;
    expect(Object.keys(bib.artifacts).sort()).toEqual(['doc.bbl', 'doc.blg']);
    expect(text(bib.artifacts['doc.bbl'])).toMatch(/\\bibitem\[G.del\(1931\)\]\{gödel31\}/);   // the key as TeX Live writes it: raw UTF-8, not ^^c3^^b6
    expect(Object.keys(idx.artifacts).sort()).toEqual(['doc.ilg', 'doc.ind']);
    expect(text(idx.artifacts['doc.ind'])).toContain('\\item Gödel');
    expect(r.diagnostics.filter((d: any) => /undefined|Rerun/.test(d.message))).toEqual([]);
  }, 120_000);

  it("typesets Clew's export style under LuaLaTeX: EB Garamond, Garamond-Math, babel's hyphenation", async () => {
    const doc = String.raw`\documentclass[12pt,a4paper]{article}\usepackage{fontspec}\usepackage{unicode-math}
\usepackage{microtype}\usepackage{enumitem}\usepackage{titlesec}\usepackage{titling}\usepackage{etoolbox}\usepackage{hyperref}
\makeatletter\@ifpackageloaded{babel}{}{\usepackage[ngerman]{babel}}
\IfFontExistsTF{EBGaramond-Regular.otf}{\setmainfont{EBGaramond}[Extension=.otf,UprightFont=*-Regular,ItalicFont=*-Italic,BoldFont=*-Bold,BoldItalicFont=*-BoldItalic]}{}
\IfFontExistsTF{Garamond-Math.otf}{\setmathfont{Garamond-Math.otf}[StylisticSet={7,8,9}]}{}\makeatother
\title{Eine Notiz}\begin{document}\maketitle\section{Organisation}\showhyphens{Organisation}Text, \textit{kursiv}, $\int_0^1 x^2\,dx$.\end{document}`;
    const r = await mp.latex(doc, { engine: 'lualatex', output: 'pdf' });
    expect(r.status, why(r)).toBe('ok');
    // LuaTeX packs the font descriptors in compressed object streams: inflate them all
    const zlib = await import('node:zlib');
    const raw = Buffer.from(r.pdf!).toString('latin1');
    let pdf = raw;
    for (const m of raw.matchAll(/stream\r?\n/g)) {
      const start = m.index! + m[0].length;
      try { pdf += zlib.inflateSync(Buffer.from(raw.slice(start, raw.indexOf('endstream', start)), 'latin1')).toString('latin1'); } catch { /* not Flate */ }
    }
    for (const face of ['EBGaramond-Regular', 'EBGaramond-Italic', 'EBGaramond-Bold', 'Garamond-Math']) expect(pdf).toMatch(new RegExp(`/FontName\\s*/[A-Z]{6}\\+${face}\\b`));
    expect(r.texLog).toMatch(/Or-ga-ni-sa-ti-on/);   // German patterns, loaded as the language was first used
  }, 120_000);

  it('reports what BibTeX and makeindex found wrong, with their file and line', async () => {
    await mp.removeFiles();
    const aux = '\\relax\n\\citation{knuth84}\n\\citation{nokey}\n\\bibstyle{plain}\n\\bibdata{refs}\n';
    const b = await mp.bibtex({ files: { 'doc.aux': aux, 'refs.bib': BIB } });
    expect(b.status, why(b)).toBe('warning');
    expect(b.diagnostics).toContainEqual({ severity: 'warning', source: 'bibtex', message: 'I didn\'t find a database entry for "nokey"' });
    const style = await mp.bibtex({ files: { 'doc.aux': aux.replace('{plain}', '{nosuchstyle}') } });
    expect(style.status, why(style)).toBe('error');
    expect(style.diagnostics[0]).toMatchObject({ severity: 'error', message: "I couldn't open style file nosuchstyle.bst", file: 'doc.aux', line: 4 });
    const i = await mp.makeindex({ files: { 'doc.idx': '\\indexentry{alpha}{1}\n\\indexentry{beta|)}{2}\n' } });
    expect(i.status, why(i)).toBe('warning');
    expect(i.diagnostics).toContainEqual({ severity: 'warning', source: 'makeindex', message: 'Unmatched range closing operator ).', file: 'doc.idx', line: 2 });
    const missing = await mp.makeindex({ style: 'nosuch.ist', files: { 'doc.idx': '\\indexentry{alpha}{1}\n' } });
    expect(missing.status, why(missing)).toBe('error');
    expect(missing.diagnostics[0].message).toMatch(/nosuch\.ist not found/);
  }, 60_000);

  it('names a font with no outline instead of "TeX produced no PDF"', async () => {
    await mp.removeFiles();
    const r = await mp.latex('\\documentclass{article}\\usepackage[T1]{fontenc}\\begin{document}EC text\\end{document}', { output: 'pdf' });
    expect(r.pdf).toBeUndefined();
    expect(r.diagnostics[0].message).toMatch(/^font ecrm1000 has no outline here/);
    expect(r.diagnostics[0].help?.[0]).toMatch(/lmodern/);
  }, 60_000);
});

describe.skipIf(!built)('latex-doc is opt-in', () => {
  it('leaves the default bundles as they were: no tcolorbox, no styles for BibTeX', async () => {
    const { MetaPost } = await import(path.join(REPO, 'dist/index.js'));
    const mp = await MetaPost.create({ logLevel: 'silent' });
    try {
      const r = await mp.latex('\\documentclass{article}\\usepackage{tcolorbox}\\begin{document}x\\end{document}', { output: 'pdf' });
      expect(r.status, why(r)).not.toBe('ok');
      const b = await mp.bibtex({ files: { 'doc.aux': '\\citation{x}\n\\bibstyle{plainnat}\n\\bibdata{refs}\n', 'refs.bib': BIB } });
      expect(b.status, why(b)).toBe('error');
      expect(b.diagnostics[0].help?.[0]).toMatch(/latex-doc/);
    } finally {
      mp.dispose();
    }
  }, 60_000);
});
