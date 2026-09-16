/**
 * prerender.ts — `mpost-wasm --prerender`: typeset the diagram elements of
 * HTML pages in Node and save each result as figure-HASH.svg, the file the
 * drop-in tags look for when the loader carries data-figures (auto.ts,
 * figures.ts). A page whose figures are all saved loads them as small static
 * files and never starts the engines in the visitor's browser.
 *
 * For each page the figures go to the directory its loader names in
 * data-figures (default `figures/`), resolved against the page, unless a
 * directory is given for all of them. A file that already exists is kept —
 * the name is the content, so it is current — unless `force` is set. The
 * engine is created with the browser's defaults (deterministic, seed 42) so
 * the bytes are the ones the tags would have produced.
 */
import fs from 'node:fs';
import path from 'node:path';
import { MetaPost } from './index.js';
import type { MetaPostOptions } from './types.js';
import { extractFigures, figureHash, figureName, loaderAttributes, renderFigure } from './figures.js';
import type { FigureKind, FigureRequest } from './figures.js';

export interface PrerenderOptions {
  /** Write every page's figures here instead of the directory each page names. */
  figuresDir?: string;
  /** Re-render figures whose file exists. */
  force?: boolean;
  /** Report what would be rendered and write nothing. */
  dryRun?: boolean;
  /** An engine to use (disposed by the caller); otherwise one is created with `createOptions` and disposed. */
  mp?: MetaPost;
  createOptions?: MetaPostOptions;
  /** One line per figure as it is decided (default: nothing). */
  report?: (line: string) => void;
}

export type PrerenderStatus = 'rendered' | 'exists' | 'failed' | 'pending';
export interface PrerenderEntry {
  page: string; file: string; name: string; hash: string; kind: FigureKind; status: PrerenderStatus;
  ms?: number; diagnostics?: { severity: string; message: string; line?: number }[];
}
export interface PrerenderSummary { entries: PrerenderEntry[]; rendered: number; existing: number; failed: number }

/** The figures a page needs, with the directory they belong in. */
export function planPage(page: string, figuresDir?: string): { dir: string; figures: (FigureRequest & { hash: string; name: string })[] } {
  const html = fs.readFileSync(page, 'utf8');
  const named = loaderAttributes(html).figures;
  const dir = figuresDir ?? path.resolve(path.dirname(page), named && named !== 'off' ? named : 'figures');
  const figures = extractFigures(html).map((f) => { const hash = figureHash(f); return { ...f, hash, name: figureName(hash) }; });
  return { dir, figures };
}

export async function prerender(pages: string[], opts: PrerenderOptions = {}): Promise<PrerenderSummary> {
  const report = opts.report ?? (() => {});
  const entries: PrerenderEntry[] = [];
  const seen = new Set<string>();
  const todo: { entry: PrerenderEntry; req: FigureRequest }[] = [];
  for (const page of pages) {
    const { dir, figures } = planPage(page, opts.figuresDir);
    for (const f of figures) {
      const file = path.join(dir, f.name);
      if (seen.has(file)) continue;   // the same figure on two pages (or twice on one) is one file
      seen.add(file);
      const entry: PrerenderEntry = { page, file, name: f.name, hash: f.hash, kind: f.kind, status: 'pending' };
      entries.push(entry);
      if (!opts.force && fs.existsSync(file)) { entry.status = 'exists'; report(line(entry)); continue; }
      todo.push({ entry, req: { kind: f.kind, source: f.source, attrs: f.attrs } });
    }
  }
  if (opts.dryRun) {
    for (const { entry } of todo) report(line(entry));
  } else if (todo.length) {
    const own = !opts.mp;
    const mp = opts.mp ?? await MetaPost.create({ logLevel: 'warn', ...opts.createOptions });
    try {
      for (const { entry, req } of todo) {
        const r = await renderFigure(mp, req, entry.hash);
        entry.ms = r.ms;
        if (r.ok) {
          fs.mkdirSync(path.dirname(entry.file), { recursive: true });
          fs.writeFileSync(entry.file, r.svg);
          entry.status = 'rendered';
        } else {
          entry.status = 'failed';
          entry.diagnostics = r.diagnostics;
        }
        report(line(entry));
      }
    } finally {
      if (own) mp.dispose();
    }
  }
  const count = (s: PrerenderStatus) => entries.filter((e) => e.status === s).length;
  return { entries, rendered: count('rendered'), existing: count('exists'), failed: count('failed') };
}

/** `figures/figure-abc123.svg  tikz      rendered  312 ms  (tags.html)`, diagnostics indented under a failure. */
export function line(e: PrerenderEntry): string {
  const rel = path.relative(process.cwd(), e.file) || e.file;
  const status = e.status === 'pending' ? 'to render' : e.status;
  const ms = e.ms !== undefined ? `  ${Math.round(e.ms)} ms` : '';
  let s = `${rel}  ${e.kind.padEnd(8)}  ${status.padEnd(9)}${ms}  (${path.basename(e.page)})`;
  for (const d of e.diagnostics ?? []) s += `\n    ${d.severity}: ${d.message}${d.line ? ` (line ${d.line})` : ''}`;
  return s;
}
