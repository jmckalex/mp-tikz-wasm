import { describe, it, expect } from 'vitest';
import { postProcessSvg, sanitizeSvg } from '../../src/ts/render/svg.js';

// A trimmed-down copy of what mplib's SVG backend emits for a clipped picture
// with a glyph: ids are global per figure (CLIP1, GLYPHcmr10_77).
const SVG = `<?xml version="1.0"?>
<svg version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="60.500000" height="100.000000" viewBox="0 0 60.500000 100.000000">
  <defs>
    <g transform="scale(0.009963,0.009963)" id="GLYPHcmr10_77"><path d="M1 2"></path></g>
    <clipPath id="CLIP1"><path d="M80.250000 50.000000L0 0Z" style="fill: black; stroke: none;"></path></clipPath>
  </defs>
  <g clip-path="url(#CLIP1)">
    <path d="M0.250000 130.000000L0.250000 -30.000000" style="stroke-width: 0.500000;fill: none;"></path>
    <g transform="translate(29.259201 6.807800)"><use xlink:href="#GLYPHcmr10_77"></use></g>
  </g>
</svg>`;

// What dvisvgm emits for fonts: 'woff2' -- an embedded face per TeX font, named
// nf0, nf1, ..., with the runs styled by class. Both the @font-face family names
// and the `text.fN` selectors are document-global once the SVG is inlined.
const WEBFONT_SVG = `<?xml version='1.0'?>
<svg version='1.1' xmlns='http://www.w3.org/2000/svg' width='60pt' height='10pt'>
<style type='text/css'>
<![CDATA[@font-face{font-family:nf0;src:url(data:application/x-font-woff2;base64,AAAA) format('woff2');}
@font-face{font-family:nf1;src:url(data:application/x-font-woff2;base64,BBBB) format('woff2');}
text.f0 {font-family:nf0;font-size:11.95px}
text.f1 {font-family:nf1;font-size:11.95px}
]]>
</style>
<text class='f0' x='0' y='9'>regular</text><text class='f1' x='40' y='9'>bold</text>
</svg>`;

describe('postProcessSvg', () => {
  it('namespaces every id and every reference so figures can share a page', () => {
    const a = postProcessSvg(SVG, { precision: false }, 0);
    const b = postProcessSvg(SVG, { precision: false }, 1);
    expect(a).toContain('id="mp0-CLIP1"');
    expect(a).toContain('clip-path="url(#mp0-CLIP1)"');
    expect(a).toContain('id="mp0-GLYPHcmr10_77"');
    expect(a).toContain('xlink:href="#mp0-GLYPHcmr10_77"');
    expect(b).toContain('id="mp1-CLIP1"');
    expect(a).not.toContain('id="CLIP1"');
    // no dangling references: every url(#x) / href="#x" has a matching id
    for (const s of [a, b]) {
      const ids = new Set([...s.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
      for (const m of s.matchAll(/(?:url\(#|href="#)([^)"]+)/g)) expect(ids.has(m[1])).toBe(true);
    }
  });
  it('honours an explicit prefix and idPrefix:false', () => {
    expect(postProcessSvg(SVG, { idPrefix: 'fig-' })).toContain('url(#fig-CLIP1)');
    expect(postProcessSvg(SVG, { idPrefix: false, precision: false })).toBe(SVG);
  });
  it('compacts numbers without touching ids', () => {
    const s = postProcessSvg(SVG, { precision: 2 });
    expect(s).toContain('M0.25 130L0.25 -30');
    expect(s).toContain('width="60.5"');
    expect(s).toContain('id="mp0-GLYPHcmr10_77"');
  });
  it('rewrites xlink:href to href on request', () => {
    expect(postProcessSvg(SVG, { modernHref: true })).toContain('<use href="#mp0-GLYPHcmr10_77">');
  });
});

describe('sanitizeSvg', () => {
  it('keeps MetaPost output and drops scripts and handlers', () => {
    const dirty = SVG.replace('<defs>', '<script>alert(1)</script><defs>').replace('<path d="M1 2">', '<path d="M1 2" onclick="x()">');
    const clean = sanitizeSvg(dirty);
    expect(clean).not.toContain('<script');
    expect(clean).not.toContain('onclick');
    expect(clean).toContain('clip-path="url(#CLIP1)"');
    expect(clean).toContain('xlink:href="#GLYPHcmr10_77"');
  });
});

describe('postProcessSvg on dvisvgm output', () => {
  const DVI = `<svg xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink' width='10pt' height='10pt' viewBox='0 0 10 10'>
<defs>
<path id='g5-97' d='M1 1'/>
<clipPath id='pgfcp1'><path d='M0 0'/></clipPath>
</defs>
<g id='page1'>
<use x='1' y='2' xlink:href='#g5-97'/>
<g clip-path='url(#pgfcp1)'><path d='M2 2'/></g>
</g>
</svg>`;
  it('namespaces single-quoted ids and references too', () => {
    const s = postProcessSvg(DVI, { precision: false, idPrefix: 't3-' });
    expect(s).toContain("id='t3-g5-97'");
    expect(s).toContain("xlink:href='#t3-g5-97'");
    expect(s).toContain("id='t3-pgfcp1'");
    expect(s).toContain("clip-path='url(#t3-pgfcp1)'");
    expect(s).toContain("id='t3-page1'");
    const ids = new Set([...s.matchAll(/id='([^']+)'/g)].map((m) => m[1]));
    for (const m of s.matchAll(/(?:url\(#|href='#)([^)']+)/g)) expect(ids.has(m[1])).toBe(true);
  });
});

describe('postProcessSvg with embedded web fonts', () => {
  it('namespaces @font-face families and text classes too', () => {
    const a = postProcessSvg(WEBFONT_SVG, { precision: false }, 0);
    expect(a).toContain('@font-face{font-family:mp0-nf0');
    expect(a).toContain('@font-face{font-family:mp0-nf1');
    expect(a).toContain('text.mp0-f0 {font-family:mp0-nf0');
    expect(a).toContain('text.mp0-f1 {font-family:mp0-nf1');
    expect(a).toContain("class='mp0-f0'");
    expect(a).toContain("class='mp0-f1'");
    // nothing unprefixed is left to collide with the next figure
    expect(a).not.toMatch(/font-family:nf\d/);
    expect(a).not.toMatch(/class='f\d'/);
  });

  it('gives two figures on one page disjoint font names', () => {
    // the bug this guards: both figures called their faces nf0/nf1, so the browser
    // resolved each name once and fell back for any character that face's subset
    // did not carry -- a word rendered half in one weight and half in another.
    const a = postProcessSvg(WEBFONT_SVG, { precision: false }, 0);
    const b = postProcessSvg(WEBFONT_SVG, { precision: false }, 1);
    const families = (s: string) => [...s.matchAll(/@font-face\{font-family:([^;]+);/g)].map((m) => m[1]);
    expect(families(a)).toEqual(['mp0-nf0', 'mp0-nf1']);
    expect(families(b)).toEqual(['mp1-nf0', 'mp1-nf1']);
    expect(families(a).some((f) => families(b).includes(f))).toBe(false);
  });

  it('leaves the font names alone when idPrefix is false', () => {
    const a = postProcessSvg(WEBFONT_SVG, { precision: false, idPrefix: false }, 0);
    expect(a).toContain('@font-face{font-family:nf0');
    expect(a).toContain("class='f0'");
  });
});
