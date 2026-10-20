/**
 * texutils.ts — what BibTeX's .blg and makeindex's .ilg say, as diagnostics.
 * The programs themselves are bibtex.wasm and makeindex.wasm, run by core.ts
 * through texengine.ts's runTex like any TeX engine.
 */
import type { Diagnostic } from './types.js';

/**
 * BibTeX's transcript. A warning is `Warning--...`, sometimes followed by
 * `--line N of file F`; an error names its place after three dashes, on its own
 * line or the next one (`I couldn't open database file x.bib` / `---line 6 of file doc.aux`,
 * `Repeated entry---line 1 of file refs.bib`, `I found no style file---while reading file doc.aux`).
 */
export function parseBibtexLog(blg: string): Diagnostic[] {
  const out: Diagnostic[] = [];
  const lines = blg.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const w = /^Warning--(.*)$/.exec(l);
    if (w) {
      const d: Diagnostic = { severity: 'warning', source: 'bibtex', message: w[1] };
      const at = /^--line (\d+) of file (.+)$/.exec(lines[i + 1] ?? '');
      if (at) { d.line = Number(at[1]); d.file = at[2]; i++; }
      out.push(d);
      continue;
    }
    const e = /^(.*?)---(?:line (\d+) of file (.+)|while reading file (.+)|entry "([^"]*)")$/.exec(l);
    if (!e) continue;
    let message = e[1] || (lines[i - 1] ?? '');
    if (e[5] !== undefined) message = `${message} (entry "${e[5]}")${lines[i + 1] ? ` ${lines[++i]}` : ''}`;   // a bad cross reference: the reason is on the next line
    const d: Diagnostic = { severity: 'error', source: 'bibtex', message };
    if (e[2]) { d.line = Number(e[2]); d.file = e[3]; } else if (e[4]) d.file = e[4];
    out.push(d);
  }
  return out;
}

/**
 * makeindex's transcript: `!! Input index error (file = doc.idx, line = 40):` or
 * `## Warning (input = doc.idx, line = 39; output = doc.ind, line = 54):`, each
 * followed by `   -- message`; `!! Input style error` likewise for the .ist.
 */
export function parseMakeindexLog(ilg: string): Diagnostic[] {
  const out: Diagnostic[] = [];
  const lines = ilg.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = /^(!!|##) (.*?) \((?:file|input) = ([^,;]+), line = (\d+)[;)]/.exec(lines[i]);
    if (!m) continue;
    const text = /^\s*-- (.*)$/.exec(lines[i + 1] ?? '');
    if (text) i++;
    out.push({ severity: m[1] === '!!' ? 'error' : 'warning', source: 'makeindex', message: text ? text[1] : m[2], file: m[3], line: Number(m[4]) });
  }
  return out;
}
