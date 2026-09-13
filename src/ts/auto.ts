/**
 * auto.ts — the drop-in web integration (a tikzjax replacement).
 *
 *   <script type="module" src=".../mp-tikz-wasm/dist/auto.js"></script>
 *
 *   <script type="text/tikz">\begin{tikzpicture} ... \end{tikzpicture}</script>
 *   <script type="text/metapost">draw fullcircle scaled 50;</script>
 *   <tikz-diagram>\begin{tikzpicture} ... \end{tikzpicture}</tikz-diagram>
 *   <metapost-diagram>draw fullcircle scaled 50;</metapost-diagram>
 *
 * Every such element is replaced (script tags) or filled (custom elements)
 * with the rendered SVG. A TikZ body without \documentclass is wrapped in a
 * standalone document; a MetaPost body without beginfig is wrapped in one
 * figure. Results are cached in IndexedDB by content hash, so a page renders
 * from cache on the second visit without running TeX at all.
 *
 * Element attributes / data-* on script tags:
 *   data-libraries="arrows.meta,calc"   \usetikzlibrary for wrapped TikZ bodies
 *   data-packages="amsmath,amssymb"      \usepackage for wrapped TikZ bodies
 *   data-preamble="..."                  extra preamble lines for wrapped bodies
 *   data-border="2pt"                    standalone border (default 2pt)
 *   data-gdlibraries="trees,layered"     \usegdlibrary (graphdrawing; implies engine lualatex)
 *   data-engine="auto|latex|lualatex|plain" TikZ: which engine (default auto: lualatex for graphdrawing / \directlua)
 *   data-tex="latex|plain|none"          MetaPost: btex engine (default auto)
 *   data-prologues="3"                   MetaPost: prologues (default 3)
 *   data-fonts="paths|woff2"             TikZ: text as outlines or web fonts
 *   data-cache="off"                     skip the result cache
 *   data-show-console                    keep the log visible under the figure
 *
 * Loader script attributes: data-base (bundle/wasm base URL), data-worker="off",
 * data-observe="off" (no MutationObserver for later-added elements),
 * data-snapshot="on" (use the pre-warmed tikz.fmt; see README for the trade-off),
 * data-prefetch="off" (do not prefetch the files the page's diagrams need in parallel).
 */
import { MetaPost } from './index.js';
import type { LatexRunOptions, MetaPostOptions, RunResult, LatexResult, PrefetchKind } from './types.js';
import { sha256Hex } from './tex/cache-key.js';

type Kind = 'tikz' | 'metapost';

export interface RenderRequest { kind: Kind; source: string; attrs: Record<string, string> }
/** ms is the engine's own time for this diagram (queueing and engine start-up excluded). */
export interface RenderOutput { svg: string; log: string; diagnostics: { severity: string; message: string; line?: number }[]; ok: boolean; ms: number; cached: boolean }

/** Wrap a TikZ body in a standalone document unless it already is one. */
export function wrapTikz(source: string, attrs: Record<string, string> = {}): string {
  if (/\\documentclass|\\bye\b/.test(source)) return source;
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

const DB_NAME = 'mp-tikz-wasm-cache', STORE = 'svg';
function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}
async function cacheGet(key: string): Promise<string | undefined> {
  const db = await openDb(); if (!db) return undefined;
  return new Promise((resolve) => { const r = db.transaction(STORE).objectStore(STORE).get(key); r.onsuccess = () => resolve(r.result as string | undefined); r.onerror = () => resolve(undefined); });
}
async function cachePut(key: string, svg: string): Promise<void> {
  const db = await openDb(); if (!db) return;
  await new Promise<void>((resolve) => { const t = db.transaction(STORE, 'readwrite'); t.objectStore(STORE).put(svg, key); t.oncomplete = () => resolve(); t.onerror = () => resolve(); });
}

/** Status spans of figures waiting for the engine; progress events update them (a slow host shows what it is fetching). */
const statusSpans = new Set<HTMLElement>();

export class AutoRenderer {
  private engine: Promise<MetaPost> | null = null;
  private version = 'mp-tikz-wasm';
  constructor(private options: MetaPostOptions & { cacheResults?: boolean } = {}) {}

