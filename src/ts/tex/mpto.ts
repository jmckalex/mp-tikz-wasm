/**
 * mpto.ts — builds the batched TeX job from scanned blocks (docs/05 §3.1, §4).
 *
 * `buildTexJob` reproduces byte for byte the file that upstream `mpx_mpto`
 * (texk/web2c/mplibdir/mpxout.w) writes for the same input. The string
 * tables below are copied verbatim from mpxout.w — including their printf
 * escapes, which `cfmt` interprets — so a future upstream change can be
 * diffed against them directly.
 */
import type { TexBlock } from './scanner.js';

export type MptoMode = 'tex' | 'troff';

/**
 * How the C library rendered the malformed conversion `%\n` that upstream's
 * `mpx_pretex1` contains twice (`\bgroup%\n` and `\bgroup}%\n` — a printf
 * format with `%` followed by a newline). The C standard leaves it undefined
 * and libcs differ, so `mpost` binaries differ too:
 *
 *  - `glibc` (Linux): `printf_unknown` prints the spec verbatim, so the `%`
 *    survives as the TeX comment the author intended. The default.
 *  - `bsd` (Apple libc, FreeBSD): "pretend it was %c with argument ch", so
 *    the `%` vanishes and only the newline is printed.
 *  - musl (Emscripten's libc) rejects the format and prints *nothing* for
 *    that fprintf — the whole prologue and the first `\mpxshipout% line`
 *    are missing — which is why the wasm build must not call the C mpto.
 *
 * TeX skips the end-of-line space after the control word `\bgroup`, so the
 * DVI and the .mpx are identical for both renderings.
 */
export type PrintfLibc = 'glibc' | 'bsd';

export interface BuildTexJobOptions {
  /** TeX (default) or troff output. Index 0 / 1 of the string tables. */
  mode?: MptoMode;
  /** Contents of the MPTEXPRE file (docs/05 §9); prepended as-is in TeX mode
   * only, exactly as upstream copies the file — no newline is added. */
  mptexpre?: string;
  /** Which libc's rendering of the `%\n` quirk to reproduce; default 'glibc'. */
  libc?: PrintfLibc;
}

/* ---- static strings for mpto, verbatim from mpxout.w -------------------- */
const mpx_predoc = ['', '.po 0\n'];
const mpx_postdoc = ['\\end{document}\n', ''];
const mpx_pretex1 = [
  '\\gdef\\mpxshipout{\\shipout\\hbox\\bgroup%\n' +
    '  \\setbox0=\\hbox\\bgroup}%\n' +
    '\\gdef\\stopmpxshipout{\\egroup' +
    '  \\dimen0=\\ht0 \\advance\\dimen0\\dp0\n' +
    '  \\dimen1=\\ht0 \\dimen2=\\dp0\n' +
    '  \\setbox0=\\hbox\\bgroup\n' +
    '    \\box0\n' +
    '    \\ifnum\\dimen0>0 \\vrule width1sp height\\dimen1 depth\\dimen2 \n' +
    '    \\else \\vrule width1sp height1sp depth0sp\\relax\n' +
    '    \\fi\\egroup\n' +
    '  \\ht0=0pt \\dp0=0pt \\box0 \\egroup}\n' +
    '\\mpxshipout%% line %d %s\n',
  '.lf %d %s\n',
];
const mpx_pretex = ['\\mpxshipout%% line %d %s\n', '.bp\n.lf %d %s\n'];
const mpx_posttex = ['\n\\stopmpxshipout\n', '\n'];
const mpx_preverb1 = ['', '.lf %d %s\n']; /* if very first instance */
const mpx_preverb = ['%% line %d %s\n', '.lf %d %s\n']; /* all other instances */
const mpx_postverb = ['\n', '\n'];

/** The subset of printf that the tables use: `%%`, `%d`, `%s` — plus the
 * malformed `%\n`, rendered the way the chosen libc renders it. */
function cfmt(fmt: string, line: number, file: string, libc: PrintfLibc): string {
  let out = '';
  for (let i = 0; i < fmt.length; i++) {
    const c = fmt[i];
    if (c !== '%') {
      out += c;
      continue;
    }
    const d = fmt[++i];
    if (d === '%') out += '%';
    else if (d === 'd') out += String(line);
    else if (d === 's') out += file;
    else if (d === undefined) throw new Error('cfmt: format ends with %');
    else out += libc === 'bsd' ? d : '%' + d; // unknown conversion (see PrintfLibc)
  }
  return out;
}

/**
 * mpto's "put no % at end if it's only 1 line total, starting with %" rule
 * (the `%&format` special case): after trimming, a btex body gets a `%`
 * appended unless it is a single line that begins with `%`. An empty body
 * gets one too.
 */
export function needsPercent(body: string): boolean {
  return body.length === 0 || body.includes('\n') || body[0] !== '%';
}

/**
 * Emit the TeX (or troff) job for `blocks`, in source order. Blocks may come
 * from several files (their `file` and `line` are used for the
 * `% line N file` wrapper comments); the "first btex" / "first verbatimtex"
 * bookkeeping is per job, as it is per mpto run upstream.
 */
export function buildTexJob(blocks: readonly TexBlock[], options: BuildTexJobOptions = {}): string {
  const m = options.mode === 'troff' ? 1 : 0;
  const libc = options.libc ?? 'glibc';
  let out = '';
  if (m === 0 && options.mptexpre !== undefined) out += options.mptexpre;
  out += mpx_predoc[m];
  let texcnt = 0;
  let verbcnt = 0;
  for (const b of blocks) {
    if (b.kind === 'btex') {
      out += cfmt(texcnt++ === 0 ? mpx_pretex1[m] : mpx_pretex[m], b.line, b.file, libc);
      if (b.error === undefined) {
        out += b.body;
        if (m === 0 && needsPercent(b.body)) out += '%';
      }
      out += mpx_posttex[m];
    } else {
      out += cfmt(verbcnt++ === 0 && texcnt === 0 ? mpx_preverb1[m] : mpx_preverb[m], b.line, b.file, libc);
      if (b.error === undefined) out += b.body;
      out += mpx_postverb[m];
    }
  }
  out += mpx_postdoc[m];
  return out;
}

/**
 * DVI page `pageIndex` (0-based) was produced by the `pageIndex`-th `btex`
 * block of the job: every btex block ships out exactly one page, in source
 * order, and verbatimtex blocks ship nothing (docs/05 §3.1). Blocks that
 * mpto flagged with an error still get a (blank) page. Returns undefined
 * when the DVI has more pages than the job has btex blocks.
 */
export function blockForPage(blocks: readonly TexBlock[], pageIndex: number): TexBlock | undefined {
  if (pageIndex < 0 || !Number.isInteger(pageIndex)) return undefined;
  let k = 0;
  for (const b of blocks) {
    if (b.kind !== 'btex') continue;
    if (k === pageIndex) return b;
    k++;
  }
  return undefined;
}
