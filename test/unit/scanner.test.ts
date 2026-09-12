/**
 * The scanner/mpto corpus: for every fixture in test/unit/fixtures/mpto,
 * `buildTexJob(scanTexBlocks(src))` must equal, byte for byte, the .tex that
 * upstream mpto writes (docs/05 §3). The committed goldens were produced by
 * the C oracle; when the oracle can be built here it is re-run as well, so a
 * TeX Live bump that changes mpto shows up as a golden mismatch.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { scanInputs, scanTex, scanTexBlocks } from '../../src/ts/tex/scanner.js';
import { buildTexJob, type PrintfLibc } from '../../src/ts/tex/mpto.js';
import { findOracle, repoRoot, runOracle } from './oracle.js';

/**
 * Upstream's prologue format string contains the malformed conversion `%\n`
 * (see PrintfLibc in mpto.ts). The committed goldens were produced by the
 * oracle on macOS, i.e. with Apple's libc, and a live oracle renders it the
 * way the host libc does.
 */
const GOLDEN_LIBC: PrintfLibc = 'bsd';
const hostLibc: PrintfLibc = ['darwin', 'freebsd', 'openbsd', 'netbsd'].includes(process.platform) ? 'bsd' : 'glibc';

const fixtures = join(repoRoot, 'test', 'unit', 'fixtures', 'mpto');
const cases = readdirSync(fixtures)
  .filter((f) => f.endsWith('.mp'))
  .sort()
  .map((f) => ({ name: f.slice(0, -3), file: f, source: readFileSync(join(fixtures, f), 'utf8') }));

const mptexpre = readFileSync(join(fixtures, 'mptexpre.tex'), 'utf8');

/** mpto's stderr format for the errors the scanner reports. */
function formatErrors(source: string, file: string): string {
  return scanTex(source, file)
    .errors.map((e) => `makempx error: ${e.file}:${e.line}: ${e.message}\n`)
    .join('');
}

describe('scanner + mpto vs committed oracle goldens', () => {
  expect(cases.length).toBeGreaterThanOrEqual(12);

  for (const c of cases) {
    it(`${c.name}: TeX mode`, () => {
      const expected = readFileSync(join(fixtures, `${c.name}.tex`), 'utf8');
      expect(buildTexJob(scanTexBlocks(c.source, c.file), { libc: GOLDEN_LIBC })).toBe(expected);
    });
    it(`${c.name}: troff mode`, () => {
      const expected = readFileSync(join(fixtures, `${c.name}.troff`), 'utf8');
      expect(buildTexJob(scanTexBlocks(c.source, c.file), { mode: 'troff' })).toBe(expected);
    });
    it(`${c.name}: errors`, () => {
      const p = join(fixtures, `${c.name}.stderr.txt`);
      const expected = existsSync(p) ? readFileSync(p, 'utf8') : '';
      expect(formatErrors(c.source, c.file)).toBe(expected);
    });
  }

  it('20-latex-math with mptexpre prepended', () => {
    const c = cases.find((x) => x.name === '20-latex-math')!;
    const expected = readFileSync(join(fixtures, '20-latex-math.pre.tex'), 'utf8');
    expect(buildTexJob(scanTexBlocks(c.source, c.file), { mptexpre, libc: GOLDEN_LIBC })).toBe(expected);
  });

  it('the glibc and bsd renderings differ only in the two % of the prologue', () => {
    const c = cases.find((x) => x.name === '01-one-line')!;
    const blocks = scanTexBlocks(c.source, c.file);
    const glibc = buildTexJob(blocks);
    const bsd = buildTexJob(blocks, { libc: 'bsd' });
    expect(glibc).toContain('\\hbox\\bgroup%\n  \\setbox0=\\hbox\\bgroup}%\n');
    expect(glibc.replace('\\hbox\\bgroup%\n  \\setbox0=\\hbox\\bgroup}%\n', '\\hbox\\bgroup\n  \\setbox0=\\hbox\\bgroup}\n')).toBe(bsd);
    expect(buildTexJob(blocks, { libc: 'glibc' })).toBe(glibc);
  });
});

const oracle = findOracle();