  private get mp(): Promise<MetaPost> {
    if (!this.engine) {
      // prefetch the files the page's diagrams will need, in parallel, before the first render
      const options = { ...this.options, prefetch: this.options.prefetch ?? prefetchKinds() };
      this.engine = MetaPost.create(options).then((m) => {
        this.version = `${m.version.metapost}/${m.version.build}`;
        m.on('progress', (e) => {
          const text = e.phase === 'fetching' ? `fetching ${e.detail ?? ''}…` : e.phase === 'typesetting' ? `typesetting${e.detail ? ` (${e.detail})` : ''}…` : `${e.phase}…`;
          for (const s of statusSpans) s.textContent = text;
        });
        return m;
      });
    }
    return this.engine;
  }

  async render(req: RenderRequest): Promise<RenderOutput> {
    const useCache = this.options.cacheResults !== false && req.attrs.cache !== 'off';
    const doc = req.kind === 'tikz' ? wrapTikz(req.source, req.attrs) : wrapMetaPost(req.source, req.attrs);
    const key = sha256Hex(`${this.version}\0${req.kind}\0${req.attrs.fonts ?? ''}\0${req.attrs.tex ?? ''}\0${req.attrs.engine ?? ''}\0${doc}`);
    if (useCache) {
      const hit = await cacheGet(key);
      if (hit) return { svg: hit, log: '', diagnostics: [], ok: true, ms: 0, cached: true };
    }
    const mp = await this.mp;
    let out: RenderOutput;
    if (req.kind === 'tikz') {
      const engine = (req.attrs.engine as LatexRunOptions['engine']) ?? 'auto';
      const r: LatexResult = await mp.latex(doc, { fonts: req.attrs.fonts === 'woff2' ? 'woff2' : 'paths', engine, svg: { idPrefix: `mpw${key.slice(0, 8)}-`, precision: false } });
      out = { svg: r.pages.join('\n'), log: r.log, diagnostics: r.diagnostics, ok: r.status === 'ok' && r.pages.length > 0, ms: r.stats.totalMs, cached: false };
    } else {
      const tex = (req.attrs.tex ?? 'auto') as MetaPostOptions['tex'];
      const r: RunResult = await mp.run(doc, { format: 'svg', tex, svg: { idPrefix: `mpw${key.slice(0, 8)}-` } });
      out = { svg: r.figures.map((f) => f.svg ?? '').join('\n'), log: r.log, diagnostics: r.diagnostics, ok: r.history < 2 && r.figures.length > 0, ms: r.stats.totalMs, cached: false };
    }
    if (useCache && out.ok) void cachePut(key, out.svg);
    return out;
  }
}

// ---------------------------------------------------------------- the DOM side
const SELECTOR = 'script[type="text/tikz"], script[type="text/metapost"], tikz-diagram, metapost-diagram';
let renderer: AutoRenderer | null = null;
const pending = new WeakSet<Element>();

function attrsOf(el: Element): Record<string, string> {
  const a: Record<string, string> = {};
  for (const { name, value } of Array.from(el.attributes)) a[name.replace(/^data-/, '')] = value;
  return a;
}
function kindOf(el: Element): Kind {
  const t = el.tagName.toLowerCase();
  if (t === 'metapost-diagram' || (t === 'script' && el.getAttribute('type') === 'text/metapost')) return 'metapost';
  return 'tikz';
}
function sourceOf(el: Element): string {
  // script bodies are raw; custom elements hold HTML text, so entities are decoded by the parser already
  return (el.textContent ?? '').replace(/^\s*\n/, '').replace(/\s+$/, '');
}
/** Which kinds of run the page's diagrams will need, for the engine's parallel prefetch. */
function prefetchKinds(): PrefetchKind[] {
  const kinds = new Set<PrefetchKind>();
  for (const el of Array.from(document.querySelectorAll(SELECTOR))) {
    const a = attrsOf(el), src = sourceOf(el);
    if (kindOf(el) === 'tikz') {
      const engine = a.engine ?? 'auto';
      if (engine === 'plain') kinds.add('plain');
      else if (engine === 'lualatex' || engine === 'luatex' || a.gdlibraries || /graphdrawing|\\directlua|luacode/.test(src)) kinds.add('lualatex');
      else kinds.add('latex');
    } else {
      kinds.add('metapost');
      if (a.tex === 'latex' || /documentclass/.test(src)) kinds.add('latex');
    }
  }
  return [...kinds];
}

