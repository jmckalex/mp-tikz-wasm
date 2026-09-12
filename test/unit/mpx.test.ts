import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { splitMpx } from '../../src/ts/tex/mpx.js';
import { repoRoot } from './oracle.js';

const sample = readFileSync(join(repoRoot, 'reference', 'mpx-samples', 'latex-math.mpx'), 'utf8');
const HEAD = 'begingroup save _p,_r,_s,_n; picture _p; _p=nullpicture;';

describe('splitMpx', () => {
  it('splits the reference latex-math.mpx into two self-contained primaries', () => {
    const chunks = splitMpx(sample);
    expect(chunks).toHaveLength(2);
    for (const c of chunks) {
      expect(c.startsWith(HEAD)).toBe(true);
      expect(c.endsWith('_p endgroup')).toBe(true);
      expect(c).not.toContain('mpxbreak');
      expect(c).not.toContain('Written by metapost');
    }
    expect(chunks[0]).toContain('_n0="cmex10";');
    expect(chunks[0]).toContain('setbounds _p to (0,-9.0772)--(82.3862,-9.0772)--\n (82.3862,14.7126)--(0,14.7126)--cycle;');
    expect(chunks[1]).toContain('_n8="cmbx10";');
    expect(chunks[1]).toContain('_s("Hello",_n8,1.00000,0.0000,0.0000,);');
  });

  it('drops only a leading % banner', () => {
    expect(splitMpx('% Written by metapost version 2.11\nbegingroup x endgroup\nmpxbreak\n')).toEqual(['begingroup x endgroup']);
    expect(splitMpx('begingroup x endgroup\nmpxbreak\n')).toEqual(['begingroup x endgroup']);
    // a % line after the banner is content, not a banner
    expect(splitMpx('% banner\n% comment\nx\nmpxbreak\n')).toEqual(['% comment\nx']);
  });

  it('ignores the empty trailing chunk but keeps empty chunks in the middle', () => {
    expect(splitMpx('% b\na\nmpxbreak\nmpxbreak\nc\nmpxbreak\n')).toEqual(['a', '', 'c']);
    expect(splitMpx('% b\na\nmpxbreak\n\n  \n')).toEqual(['a']);
    expect(splitMpx('% b\na\nmpxbreak')).toEqual(['a']);
    expect(splitMpx('% b\na')).toEqual(['a']);
  });

  it('accepts CRLF line ends', () => {
    expect(splitMpx(sample.replace(/\n/g, '\r\n'))).toEqual(splitMpx(sample));
  });

  it('is empty for an empty or banner-only file', () => {
    expect(splitMpx('')).toEqual([]);
    expect(splitMpx('% Written by metapost version 2.11\n')).toEqual([]);
  });

  it('does not treat mpxbreak with other text on the line as a separator', () => {
    expect(splitMpx('% b\nmpxbreak;\nmpxbreak\n')).toEqual(['mpxbreak;']);
  });
});
