/**
 * scanner.ts — a faithful TypeScript port of upstream mpto's lexer
 * (`mpx_getline`, `mpx_match_str`, `mpx_getbta`, `mpx_copy_mpto` and the
 * "Do a line" loop of `mpx_mpto` in texk/web2c/mplibdir/mpxout.w).
 *
 * The port exists so that the TeX bridge (docs/05 §3) can find `btex` /
 * `verbatimtex` blocks without writing temporaries, and so that
 * `buildTexJob(scanTexBlocks(src))` (src/ts/tex/mpto.ts) reproduces the .tex
 * file that C `mpx_mpto` writes byte for byte. Where the C and this file
 * disagree, the C is right; test/unit/scanner.test.ts diffs the two.
 *
 * Dependency-free and browser-safe: no Node imports.
 */

export interface TexBlock {
  kind: 'btex' | 'verbatimtex';
  /**
   * The block text exactly as mpto emits it between its wrapper lines:
   * for `btex` leading and trailing whitespace is stripped; for the first
   * `verbatimtex` block of a file only leading whitespace is stripped; later
   * `verbatimtex` blocks are untouched. Line ends are normalised to "\n".
   * The `%` that mpto appends to a `btex` body in TeX mode is NOT part of
   * `body` (see `needsPercent` in mpto.ts) so the same block can be rendered
   * in troff mode too.
   */
  body: string;
  /** 1-based line of the opening keyword, counted the way mpto counts. */
  line: number;
  /** The file name the block was scanned from (used in `% line N file`). */
  file: string;
  /** Position of this block in source order, 0-based, counting both kinds. */
  index: number;
  /**
   * The untrimmed text mpto accumulated for the block (its `res` buffer),
   * before whitespace handling. Kept for callers that need the raw form.
   */
  raw: string;
  /**
   * Set when mpto would report an error for this block ("btex in TeX mode",
   * "verbatimtex in TeX mode", "btex section does not end"). mpto still
   * writes the wrapper lines for such a block but no body at all — not even
   * the `%` — and `buildTexJob` reproduces that.
   */
  error?: string;
}

export interface ScanError {
  message: string;
  /** mpto's line counter at the time of the error (1-based). */
  line: number;
  file: string;
}

export interface ScanResult {
  blocks: TexBlock[];
  /** Every "makempx error:" mpto would print, in order. */
  errors: ScanError[];
}

const B_TEX = 2;
const VERBATIM_TEX = 1;
const FIRST_VERBATIM_TEX = 3;

/** Letters and underscore — the only characters that glue a token together. */
function isAlpha(c: string | undefined): boolean {
  return c !== undefined && ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_');
}

/** Port of `mpx_match_str`: `t` is a prefix of `s` at `i` and the following
 * character is not a letter or underscore (digits and punctuation are fine,
 * so `btex1etex` contains two tokens). */
function matchStr(s: string, i: number, t: string): boolean {
  return s.startsWith(t, i) && !isAlpha(s[i + t.length]);
}

/** The result of `mpx_getbta`: token start `tt`, the position after it `aa`,
 * and the token's first character (`"`, `%`, `b`, `e` or `v`). */
interface Bta {
  tt: number;
  aa: number;
  ch: string;
}

/** Port of `mpx_getbta`. Scans `s` from `from` for the leftmost token, which
 * is a quote mark, a percent sign, or one of the words btex/etex/verbatimtex
 * bounded by non-letters. Returns null (mpto: `aa = tt = end of string`)
 * when there is none. */
function getbta(s: string, from: number): Bta | null {
  let ok = true; // false if the previous character was a letter or underscore
  for (let tt = from; tt < s.length; tt++) {
    const c = s[tt];
    switch (c) {
      case '"':
      case '%':
        return { tt, aa: tt + 1, ch: c };
      case 'b':
        if (ok && matchStr(s, tt, 'btex')) return { tt, aa: tt + 4, ch: c };
        ok = false;
        break;
      case 'e':
        if (ok && matchStr(s, tt, 'etex')) return { tt, aa: tt + 4, ch: c };
        ok = false;
        break;
      case 'v':
        if (ok && matchStr(s, tt, 'verbatimtex')) return { tt, aa: tt + 11, ch: c };
        ok = false;
        break;
      default:
        ok = !isAlpha(c);
    }
  }
  return null;
}