describe.skipIf(oracle === null)(`scanner + mpto vs the live C oracle (${hostLibc} printf semantics)`, () => {
  for (const c of cases) {
    it(`${c.name}: byte-for-byte TeX output and stderr`, () => {
      const bytes = readFileSync(join(fixtures, c.file));
      const r = runOracle(oracle!, bytes, c.file);
      const ours = Buffer.from(buildTexJob(scanTexBlocks(c.source, c.file), { libc: hostLibc }), 'utf8');
      expect(ours.toString('utf8')).toBe(r.tex.toString('utf8'));
      expect(ours.equals(r.tex)).toBe(true);
      expect(formatErrors(c.source, c.file)).toBe(r.stderr);
      // and the committed golden has not drifted from upstream
      if (hostLibc === GOLDEN_LIBC) expect(r.tex.equals(readFileSync(join(fixtures, `${c.name}.tex`)))).toBe(true);
    });
    it(`${c.name}: byte-for-byte troff output`, () => {
      const bytes = readFileSync(join(fixtures, c.file));
      const r = runOracle(oracle!, bytes, c.file, { mode: 1 });
      const ours = Buffer.from(buildTexJob(scanTexBlocks(c.source, c.file), { mode: 'troff' }), 'utf8');
      expect(ours.equals(r.tex)).toBe(true);
    });
  }

  it('mptexpre is copied verbatim ahead of everything', () => {
    const c = cases.find((x) => x.name === '20-latex-math')!;
    const pre = 'no newline at the end';
    const r = runOracle(oracle!, c.source, c.file, { mptexpre: pre });
    const ours = buildTexJob(scanTexBlocks(c.source, c.file), { mptexpre: pre, libc: hostLibc });
    expect(Buffer.from(ours, 'utf8').equals(r.tex)).toBe(true);
  });

  it('generated inputs: random token soup agrees with the oracle', () => {
    // A cheap fuzz over the token alphabet that matters to mpto. Quotes only
    // appear as complete one-line string literals without block keywords in
    // them: an unterminated string makes upstream loop forever (see
    // scanner.ts), and a keyword inside a literal that sits inside a block
    // would end the block between the quotes.
    const atoms = ['btex', 'etex', 'verbatimtex', '"x"', '"%"', '""', '%', ' ', '\n', '\r\n', 'x', '_', '1', '\t', 'e', 'b', 'v', ';', '\\'];
    let seed = 12345;
    const rnd = (n: number): number => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % n;
    };
    for (let k = 0; k < 60; k++) {
      let src = '';
      const len = 5 + rnd(40);
      for (let j = 0; j < len; j++) src += atoms[rnd(atoms.length)];
      const r = runOracle(oracle!, src, 'fuzz.mp');
      const ours = buildTexJob(scanTexBlocks(src, 'fuzz.mp'), { libc: hostLibc });
      expect(ours, JSON.stringify(src)).toBe(r.tex.toString('utf8'));
      expect(formatErrors(src, 'fuzz.mp'), JSON.stringify(src)).toBe(r.stderr);
    }
  });
});

