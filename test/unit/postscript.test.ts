// Reading PostScript specials out of a DVI file, and sorting the ones whose loss
// matters (EPS, graphicx transforms, PSTricks, raw PostScript) from the ones that
// draw nothing (headers, PGF's bounding-box comments, hyperref's pdfmarks).
import { describe, it, expect } from 'vitest';
import { dviSpecials, classifyPostScript, describeLostPostScript } from '../../src/ts/postscript.js';

// A small DVI file by hand: the preamble, one page, and the opcodes around the
// specials that have operand bytes, so a wrong length would derail the walk.
function dvi(...specials: string[]): Uint8Array {
  const bytes: number[] = [];
  const u = (v: number, n: number) => { for (let i = n - 1; i >= 0; i--) bytes.push((v >>> (8 * i)) & 0xff); };
  bytes.push(247, 2); u(25400000, 4); u(473628672, 4); u(1000, 4); bytes.push(0);   // pre, no comment
  bytes.push(139); for (let i = 0; i < 44; i++) bytes.push(0);                      // bop
  bytes.push(243, 0); u(0x12345678, 4); u(655360, 4); u(655360, 4); bytes.push(0, 5, ...Buffer.from('cmr10'));   // fnt_def1
  bytes.push(171);                                                                   // fnt_num_0
  bytes.push(...Buffer.from('ps:'));                                                 // typeset text "ps:" (set_char)
  bytes.push(144); u(-300 & 0xffff, 2); bytes.push(147, 160); u(12, 4);            // right2, w0, down4
  specials.forEach((s, i) => {
    const b = Buffer.from(s, 'latin1');
    if (i % 2) { bytes.push(242); u(b.length, 4); } else { bytes.push(239, b.length); }   // xxx4 and xxx1
    bytes.push(...b);
    bytes.push(132); u(1, 4); u(2, 4);                                               // set_rule
  });
  bytes.push(140, 248);                                                              // eop, post
  return new Uint8Array(bytes);
}

describe('dviSpecials', () => {
  it('returns the specials in order and is not fooled by typeset text', () => {
    const got = dviSpecials(dvi('header=l3backend-dvips.pro', 'ps: 0 0 moveto 72 72 lineto stroke', 'color push gray 0'));
    expect(got).toEqual(['header=l3backend-dvips.pro', 'ps: 0 0 moveto 72 72 lineto stroke', 'color push gray 0']);
  });
});

describe('classifyPostScript', () => {
  it('lets through what draws nothing', () => {
    for (const s of [
      'header=l3backend-dvips.pro',
      '! /DvipsToPDF{72.27 mul Resolution div} def',
      'ps::%%HiResBoundingBox: 0 0 28.85274pt 28.85274pt\n',
      'ps:SDict begin [/View [/XYZ H.V]/Dest (page.1) cvn /DEST pdfmark end',
      'ps:SDict begin H.S end',
      'ps:SDict begin /product where{pop product(Distiller)search{pop pop pop}if}if end',
      'color push rgb 1 0 0',
      'dvisvgm:raw <g>',
      'papersize=100pt,100pt',
    ]) expect(classifyPostScript(s), s).toBeNull();
  });
  it('names what is lost', () => {
    expect(classifyPostScript('PSfile="fig.eps" llx=0 lly=0 urx=72 ury=72 rwi=720 ')).toBe('image');
    expect(classifyPostScript('pdffile=fig.pdf')).toBe('image');
    expect(classifyPostScript('ps: gsave currentpoint currentpoint translate 30 neg rotate neg exch neg exch translate')).toBe('transform');
    expect(classifyPostScript('ps: currentpoint currentpoint translate 2 2 scale neg exch neg exch translate')).toBe('transform');
    expect(classifyPostScript('ps: currentpoint grestore moveto')).toBe('transform');
    expect(classifyPostScript('"  tx@Dict begin STP newpath /ArrowA { moveto } def')).toBe('pstricks');
    expect(classifyPostScript('ps:tx@Dict begin  gsave STV CP T /ps@rot 0 def grestore  end')).toBe('pstricks');
    expect(classifyPostScript('ps: 0 0 moveto 72 72 lineto stroke')).toBe('other');
  });
  it('sums it up, or says nothing', () => {
    expect(describeLostPostScript(['header=x.pro', 'ps:SDict begin H.S end'])).toBeNull();
    expect(describeLostPostScript(['ps: currentpoint grestore moveto', 'PSfile="a.eps"', 'ps: currentpoint grestore moveto']))
      .toBe('EPS/PDF images (1), rotation and scaling (\\rotatebox, \\scalebox, \\resizebox) (2)');
  });
});