/**
 * Port of `mpx_getline` over an in-memory string, including its stdio
 * quirks: a line ends at "\n", "\r" or "\r\n"; a file that ends with a
 * newline yields one extra empty line before EOF (getc returns EOF only on
 * the next read), while a file ending in a bare "\r" does not; and because
 * the C buffer is NUL-terminated, a line is cut at its first NUL byte.
 */
class LineReader {
  private pos = 0;
  private eof = false;
  /** mpto's `lnno`: number of lines read so far. */
  lnno = 0;

  constructor(private readonly src: string) {}

  getline(): string | null {
    if (this.eof) return null;
    const s = this.src;
    const n = s.length;
    const start = this.pos;
    let end: number;
    let c = '';
    for (;;) {
      if (this.pos >= n) {
        this.eof = true; // getc returned EOF: the stream's EOF indicator is set
        end = this.pos;
        break;
      }
      c = s[this.pos++];
      if (c === '\n' || c === '\r') {
        end = this.pos - 1;
        break;
      }
    }
    if (c === '\r') {
      if (this.pos >= n) this.eof = true; // getc → EOF; ungetc(EOF) is a no-op
      else if (s[this.pos] === '\n') this.pos++;
    }
    this.lnno++;
    let line = s.slice(start, end);
    const nul = line.indexOf('\0');
    if (nul >= 0) line = line.slice(0, nul);
    return line;
  }
}

/**
 * Scan MetaPost source for `btex ... etex` and `verbatimtex ... etex` blocks
 * exactly as upstream mpto does, and report the errors mpto would report.
 *
 * One deliberate deviation: on an unterminated string literal upstream
 * `mpx_mpto` loops forever printing "string does not end" (its do/while
 * never advances once `mpx_getbta` has reached the end of the line). This
 * port reports the error once and treats the rest of the line as the string.
 */
export function scanTex(source: string, fileName: string): ScanResult {
  const rd = new LineReader(source);
  const blocks: TexBlock[] = [];
  const errors: ScanError[] = [];
  let verbatimWritten = false;

  // The scanner state mpto keeps in `mpx->buf` / `mpx->aa`: the current line
  // and the index from which the next token search starts (null ⇔ aa == NULL).
  let cur = '';
  let aa: number | null = null;

  const error = (message: string): void => {
    errors.push({ message, line: rd.lnno, file: fileName });
  };

  /** Port of `mpx_copy_mpto`. Accumulates text up to the matching `etex`. */
  function copyMpto(textype: number): { raw: string; body: string; error?: string } {
    let res = '';
    let ttch: string | null = null;
    do {
      if (aa === null || aa >= cur.length) {
        const l = rd.getline();
        if (l === null) {
          error('btex section does not end');
          aa = null;
          return { raw: res, body: '', error: 'btex section does not end' };
        }
        cur = l;
        aa = 0;
      }
      const bb = aa;
      const r = getbta(cur, aa);
      let s: number;
      if (r !== null && r.ch === 'e') {
        s = r.tt;
        aa = r.aa;
        ttch = 'e';
      } else if (r === null) {
        s = cur.length; // aa = tt = end of the line
        aa = cur.length;
        ttch = null;
      } else if (r.ch === 'b') {
        error('btex in TeX mode');
        aa = r.aa;
        return { raw: res, body: '', error: 'btex in TeX mode' };
      } else if (r.ch === 'v') {
        error('verbatimtex in TeX mode');
        aa = r.aa;
        return { raw: res, body: '', error: 'verbatimtex in TeX mode' };
      } else {
        // a quote mark or percent sign inside the block is ordinary text
        s = r.aa;
        aa = r.aa;
        ttch = r.ch;
      }
      res += cur.slice(bb, s);
      if (s === cur.length) res += '\n'; // C: `if (c == '\0') strcat(res, "\n")`
    } while (ttch !== 'e');

    let body = res;
    if (textype === B_TEX) body = body.replace(/[ \t\r\n]+$/, '');
    if (textype === B_TEX || textype === FIRST_VERBATIM_TEX) body = body.replace(/^[ \t\r\n]+/, '');
    return { raw: res, body };
  }

  let line: string | null;
  while ((line = rd.getline()) !== null) {
    // @<Do a line@>
    cur = line;
    aa = 0;
    for (;;) {
      if (aa === null) break;
      const r = getbta(cur, aa);
      if (r === null) break;
      if (r.ch === '%') {
        break; // the rest of the line is a comment
      } else if (r.ch === '"') {
        aa = r.aa;
        for (;;) {
          const q = getbta(cur, aa);
          if (q === null) {
            error('string does not end'); // upstream loops forever here
            aa = cur.length;
            break;
          }
          aa = q.aa;
          if (q.ch === '"') break;
        }
      } else if (r.ch === 'b') {
        const ln = rd.lnno;
        aa = r.aa;
        const c = copyMpto(B_TEX);
        const block: TexBlock = { kind: 'btex', body: c.body, line: ln, file: fileName, index: blocks.length, raw: c.raw };
        if (c.error !== undefined) block.error = c.error;
        blocks.push(block);
      } else if (r.ch === 'v') {
        const ln = rd.lnno;
        aa = r.aa;
        const c = copyMpto(verbatimWritten ? VERBATIM_TEX : FIRST_VERBATIM_TEX);
        verbatimWritten = true;
        const block: TexBlock = { kind: 'verbatimtex', body: c.body, line: ln, file: fileName, index: blocks.length, raw: c.raw };
        if (c.error !== undefined) block.error = c.error;
        blocks.push(block);
      } else {
        error('unmatched etex');
        aa = r.aa;
      }
    }
  }
  return { blocks, errors };
}