export async function renderElement(el: Element): Promise<void> {
  if (pending.has(el)) return;
  pending.add(el);
  const kind = kindOf(el), attrs = attrsOf(el), source = sourceOf(el);
  const isScript = el.tagName.toLowerCase() === 'script';
  const host = document.createElement('figure');
  host.className = `mpw-figure mpw-${kind} mpw-pending`;
  host.setAttribute('role', 'img');
  if (attrs.alt) host.setAttribute('aria-label', attrs.alt);
  host.innerHTML = `<span class="mpw-status">rendering ${kind === 'tikz' ? 'TikZ' : 'MetaPost'}…</span>`;
  if (isScript) el.replaceWith(host); else { el.innerHTML = ''; el.appendChild(host); }
  const status = host.querySelector<HTMLElement>('.mpw-status');
  if (status) statusSpans.add(status);
  try {
    renderer ??= new AutoRenderer(loaderOptions());
    const r = await renderer.render({ kind, source, attrs });
    host.className = `mpw-figure mpw-${kind} ${r.ok ? 'mpw-ok' : 'mpw-error'}`;
    host.innerHTML = r.svg || '';
    if (!r.ok || 'show-console' in attrs) {
      const pre = document.createElement('pre');
      pre.className = 'mpw-console';
      pre.textContent = (r.diagnostics.map((d) => `${d.severity}: ${d.message}${d.line ? ` (line ${d.line})` : ''}`).join('\n') + '\n' + r.log).trim();
      host.appendChild(pre);
    }
    host.dispatchEvent(new CustomEvent('mp-tikz-wasm:rendered', { bubbles: true, detail: { kind, ok: r.ok, ms: r.ms, cached: r.cached } }));
  } catch (e: any) {
    host.className = `mpw-figure mpw-${kind} mpw-error`;
    const msg = typeof e === 'string' ? e : e?.message ?? e?.error ?? (() => { try { return JSON.stringify(e); } catch { return String(e); } })();
    host.innerHTML = `<pre class="mpw-console">${String(msg).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]!))}</pre>`;
  } finally {
    if (status) statusSpans.delete(status);
  }
}

function loaderOptions(): MetaPostOptions & { cacheResults?: boolean } {
  const me = (document.currentScript as HTMLScriptElement | null) ?? document.querySelector('script[src*="auto.js"]');
  const ds = (me as HTMLElement | null)?.dataset ?? {};
  const o: MetaPostOptions & { cacheResults?: boolean } = { log: () => {} };
  if (ds.base) o.bundleBaseUrl = new URL('bundles/', new URL(ds.base, location.href)).href;
  if (ds.worker === 'off') o.worker = false;
  if (ds.cache === 'off') o.cacheResults = false;
  if (ds.bundles) o.bundles = ds.bundles.split(/[,\s]+/).filter(Boolean);
  if (ds.snapshot === 'on' || ds.snapshot === 'auto') o.snapshot = 'auto';   // opt in: 5.8 MB format, faster after the first figure
  if (ds.prefetch === 'off') o.prefetch = [];                                  // default: the kinds the page contains
  return o;
}

/** Render every diagram element currently in the document (and later ones, unless observe is off). */
export function autoRender(root: ParentNode = document): void {
  for (const el of Array.from(root.querySelectorAll(SELECTOR))) void renderElement(el);
}

if (typeof document !== 'undefined' && typeof customElements !== 'undefined') {
  for (const tag of ['tikz-diagram', 'metapost-diagram']) {
    if (!customElements.get(tag)) customElements.define(tag, class extends HTMLElement { connectedCallback() { queueMicrotask(() => { if (this.isConnected) void renderElement(this); }); } });
  }
  const style = document.createElement('style');
  style.textContent = `.mpw-figure{display:inline-block;margin:0;vertical-align:middle;max-width:100%}.mpw-figure svg{max-width:100%;height:auto}.mpw-status{font:13px system-ui,sans-serif;color:#777}.mpw-console{font:12px/1.4 ui-monospace,Menlo,monospace;white-space:pre-wrap;color:#a33;background:#fff5f5;border:1px solid #f0c0c0;padding:6px 8px;margin:4px 0 0;max-width:60em}`;
  document.head.appendChild(style);
  const start = () => {
    autoRender();
    const me = (document.currentScript as HTMLElement | null) ?? document.querySelector('script[src*="auto.js"]');
    if ((me as HTMLElement | null)?.dataset?.observe !== 'off') {
      new MutationObserver((muts) => {
        for (const m of muts) for (const n of Array.from(m.addedNodes)) {
          if (!(n instanceof Element)) continue;
          if (n.matches(SELECTOR)) void renderElement(n); else autoRender(n);
        }
      }).observe(document.documentElement, { childList: true, subtree: true });
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  (globalThis as any).mpTikzWasm = { render: (req: RenderRequest) => (renderer ??= new AutoRenderer(loaderOptions())).render(req), autoRender, wrapTikz, wrapMetaPost };
}
