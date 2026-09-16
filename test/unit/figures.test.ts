// The identity and the page scan behind saved figures (src/ts/figures.ts):
// the hash, the file name, reading the four tag forms out of HTML the way the
// browser sees them, and the store-only zip writer.
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { figureHash, figureName, figureDocument, FIGURE_FILE, extractFigures, loaderAttributes, parseAttributes, decodeEntities, makeZip, crc32, isSvg, isCompleteDocument, renderFigure } from '../../src/ts/figures.js';
import type { FigureRequest } from '../../src/ts/figures.js';

const tikz: FigureRequest = { kind: 'tikz', source: '\\draw (0,0) circle (1);', attrs: { libraries: 'calc' } };
const mp: FigureRequest = { kind: 'metapost', source: 'draw fullcircle scaled 50;', attrs: {} };

describe('figureHash', () => {
  it('is six lowercase base-36 characters, deterministic', () => {
    const h = figureHash(tikz);
    expect(h).toMatch(/^[0-9a-z]{6}$/);
    expect(figureHash({ ...tikz, attrs: { ...tikz.attrs } })).toBe(h);
    expect(figureName(h)).toBe(`figure-${h}.svg`);
    expect(FIGURE_FILE.exec(figureName(h))![1]).toBe(h);
  });
  it('changes with the source, the kind and the attributes that change the output', () => {
    const h = figureHash(tikz);
    expect(figureHash({ ...tikz, source: '\\draw (0,0) circle (2);' })).not.toBe(h);
    expect(figureHash({ ...tikz, attrs: { libraries: 'calc,arrows.meta' } })).not.toBe(h);
    expect(figureHash({ ...tikz, attrs: { libraries: 'calc', fonts: 'woff2' } })).not.toBe(h);
    expect(figureHash({ ...tikz, attrs: { libraries: 'calc', engine: 'lualatex' } })).not.toBe(h);
    expect(figureHash({ ...tikz, attrs: { libraries: 'calc', border: '5pt' } })).not.toBe(h);
    expect(figureHash({ ...mp, attrs: { tex: 'latex' } })).not.toBe(figureHash(mp));
    expect(figureHash({ ...mp, attrs: { prologues: '0' } })).not.toBe(figureHash(mp));
    expect(figureHash({ kind: 'metapost', source: tikz.source, attrs: tikz.attrs })).not.toBe(h);
  });
  it('ignores attributes that do not reach the engines (alt, cache, show-console)', () => {
    const h = figureHash(tikz);
    expect(figureHash({ ...tikz, attrs: { ...tikz.attrs, alt: 'a circle', cache: 'off', 'show-console': '' } })).toBe(h);
  });
  it('hashes the wrapped document, so the same body wrapped by hand or by the tag agrees', () => {
    const wrapped: FigureRequest = { kind: 'tikz', source: figureDocument(tikz), attrs: {} };
    expect(figureHash(wrapped)).toBe(figureHash(tikz));
  });
});

describe('renderFigure', () => {
  // the engine is faked: what matters is the box the wrapped document asks dvisvgm for
  const fake = (calls: any[]) => ({
    latex: async (doc: string, opts: any) => { calls.push({ doc, opts }); return { status: 'ok', pages: ['<svg/>'], log: '', diagnostics: [], stats: { totalMs: 1 } }; },
    run: async () => { throw new Error('not a MetaPost figure'); },
  }) as any;
  it('asks for the standalone page, border included, when it wrapped the body', async () => {
    const calls: any[] = [];
    const r = await renderFigure(fake(calls), { kind: 'tikz', source: '\\draw[very thick,->] (0,0) -- (1,0);', attrs: { border: '4pt' } });
    expect(r.ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].doc).toContain('\\documentclass[tikz,border=4pt]{standalone}');
    expect(calls[0].opts.bbox).toBe('papersize');
  });
  it('leaves a complete document with the tight box', async () => {
    const calls: any[] = [];
    await renderFigure(fake(calls), { kind: 'tikz', source: '\\documentclass{article}\\begin{document}x\\end{document}', attrs: {} });
    expect(calls[0].opts.bbox).toBeUndefined();
    expect(isCompleteDocument('\\input tikz \\bye')).toBe(true);
    expect(isCompleteDocument('\\draw (0,0) -- (1,1);')).toBe(false);
  });
});

const PAGE = `<!doctype html>
<html><head>
<script type="module" src="../dist/auto.js" data-figures="figs/" data-log="info"></script>
<script>console.log('not a diagram');</script>
</head><body>
<script type="text/tikz" data-libraries="arrows.meta,calc">
\\begin{tikzpicture}
  \\draw[->] (0,0) -- (1,1) node {a &lt; b};
\\end{tikzpicture}
</script>
<tikz-diagram data-libraries="positioning" alt="two &amp; three">
\\node (a) {$a &lt; b$};
</tikz-diagram>
<metapost-diagram alt='quoted'>
  draw fullcircle scaled 60;
  label(btex $x &gt; 0$ etex, origin);
</metapost-diagram>
<SCRIPT TYPE='text/metapost' data-tex=latex>draw origin;</SCRIPT>
<script type="text/plain">ignored</script>
</body></html>`;

