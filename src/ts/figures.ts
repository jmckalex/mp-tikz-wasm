/**
 * figures.ts — a diagram element's identity and rendering, shared by the
 * drop-in tags (auto.ts) and the Node pre-renderer (prerender.ts, behind
 * `mpost-wasm --prerender`). Nothing here touches the DOM or Node's APIs.
 *
 * A figure is identified by `figureHash()`: six lowercase base-36 characters
 * of the SHA-256 of its kind, the attributes that change the output and the
 * wrapped document. The hash names the saved file (`figure-HASH.svg`), the
 * IndexedDB entry and the SVG id prefix (`mpwHASH-`), so a saved figure is
 * self-contained and drops into any page. The engine build is deliberately
 * left out: the hash identifies the source, and a saved file survives a
 * library upgrade (the output is byte-identical to TeX Live, so an upgrade
 * that changes it is a rare, deliberate event — re-run the pre-renderer with
 * --force). Two figures collide only if six characters of their digests
 * agree, which for a page of figures is a chance of about one in a million.
 */
import type { MetaPost } from './index.js';
import type { LatexRunOptions, LatexResult, MetaPostOptions, RunResult } from './types.js';
import { sha256 } from './tex/cache-key.js';

export type FigureKind = 'tikz' | 'metapost';

/** What a diagram element contributes: its kind, its text and its attributes (`data-` stripped). */
export interface FigureRequest { kind: FigureKind; source: string; attrs: Record<string, string> }
/** ms is the engine's own time for this figure (queueing and engine start-up excluded). */
export interface FigureResult { svg: string; log: string; diagnostics: { severity: string; message: string; line?: number }[]; ok: boolean; ms: number }
/** A rendered figure as the tags keep it for `saveFigures()`. */
export interface SavedFigure { name: string; hash: string; kind: FigureKind; source: string; svg: string }

/** Is this TikZ text a complete document (LaTeX with \documentclass, or plain TeX ending in \bye) rather than a body to wrap? */
export function isCompleteDocument(source: string): boolean {
  return /\\documentclass|\\bye\b/.test(source);
}

/** Wrap a TikZ body in a standalone document unless it already is one. */
export function wrapTikz(source: string, attrs: Record<string, string> = {}): string {
  if (isCompleteDocument(source)) return source;
  const libs = (attrs.libraries ?? '').split(/[,\s]+/).filter(Boolean);
  const gd = (attrs.gdlibraries ?? '').split(/[,\s]+/).filter(Boolean);
  // graph drawing is used through \graph, which the graphs library provides
  for (const l of ['graphs', 'graphdrawing']) if (gd.length && !libs.includes(l)) libs.push(l);
  const pkgs = (attrs.packages ?? '').split(/[,\s]+/).filter(Boolean);
  const body = /\\begin\{tikzpicture\}|\\tikz\b|\\begin\{axis\}/.test(source) ? source : `\\begin{tikzpicture}\n${source}\n\\end{tikzpicture}`;
  return [
    `\\documentclass[tikz,border=${attrs.border ?? '2pt'}]{standalone}`,
    ...(pkgs.length ? [`\\usepackage{${pkgs.join(',')}}`] : []),
    ...(libs.length ? [`\\usetikzlibrary{${libs.join(',')}}`] : []),
    ...(gd.length ? [`\\usegdlibrary{${gd.join(',')}}`] : []),
    ...(attrs.preamble ? [attrs.preamble] : []),
    '\\begin{document}',
    body,
    '\\end{document}',
  ].join('\n');
}

/**
 * Wrap a MetaPost body in one figure unless it already has beginfig/endfig.
 * `input` statements are hoisted out of the figure: `input boxes` inside a
 * figure group makes MetaPost (native mpost too) recurse until its input stack
 * overflows, and macro packages are meant to be loaded at top level anyway.
 */