/** The blocks of `scanTex`, for callers that do not need the error list. */
export function scanTexBlocks(source: string, fileName: string): TexBlock[] {
  return scanTex(source, fileName).blocks;
}

/**
 * Find the file names referenced by `input name` / `input "name"` statements
 * (docs/05 §3.2). Lexical only: comments, string literals and the inside of
 * btex/verbatimtex blocks are skipped, `input` must be a whole symbolic
 * token, and the name is delimited the way `mp_scan_file_name` delimits it —
 * it ends at a space, tab, `;`, `%` or end of line unless inside quotes, and
 * the quotes themselves are not part of the name. Names are returned as
 * written, in order, without deduplication; `scantokens`-built inputs are
 * invisible to this function by design.
 */
export function scanInputs(source: string): string[] {
  const names: string[] = [];
  const rd = new LineReader(source);
  let inTex = false; // inside btex/verbatimtex ... etex
  let line: string | null;
  while ((line = rd.getline()) !== null) {
    let i = 0;
    let ok = true;
    while (i < line.length) {
      const c = line[i];
      if (inTex) {
        // mpto's rule for finding the closing etex: bounded by non-letters,
        // with quotes and percent signs being ordinary text.
        if (c === 'e' && ok && matchStr(line, i, 'etex')) {
          inTex = false;
          i += 4;
          ok = true;
          continue;
        }
        ok = !isAlpha(c);
        i++;
        continue;
      }
      if (c === '%') break;
      if (c === '"') {
        const j = line.indexOf('"', i + 1);
        if (j < 0) break; // unterminated string: nothing more on this line counts
        i = j + 1;
        ok = true;
        continue;
      }
      if (ok && (c === 'b' || c === 'v') && (matchStr(line, i, 'btex') || matchStr(line, i, 'verbatimtex'))) {
        inTex = true;
        i += c === 'b' ? 4 : 11;
        ok = true;
        continue;
      }
      if (ok && c === 'i' && matchStr(line, i, 'input')) {
        let k = i + 5;
        while (line[k] === ' ') k++;
        let name = '';
        let quoted = false;
        for (; k < line.length; k++) {
          const d = line[k];
          if (!quoted && (d === ';' || d === '%')) break;
          if (d === '"') {
            quoted = !quoted;
          } else if ((d === ' ' || d === '\t') && !quoted) {
            break;
          } else {
            name += d;
          }
        }
        if (name.length > 0) names.push(name);
        i = k;
        ok = true;
        continue;
      }
      ok = !isAlpha(c);
      i++;
    }
  }
  return names;
}
