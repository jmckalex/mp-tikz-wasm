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
