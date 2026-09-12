import { describe, expect, it } from 'vitest';
import type { TexBlock } from '../../src/ts/tex/scanner.js';
import { scanTexBlocks } from '../../src/ts/tex/scanner.js';
import { blockForPage, buildTexJob, needsPercent } from '../../src/ts/tex/mpto.js';

// The default (glibc) rendering of upstream's prologue; see PrintfLibc.
const PROLOGUE =
  '\\gdef\\mpxshipout{\\shipout\\hbox\\bgroup%\n' +
  '  \\setbox0=\\hbox\\bgroup}%\n' +
  '\\gdef\\stopmpxshipout{\\egroup  \\dimen0=\\ht0 \\advance\\dimen0\\dp0\n' +
  '  \\dimen1=\\ht0 \\dimen2=\\dp0\n' +
  '  \\setbox0=\\hbox\\bgroup\n' +
  '    \\box0\n' +
  '    \\ifnum\\dimen0>0 \\vrule width1sp height\\dimen1 depth\\dimen2 \n' +
  '    \\else \\vrule width1sp height1sp depth0sp\\relax\n' +
  '    \\fi\\egroup\n' +
  '  \\ht0=0pt \\dp0=0pt \\box0 \\egroup}\n';

function block(kind: TexBlock['kind'], body: string, line: number, file = 'job.mp', index = 0): TexBlock {
  return { kind, body, line, file, index, raw: body };
}

describe('buildTexJob', () => {
  it('emits the docs/05 §3.1 shape: prologue at the first btex, verbatimtex in place, \\end{document}', () => {
    const blocks = [
      block('verbatimtex', '\\documentclass{article}\n\\begin{document}\n', 1),
      block('btex', '$x$', 7, 'job.mp', 1),
      block('btex', 'two', 9, 'job.mp', 2),
      block('verbatimtex', ' \\end{document} ', 11, 'job.mp', 3),
    ];
    expect(buildTexJob(blocks)).toBe(
      '\\documentclass{article}\n\\begin{document}\n\n' +
        PROLOGUE +
        '\\mpxshipout% line 7 job.mp\n$x$%\n\\stopmpxshipout\n' +
        '\\mpxshipout% line 9 job.mp\ntwo%\n\\stopmpxshipout\n' +
        '% line 11 job.mp\n \\end{document} \n' +
        '\\end{document}\n',
    );
  });

  it('a verbatimtex block after a btex gets the "% line N file" comment; the very first one does not', () => {
    expect(buildTexJob([block('verbatimtex', 'v', 3)])).toBe('v\n\\end{document}\n');
    expect(buildTexJob([block('btex', 'b', 1), block('verbatimtex', 'v', 3, 'job.mp', 1)])).toBe(
      PROLOGUE + '\\mpxshipout% line 1 job.mp\nb%\n\\stopmpxshipout\n% line 3 job.mp\nv\n\\end{document}\n',
    );
    // two verbatimtex blocks before any btex: only the first is unannounced
    expect(buildTexJob([block('verbatimtex', 'a', 1), block('verbatimtex', 'b', 2, 'job.mp', 1)])).toBe(
      'a\n% line 2 job.mp\nb\n\\end{document}\n',
    );
  });

  it('uses each block\'s own file name and line, verbatim (even with printf characters)', () => {
    const out = buildTexJob([block('btex', 'x', 12, 'dir/100%.mp'), block('btex', 'y', 3, 'other.mp', 1)]);
    expect(out).toContain('\\mpxshipout% line 12 dir/100%.mp\n');
    expect(out).toContain('\\mpxshipout% line 3 other.mp\n');
  });

  it('mptexpre is prepended as-is in TeX mode only', () => {
    expect(buildTexJob([], { mptexpre: 'pre' })).toBe('pre\\end{document}\n');
    expect(buildTexJob([], { mptexpre: 'pre', mode: 'troff' })).toBe('.po 0\n');
  });

  it('troff mode uses .lf/.bp and never appends %', () => {
    const blocks = [block('verbatimtex', 'v', 1, 'j.mp'), block('btex', 'a', 2, 'j.mp', 1), block('btex', 'b', 3, 'j.mp', 2)];
    expect(buildTexJob(blocks, { mode: 'troff' })).toBe('.po 0\n.lf 1 j.mp\nv\n.lf 2 j.mp\na\n.bp\n.lf 3 j.mp\nb\n');
  });

  it('a block mpto errored on gets its wrapper but no body and no %', () => {
    const b = block('btex', '', 1);
    b.error = 'btex in TeX mode';
    expect(buildTexJob([b])).toBe(PROLOGUE + '\\mpxshipout% line 1 job.mp\n\n\\stopmpxshipout\n\\end{document}\n');
  });
});

describe('needsPercent (the %&format special case)', () => {
  it('appends % unless the body is a single line starting with %', () => {
    expect(needsPercent('$x$')).toBe(true);
    expect(needsPercent('')).toBe(true);
    expect(needsPercent('%&latex')).toBe(false);
    expect(needsPercent('% comment')).toBe(false);
    expect(needsPercent('%&latex\nsecond')).toBe(true);
    expect(needsPercent('a\n%b')).toBe(true);
  });
});

describe('blockForPage', () => {
  const src = 'verbatimtex a etex; label(btex 1 etex); verbatimtex b etex;\nlabel(btex 2 etex); label(btex 3 etex);';
  const blocks = scanTexBlocks(src, 'j.mp');

  it('maps DVI page k to the k-th btex block, skipping verbatimtex', () => {
    expect(blockForPage(blocks, 0)?.body).toBe('1');
    expect(blockForPage(blocks, 1)?.body).toBe('2');
    expect(blockForPage(blocks, 2)?.body).toBe('3');
    expect(blockForPage(blocks, 1)?.line).toBe(2);
  });

  it('returns undefined past the end or for bad indices', () => {
    expect(blockForPage(blocks, 3)).toBeUndefined();
    expect(blockForPage(blocks, -1)).toBeUndefined();
    expect(blockForPage(blocks, 1.5)).toBeUndefined();
    expect(blockForPage([], 0)).toBeUndefined();
  });

  it('counts errored btex blocks, which still ship a page', () => {
    const b = scanTexBlocks('a := btex x btex y etex; label(btex z etex);', 'j.mp');
    expect(b[0].error).toBe('btex in TeX mode');
    expect(blockForPage(b, 1)?.body).toBe('z');
  });
});