describe('scanTex: block structure', () => {
  it('reports kinds, line numbers and bodies in source order', () => {
    const src = 'verbatimtex\n\\font\\x=cmr10\netex\nbeginfig(1);\nlabel(btex $a$ etex, origin);\nlabel(btex\n  b\netex, origin); label(btex c etex);\nendfig;\n';
    const blocks = scanTexBlocks(src, 'job.mp');
    expect(blocks.map((b) => [b.kind, b.line, b.body, b.index])).toEqual([
      ['verbatimtex', 1, '\\font\\x=cmr10\n', 0],
      ['btex', 5, '$a$', 1],
      ['btex', 6, 'b', 2],
      ['btex', 8, 'c', 3],
    ]);
    expect(blocks.every((b) => b.file === 'job.mp')).toBe(true);
    expect(blocks.every((b) => b.error === undefined)).toBe(true);
  });

  it('keeps the untrimmed text in raw', () => {
    const [b] = scanTexBlocks('label(btex  x  \n  y \netex);', 'j.mp');
    expect(b.raw).toBe('  x  \n  y \n');
    expect(b.body).toBe('x  \n  y');
  });

  it('ignores btex inside string literals and comments', () => {
    const src = 's := "btex no etex"; % btex no etex\nlabel(btex yes etex);';
    const blocks = scanTexBlocks(src, 'j.mp');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].body).toBe('yes');
    expect(blocks[0].line).toBe(2);
  });

  it('tokens are delimited by letters and underscore only', () => {
    expect(scanTexBlocks('label(btex1etex);', 'j.mp')[0].body).toBe('1');
    expect(scanTexBlocks('label(btex.etex);', 'j.mp')[0].body).toBe('.');
    expect(scanTexBlocks('label(btex_ etex);', 'j.mp')).toHaveLength(0);
    expect(scanTexBlocks('label(xbtex a etex);', 'j.mp')).toHaveLength(0);
    expect(scanTexBlocks('label(btexetex);', 'j.mp')).toHaveLength(0);
    expect(scanTexBlocks('label(BTEX a ETEX);', 'j.mp')).toHaveLength(0);
  });

  it('first verbatimtex loses leading whitespace only; later ones are verbatim', () => {
    const blocks = scanTexBlocks('verbatimtex \n a \n etex; verbatimtex \n b \n etex;', 'j.mp');
    expect(blocks[0].body).toBe('a \n ');
    expect(blocks[1].body).toBe(' \n b \n ');
  });

  it('flags nested btex / verbatimtex and unterminated blocks the way mpto does', () => {
    const r = scanTex('a := btex x btex y etex z etex;\nlabel(btex never', 'j.mp');
    expect(r.blocks.map((b) => [b.kind, b.line, b.error])).toEqual([
      ['btex', 1, 'btex in TeX mode'],
      ['btex', 2, 'btex section does not end'],
    ]);
    expect(r.errors).toEqual([
      { message: 'btex in TeX mode', line: 1, file: 'j.mp' },
      { message: 'unmatched etex', line: 1, file: 'j.mp' },
      { message: 'unmatched etex', line: 1, file: 'j.mp' },
      { message: 'btex section does not end', line: 2, file: 'j.mp' },
    ]);
  });

  it('CRLF, CR and LF line ends give identical blocks', () => {
    const lf = 'verbatimtex\n\\x\netex\nlabel(btex a\n b etex);\n';
    const strip = (s: string) => scanTexBlocks(s, 'j.mp').map((b) => [b.kind, b.line, b.body, b.raw]);
    expect(strip(lf.replace(/\n/g, '\r\n'))).toEqual(strip(lf));
    expect(strip(lf.replace(/\n/g, '\r'))).toEqual(strip(lf));
  });

  it('an unterminated string is reported once, not forever (deliberate deviation)', () => {
    const r = scanTex('draw "abc; label(btex not seen etex);\nlabel(btex seen etex);\n', 'j.mp');
    expect(r.errors).toEqual([{ message: 'string does not end', line: 1, file: 'j.mp' }]);
    expect(r.blocks.map((b) => b.body)).toEqual(['seen']);
  });

  it('a line is cut at its first NUL byte, like the C buffer', () => {
    expect(scanTexBlocks('a\0b btex c etex\nlabel(btex d etex);', 'j.mp').map((b) => b.body)).toEqual(['d']);
  });

  it('is robust on empty input', () => {
    expect(scanTex('', 'j.mp')).toEqual({ blocks: [], errors: [] });
    expect(buildTexJob([])).toBe('\\end{document}\n');
  });
});

describe('scanInputs', () => {
  it('finds bare and quoted input names, outside comments and strings', () => {
    const src = [
      'input boxes;',
      'input "my file.mp";',
      'input sub ; % input notseen',
      's := "input z";',
      'label(btex \\input tex-file etex);',
      'input\tfoo.mp % a tab is not skipped before the name (mp_scan_file_name skips spaces only)',
      'input  path/to/file\tafter-tab',
      'x := 1; input last',
      'inputx nope; myinput nope; _input nope;',
      '1input digitsok;',
    ].join('\n');
    expect(scanInputs(src)).toEqual(['boxes', 'my file.mp', 'sub', 'path/to/file', 'last', 'digitsok']);
  });

  it('returns duplicates in order and skips an empty name', () => {
    expect(scanInputs('input a; input a;\ninput\ninput ;')).toEqual(['a', 'a']);
  });

  it('does not see input inside a multi-line btex block', () => {
    expect(scanInputs('label(btex\n\\input macros\netex);\ninput real;')).toEqual(['real']);
  });
});
