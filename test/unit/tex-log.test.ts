/**
 * TeX transcript parser tests. The fontspec excerpt is real LuaHBTeX 1.22 (TeX Live 2025)
 * output of `\setmainfont{NoSuchFontAnywhere}` on line 3 of a four-line preamble.
 */
import { describe, expect, it } from 'vitest';
import { parseTexLogDocument } from '../../src/ts/core.js';
import { texErrorMessage } from '../../src/ts/tex/bridge.js';

const fontspecMissing = `luaotfload | db : Reload initiated (formats: otf,ttf,ttc); reason: Font "NoSuchF
ontAnywhere" not found.

! Package fontspec Error:
(fontspec)                The font "NoSuchFontAnywhere" cannot be found;
(fontspec)                this may be but usually is not a fontspec bug.
(fontspec)                Either there is a typo in the font name/file, the
(fontspec)                font is not installed (correctly), or there is a
(fontspec)                bug in the underlying font loading engine
(fontspec)                (XeTeX/luaotfload).

For immediate help type H <return>.
 ...

l.4 \\begin
          {document}

A font might not be found for many reasons.
`;

describe('parseTexLogDocument', () => {
  it('reads a package error whose first line is empty from its (name) lines', () => {
    const d = parseTexLogDocument(fontspecMissing, 'doc.tex');
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ severity: 'error', source: 'tex', file: 'doc.tex', line: 4 });
    expect(d[0].message).toBe('Package fontspec Error: The font "NoSuchFontAnywhere" cannot be found; this may be but usually is not a fontspec bug. '
      + 'Either there is a typo in the font name/file, the font is not installed (correctly), or there is a bug in the underlying font loading engine (XeTeX/luaotfload).');
  });
});

describe('texErrorMessage', () => {
  it('joins a class error\'s continuation lines to its first', () => {
    const lines = ['! Class foo Error: The option `bar\' is', '(foo)                not known.', '', 'l.1 x'];
    expect(texErrorMessage(lines, 0)).toBe('Class foo Error: The option `bar\' is not known.');
  });
  it('leaves other errors as their first line', () => {
    expect(texErrorMessage(['! Undefined control sequence.', 'l.3 \\foo'], 0)).toBe('Undefined control sequence.');
    expect(texErrorMessage(['! LaTeX Error: File `nosuch.sty\' not found.', ''], 0)).toBe('LaTeX Error: File `nosuch.sty\' not found.');
    // another package's (name) lines are not this error's
    expect(texErrorMessage(['! Package foo Error: Bad.', '(bar)                Other.'], 0)).toBe('Package foo Error: Bad.');
  });
});