export function wrapMetaPost(source: string, attrs: Record<string, string> = {}): string {
  const prologues = attrs.prologues ?? '3';
  if (/\bbeginfig\s*\(/.test(source)) return `prologues:=${prologues};\n${source}`;
  const inputs: string[] = [];
  const body = source.split('\n').filter((line) => {
    const m = /^\s*(input\s+[^;%]+;?)\s*(%.*)?$/.exec(line);
    if (m) { inputs.push(m[1].endsWith(';') ? m[1] : m[1] + ';'); return false; }
    return true;
  }).join('\n');
  return `prologues:=${prologues};\n${inputs.join('\n')}${inputs.length ? '\n' : ''}beginfig(1);\n${body}\nendfig;\nend.`;
}

/** The document the engines are given for an element. */
export function figureDocument(req: FigureRequest): string {
  return req.kind === 'tikz' ? wrapTikz(req.source, req.attrs) : wrapMetaPost(req.source, req.attrs);
}

const HASH_SPACE = 2176782336n;   // 36^6

/** Six lowercase base-36 characters identifying a figure (see the header). */
export function figureHash(req: FigureRequest): string {
  const a = req.attrs;
  const d = sha256(new TextEncoder().encode(`${req.kind}\0${a.fonts ?? ''}\0${a.tex ?? ''}\0${a.engine ?? ''}\0${figureDocument(req)}`));
  let n = 0n;
  for (let i = 0; i < 8; i++) n = (n << 8n) | BigInt(d[i]);
  return (n % HASH_SPACE).toString(36).padStart(6, '0');
}

/** `figure-HASH.svg`. */
export function figureName(hash: string): string { return `figure-${hash}.svg`; }
/** Matches a saved figure's file name; group 1 is the hash. */
export const FIGURE_FILE = /^figure-([0-9a-z]{6})\.svg$/;

/** Does this text start like an SVG document (a server that answers every path with its index page does not)? */
export function isSvg(text: string): boolean {
  return /^\s*(?:<\?xml[^>]*\?>\s*)?(?:<!--[\s\S]*?-->\s*)*(?:<!DOCTYPE[^>]*>\s*)?<svg[\s>]/i.test(text);
}

/** Typeset one figure with the engine; the ids are prefixed with its hash so the SVG stands alone. */
export async function renderFigure(mp: MetaPost, req: FigureRequest, hash = figureHash(req)): Promise<FigureResult> {
  const doc = figureDocument(req);
  const idPrefix = `mpw${hash}-`;
  if (req.kind === 'tikz') {
    const engine = (req.attrs.engine as LatexRunOptions['engine']) ?? 'auto';
    // A wrapped body is a standalone page with a border, and the SVG must be
    // that page: dvisvgm's default box is the tight one PGF reports, which is
    // the page minus the border — and not always all of the ink. PGF's
    // classic arrow tips (`>=latex`, `stealth`, ...) declare no hull, so TikZ
    // leaves them out of its bounding box (TeX Live 2025); natively the
    // border is what keeps them on the page, and the tight crop cut them off
    // (a `->` on a horizontal line rendered as a line with no head).
    // `papersize` is the page standalone lays out, so the SVG is the PDF
    // page. A complete document keeps the default: an article is not a page.
    const bbox = isCompleteDocument(req.source) ? undefined : 'papersize';
    const r: LatexResult = await mp.latex(doc, { fonts: req.attrs.fonts === 'woff2' ? 'woff2' : 'paths', engine, bbox, svg: { idPrefix, precision: false } });
    return { svg: r.pages.join('\n'), log: r.log, diagnostics: r.diagnostics, ok: r.status === 'ok' && r.pages.length > 0, ms: r.stats.totalMs };
  }
  const tex = (req.attrs.tex ?? 'auto') as MetaPostOptions['tex'];
  const r: RunResult = await mp.run(doc, { format: 'svg', tex, svg: { idPrefix } });
  // several beginfig blocks give several <svg> roots joined by newlines: exactly what the tags inject
  return { svg: r.figures.map((f) => f.svg ?? '').join('\n'), log: r.log, diagnostics: r.diagnostics, ok: r.history < 2 && r.figures.length > 0, ms: r.stats.totalMs };
}

// ------------------------------------------------------- reading a page's HTML
// The pre-renderer sees the same elements the browser would, by a scan of the
// four tag forms rather than a full HTML parser: the elements hold text, not
// markup. Attribute values are entity-decoded as the parser decodes them;
// custom-element bodies are too (they are HTML text), script bodies are raw.

/** A diagram element found in a page, with the tag it came from and its offset in the HTML. */
export interface FoundFigure extends FigureRequest { tag: string; offset: number }

const SCRIPT_RE = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
const ELEMENT_RE = /<(tikz-diagram|metapost-diagram)\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi;
const ATTR_RE = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>`]+)))?/g;
const ENTITY_RE = /&(?:#(\d+)|#x([0-9a-f]+)|(lt|gt|amp|quot|apos|nbsp));/gi;
const ENTITIES: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'", nbsp: ' ' };

/** Decode the entities an HTML parser would in text and attribute values. */
export function decodeEntities(s: string): string {
  if (!s.includes('&')) return s;
  return s.replace(ENTITY_RE, (_m, dec, hex, name) => dec ? String.fromCodePoint(Number(dec)) : hex ? String.fromCodePoint(parseInt(hex, 16)) : ENTITIES[name.toLowerCase()]);
}

/** Attributes of an opening tag, `data-` stripped, as the tags see them (`attrsOf` in auto.ts). */
export function parseAttributes(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of s.matchAll(ATTR_RE)) out[m[1].toLowerCase().replace(/^data-/, '')] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? '');
  return out;
}

/** The text of an element as `textContent` gives it, then trimmed as the tags trim it. */
function normalize(text: string): string { return text.replace(/^\s*\n/, '').replace(/\s+$/, ''); }

/** Every diagram element in a page, in document order. */
export function extractFigures(html: string): FoundFigure[] {
  const found: FoundFigure[] = [];
  for (const m of html.matchAll(SCRIPT_RE)) {
    const attrs = parseAttributes(m[1]);
    const type = (attrs.type ?? '').trim().toLowerCase();
    if (type !== 'text/tikz' && type !== 'text/metapost') continue;
    found.push({ kind: type === 'text/metapost' ? 'metapost' : 'tikz', source: normalize(m[2]), attrs, tag: 'script', offset: m.index! });
  }
  for (const m of html.matchAll(ELEMENT_RE)) {
    const tag = m[1].toLowerCase();
    found.push({ kind: tag === 'metapost-diagram' ? 'metapost' : 'tikz', source: normalize(decodeEntities(m[3])), attrs: parseAttributes(m[2]), tag, offset: m.index! });
  }
  return found.sort((a, b) => a.offset - b.offset);
}

/** The `data-*` attributes of the page's auto.js loader tag (`data-figures` → `figures`), or {} if there is none. */
export function loaderAttributes(html: string): Record<string, string> {
  const m = /<script\b([^>]*\bsrc\s*=\s*["'][^"']*auto\.js["'][^>]*)>/i.exec(html);
  if (!m) return {};
  const out: Record<string, string> = {};
  for (const a of m[1].matchAll(ATTR_RE)) if (a[1].toLowerCase().startsWith('data-')) out[a[1].slice(5).toLowerCase()] = decodeEntities(a[2] ?? a[3] ?? a[4] ?? '');
  return out;
}

// ----------------------------------------------------------------- a zip file
// Store-only (SVG compresses well, but the browsers that need the zip are the
// ones without a directory picker, and a dependency is not worth a few
// hundred kilobytes). Timestamps are fixed at 1980-01-01 so the archive is
// reproducible.

let crcTable: Uint32Array | null = null;
export function crc32(data: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c >>> 0; }
  }
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = crcTable[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function makeZip(files: { name: string; data: string | Uint8Array }[]): Uint8Array<ArrayBuffer> {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [], central: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name), data = typeof f.data === 'string' ? enc.encode(f.data) : f.data, crc = crc32(data);
    const local = new Uint8Array(30 + name.length), l = new DataView(local.buffer);
    l.setUint32(0, 0x04034b50, true); l.setUint16(4, 20, true); l.setUint16(6, 0x0800, true); l.setUint16(8, 0, true);
    l.setUint16(10, 0, true); l.setUint16(12, 0x0021, true); l.setUint32(14, crc, true); l.setUint32(18, data.length, true); l.setUint32(22, data.length, true);
    l.setUint16(26, name.length, true); l.setUint16(28, 0, true); local.set(name, 30);
    const cd = new Uint8Array(46 + name.length), c = new DataView(cd.buffer);
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
    c.setUint16(12, 0, true); c.setUint16(14, 0x0021, true); c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true);
    c.setUint16(28, name.length, true); c.setUint16(30, 0, true); c.setUint16(32, 0, true); c.setUint16(34, 0, true); c.setUint16(36, 0, true);
    c.setUint32(38, 0, true); c.setUint32(42, offset, true); cd.set(name, 46);
    parts.push(local, data); central.push(cd);
    offset += local.length + data.length;
  }
  const cdSize = central.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22), e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true); e.setUint16(4, 0, true); e.setUint16(6, 0, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
  e.setUint32(12, cdSize, true); e.setUint32(16, offset, true); e.setUint16(20, 0, true);
  const out = new Uint8Array(offset + cdSize + 22);
  let p = 0;
  for (const part of [...parts, ...central, end]) { out.set(part, p); p += part.length; }
  return out;
}