describe('extractFigures', () => {
  const found = extractFigures(PAGE);
  it('finds the four forms in document order, with kind, attributes and tag', () => {
    expect(found.map((f) => [f.tag, f.kind])).toEqual([['script', 'tikz'], ['tikz-diagram', 'tikz'], ['metapost-diagram', 'metapost'], ['script', 'metapost']]);
    expect(found[0].attrs.libraries).toBe('arrows.meta,calc');
    expect(found[1].attrs.libraries).toBe('positioning');
    expect(found[3].attrs.tex).toBe('latex');
  });
  it('keeps script bodies raw and decodes entities in custom elements and attributes, as the parser does', () => {
    expect(found[0].source).toContain('a &lt; b');                 // a <script> body is raw text
    expect(found[1].source).toBe('\\node (a) {$a < b$};');          // a custom element holds HTML text
    expect(found[1].attrs.alt).toBe('two & three');
    expect(found[2].source).toBe('  draw fullcircle scaled 60;\n  label(btex $x > 0$ etex, origin);');
    expect(found[2].attrs.alt).toBe('quoted');
  });
  it('trims like the tags: the first line break and trailing whitespace go, indentation stays', () => {
    expect(found[0].source.startsWith('\\begin{tikzpicture}')).toBe(true);
    expect(found[0].source.endsWith('\\end{tikzpicture}')).toBe(true);
    expect(found[3].source).toBe('draw origin;');
  });
  it('reads the loader attributes', () => {
    expect(loaderAttributes(PAGE)).toEqual({ figures: 'figs/', log: 'info' });
    expect(loaderAttributes('<p>no loader</p>')).toEqual({});
  });
  it('parses attribute forms and entities', () => {
    expect(parseAttributes(` data-a="x y" b='z' data-c=w flag`)).toEqual({ a: 'x y', b: 'z', c: 'w', flag: '' });
    expect(decodeEntities('&lt;&gt;&amp;&quot;&apos;&#65;&#x42;&nbsp;&unknown;')).toBe('<>&"\'AB &unknown;');
  });
});

describe('isSvg', () => {
  it('accepts SVG with or without a prolog and rejects an HTML fallback page', () => {
    expect(isSvg('<svg xmlns="http://www.w3.org/2000/svg">')).toBe(true);
    expect(isSvg('<?xml version="1.0"?>\n<!-- dvisvgm -->\n<svg>')).toBe(true);
    expect(isSvg('<!DOCTYPE html><html><body>404</body></html>')).toBe(false);
    expect(isSvg('')).toBe(false);
  });
});

describe('makeZip', () => {
  it('has the right CRC-32', () => {
    expect(crc32(new TextEncoder().encode('hello'))).toBe(0x3610a686);
    expect(crc32(new Uint8Array(0))).toBe(0);
  });
  it('writes a store-only archive whose central directory lists the files', () => {
    const zip = makeZip([{ name: 'figure-abc123.svg', data: '<svg/>' }, { name: 'figure-zzz999.svg', data: new Uint8Array([1, 2, 3]) }]);
    const v = new DataView(zip.buffer);
    expect(v.getUint32(0, true)).toBe(0x04034b50);                      // first local header
    const eocd = zip.length - 22;
    expect(v.getUint32(eocd, true)).toBe(0x06054b50);                   // end of central directory
    expect(v.getUint16(eocd + 10, true)).toBe(2);                       // two entries
    const cdOffset = v.getUint32(eocd + 16, true), cdSize = v.getUint32(eocd + 12, true);
    expect(cdOffset + cdSize).toBe(eocd);
    expect(v.getUint32(cdOffset, true)).toBe(0x02014b50);
    const nameLen = v.getUint16(cdOffset + 28, true);
    expect(new TextDecoder().decode(zip.subarray(cdOffset + 46, cdOffset + 46 + nameLen))).toBe('figure-abc123.svg');
    expect(v.getUint16(cdOffset + 10, true)).toBe(0);                   // stored, not deflated
    expect(v.getUint32(cdOffset + 20, true)).toBe(6);                   // '<svg/>' is six bytes
    // reproducible
    expect(makeZip([{ name: 'a', data: 'x' }])).toEqual(makeZip([{ name: 'a', data: 'x' }]));
  });
  it('is accepted by unzip', () => {
    let unzip = '';
    try { unzip = execFileSync('sh', ['-c', 'command -v unzip'], { encoding: 'utf8' }).trim(); } catch { /* not installed */ }
    if (!unzip) return;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mpw-zip-'));
    const file = path.join(dir, 'figures.zip');
    fs.writeFileSync(file, makeZip([{ name: 'figure-abc123.svg', data: '<svg xmlns="http://www.w3.org/2000/svg"/>' }, { name: 'figure-def456.svg', data: '<svg/>' }]));
    const out = execFileSync(unzip, ['-t', file], { encoding: 'utf8' });
    expect(out).toContain('No errors detected');
    execFileSync(unzip, ['-o', '-q', file, '-d', dir]);
    expect(fs.readFileSync(path.join(dir, 'figure-def456.svg'), 'utf8')).toBe('<svg/>');
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
