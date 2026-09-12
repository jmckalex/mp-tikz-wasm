/**
 * Diagnostics parser tests. The fixtures in test/unit/fixtures/metapost-logs
 * are real MetaPost 2.11 (TeX Live 2025) output: `<case>.mp` is the input,
 * `<case>.term.txt` the terminal output of `mpost -interaction=nonstopmode`
 * (no help text) and `<case>.log.txt` the transcript (with help text).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseMetaPostLog } from '../../src/ts/diagnostics.js';
import { repoRoot } from './oracle.js';

const dir = join(repoRoot, 'test', 'unit', 'fixtures', 'metapost-logs');
const term = (name: string): string => readFileSync(join(dir, `${name}.term.txt`), 'utf8');
const log = (name: string): string => readFileSync(join(dir, `${name}.log.txt`), 'utf8');

describe('parseMetaPostLog on real terminal output', () => {
  it('undefined-coordinate: four errors on line 1 with exact columns and file', () => {
    const d = parseMetaPostLog(term('undefined-coordinate'));
    expect(d).toHaveLength(4);
    expect(d.map((x) => x.message)).toEqual([
      'Undefined x coordinate has been replaced by 0.',
      'Undefined y coordinate has been replaced by 0.',
      'Undefined x coordinate has been replaced by 0.',
      'Undefined y coordinate has been replaced by 0.',
    ]);
    expect(d.every((x) => x.severity === 'error' && x.source === 'metapost')).toBe(true);
    expect(d.every((x) => x.file === './undefined-coordinate.mp' && x.line === 1)).toBe(true);
    // "l.1 beginfig(1); draw z1--" -> the error point is after 22 characters
    expect(d.map((x) => x.column)).toEqual([22, 22, 25, 25]);
    // terminal output carries no help text
    expect(d.every((x) => x.help === undefined)).toBe(true);
    expect(d[0].context).toEqual([
      '>> x1',
      '<to be read again> ',
      '                   {',
      '--->{',
      '     curl1}..{curl1}',
      'l.1 beginfig(1); draw z1--',
      '                          z2; endfig; end.',
    ]);
  });

  it('unknown-transform: one error, with the >> value line in its context', () => {
    const d = parseMetaPostLog(term('unknown-transform'));
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({
      severity: 'error',
      message: "Transform components aren't all known.",
      file: './unknown-transform.mp',
      line: 2,
      column: 41,
    });
    expect(d[0].context?.[0]).toBe('>> (0,0,50withcolour.red,0,0,50withcolour.red)');
  });

  it('missing-input-file: the open failure and the Emergency stop, both on line 2', () => {
    const d = parseMetaPostLog(term('missing-input-file'));
    expect(d.map((x) => [x.message, x.file, x.line, x.column])).toEqual([
      ["I can't open file `nonexistent'.", './missing-input-file.mp', 2, 17],
      ['Emergency stop.', './missing-input-file.mp', 2, 17],
    ]);
    // the "Please type another input file name" prompt is not help text
    expect(d[0].help).toBeUndefined();
  });

  it('no-end: Emergency stop from the terminal level has no line number', () => {
    const d = parseMetaPostLog(term('no-end'));
    expect(d).toHaveLength(1);
    expect(d[0].message).toBe('Emergency stop.');
    expect(d[0].line).toBeUndefined();
    expect(d[0].context).toEqual(['<*> no-end.mp', ' '.repeat('<*> no-end.mp'.length)]);
    // the file was closed with ")" before the error, so the stack is empty
    expect(d[0].file).toBeUndefined();
  });

  it('nested-input: errors inside an input-ed file are attributed to it', () => {
    const d = parseMetaPostLog(term('nested-input'));
    expect(d).toHaveLength(5);
    expect(d.slice(0, 4).every((x) => x.file === './sub.mp' && x.line === 3)).toBe(true);
    expect(d[4]).toMatchObject({
      message: "An expression can't begin with `right delimiter'.",
      file: './nested-input.mp',
      line: 6,
      column: 23,
    });
    // the macro context lines were consumed as context, not as help
    expect(d[0].context).toContain('foo->draw.z9--');
    expect(d[0].help).toBeUndefined();
  });

  it('infont-string: two errors, the second with a two-line macro context', () => {
    const d = parseMetaPostLog(term('infont-string'));
    expect(d.map((x) => x.message)).toEqual(['Not implemented: (picture)infont(string).', "Improper `addto'."]);
    expect(d[1].context).toContain('draw->...:also(EXPR0)else:doublepath(EXPR0)withpen');
    expect(d[1].line).toBe(2);
  });

  it('inconsistent-equation: an error with no <to be read again> still gets its l.N line', () => {
    const d = parseMetaPostLog(term('inconsistent-equation'));
    expect(d.map((x) => [x.message, x.line])).toEqual([
      ['Inconsistent equation (off by 1).', 2],
      ['Division by zero.', 3],
      ['Equation cannot be performed (unknown string=numeric).', 4],
    ]);
    expect(d[1].context).toEqual(['l.3 numeric a; a := 1/0', '                       ;']);
    expect(d[1].column).toBe(19);
  });

  it('long-line: a "..."-truncated context yields no column', () => {
    const d = parseMetaPostLog(term('long-line'));
    expect(d).toHaveLength(1);
    expect(d[0].line).toBe(2);
    expect(d[0].column).toBeUndefined();
  });
});

describe('parseMetaPostLog on transcript (.log) output', () => {
  it('captures the help paragraph and the same locations', () => {
    const d = parseMetaPostLog(log('undefined-coordinate'));
    expect(d).toHaveLength(4);
    expect(d[0].help).toEqual([
      "I need a `known' x value for this part of the path.",
      'The value I found (see above) was no good;',
      "so I'll try to keep going by using zero instead.",
      '(Chapter 27 of The METAFONTbook explains that',
      "you might want to type `I ???' now.)",
    ]);
    expect(d.map((x) => [x.line, x.column])).toEqual([[1, 22], [1, 22], [1, 25], [1, 25]]);
    expect(d.every((x) => x.file === './undefined-coordinate.mp')).toBe(true);
  });

  it('fatal errors carry the *** reason as help', () => {
    const d = parseMetaPostLog(log('no-end'));
    expect(d).toHaveLength(1);
    expect(d[0].message).toBe('Emergency stop.');
    expect(d[0].help).toEqual(['*** (job aborted, no legal end found)']);
    const m = parseMetaPostLog(log('missing-input-file'));
    expect(m.map((x) => x.message)).toEqual(["I can't open file `nonexistent'.", 'Emergency stop.']);
    expect(m[1].help).toEqual(['*** (job aborted, file error in nonstop mode)']);
  });

  it('all fixtures parse to the same messages from .term and .log', () => {
    for (const name of ['undefined-coordinate', 'unknown-transform', 'missing-input-file', 'no-end', 'nested-input', 'infont-string', 'inconsistent-equation', 'long-line']) {
      const a = parseMetaPostLog(term(name)).map((x) => [x.message, x.file, x.line, x.column]);
      const b = parseMetaPostLog(log(name)).map((x) => [x.message, x.file, x.line, x.column]);
      expect(b, name).toEqual(a);
    }
  });

  it('help text in the long-line transcript ends at the blank line', () => {
    const d = parseMetaPostLog(log('long-line'));
    expect(d[0].help).toHaveLength(4);
    expect(d[0].help?.[3]).toBe('see Chapter 27 of The METAFONTbook for an example.');
  });
});

describe('parseMetaPostLog on synthetic mplib output', () => {
  it('parses Warning: lines as warnings attributed to the current file', () => {
    const out = '(./job.mp\nWarning: nonexistant glyph requested\n[1] )\n';
    expect(parseMetaPostLog(out)).toEqual([
      { severity: 'warning', source: 'metapost', message: 'nonexistant glyph requested', file: './job.mp' },
    ]);
  });

  it('parses file_line_error_style messages', () => {
    const out = '(./job.mp\n./job.mp:4: Undefined x coordinate has been replaced by 0.\n<to be read again> \n                   ;\nl.4 draw z1--z2;\n                \n[1] )\n';
    const d = parseMetaPostLog(out);
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ severity: 'error', message: 'Undefined x coordinate has been replaced by 0.', file: './job.mp', line: 4, column: 12 });
  });

  it('a bare *** line is a fatal error', () => {
    const d = parseMetaPostLog('(./job.mp\n*** (job aborted, no legal end found)\n');
    expect(d).toEqual([{ severity: 'error', source: 'metapost', message: '*** (job aborted, no legal end found)', file: './job.mp' }]);
  });

  it('handles several consecutive errors and a multi-page figure line', () => {
    const out = ['(./a.mp (./b.mp', '! One.', 'l.1 x', '     y', '! Two.', 'l.2 z', '      ', ') [1] [2])', '! Three.', '<*> input a', '           ', ''].join('\n');
    const d = parseMetaPostLog(out);
    expect(d.map((x) => [x.message, x.file, x.line])).toEqual([
      ['One.', './b.mp', 1],
      ['Two.', './b.mp', 2],
      ['Three.', undefined, undefined],
    ]);
  });

  it('is empty for clean output and tolerates CRLF', () => {
    expect(parseMetaPostLog('')).toEqual([]);
    expect(parseMetaPostLog('(./job.mp [1] )\r\n1 output file written: job.1\r\n')).toEqual([]);
    const d = parseMetaPostLog('(./j.mp\r\n! Oops.\r\nl.3 ab\r\n      cd\r\n');
    expect(d[0]).toMatchObject({ message: 'Oops.', file: './j.mp', line: 3, column: 2 });
  });
});
