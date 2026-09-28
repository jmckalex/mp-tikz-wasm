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
 * with the rendered SVG. The custom elements stay live: new text content, the
 * `source` property or an output-affecting attribute typesets them again
 * (debounced; see "live custom elements" below). Script tags render once. A TikZ body without \documentclass is wrapped in a
 * standalone document; a MetaPost body without beginfig is wrapped in one
 * figure. Results are cached in IndexedDB by content hash, so a page renders
 * from cache on the second visit without running TeX at all.
 *
 * Saved figures (figures.ts): with data-figures="figures/" on the loader, each
 * element first looks for figures/figure-HASH.svg — HASH being six characters
 * of the hash of its source — and injects that file if it exists, so a page
 * whose figures were saved never starts the engines. `mpTikzWasm.saveFigures()`
 * writes every figure on the page under that name (into a folder you pick,
 * or as a zip); `mpost-wasm --prerender page.html` does the same from Node.
 *
 * Element attributes / data-* on script tags:
 *   data-libraries="arrows.meta,calc"   \usetikzlibrary for wrapped TikZ bodies
 *   data-packages="amsmath,amssymb"      \usepackage for wrapped TikZ bodies
 *   data-preamble="..."                  extra preamble lines for wrapped bodies
 *   data-border="2pt"                    standalone border (default 2pt)
 *   data-gdlibraries="trees,layered"     \usegdlibrary (graphdrawing; implies engine lualatex)
 *   data-engine="auto|latex|lualatex|luatex|plain" TikZ: which engine (default auto: lualatex for graphdrawing / \directlua)
 *   data-tex="latex|plain|none"          MetaPost: btex engine (default auto)
 *   data-prologues="3"                   MetaPost: prologues (default 3)
 *   data-fonts="paths|woff2"             TikZ: text as outlines or web fonts
 *   data-cache="off"                     skip the result cache and the saved figures
 *   data-show-console                    keep the log visible under the figure
 *   data-debounce="200"                  custom elements: ms to wait after a change before typesetting again
 *   data-replace                         custom elements: once rendered, replace the element by the <svg>
 *                                        itself (its id, class and style move to the SVG); static after that
 *
 * Loader script attributes: data-base (bundle/wasm base URL), data-worker="off",
 * data-bundles="+opentype" (add a bundle to the defaults; `+otf-fonts` too for
 * unicode-math. A list with no + replaces the defaults outright),
 * data-observe="off" (no MutationObserver for later-added elements),
 * data-snapshot="on" (use the pre-warmed tikz.fmt; see README for the trade-off),
 * data-prefetch="off" (do not prefetch the files the page's diagrams need in parallel),
 * data-figures="figures/" (where saved figures are looked for, relative to the page),
 * data-log="debug" (how much reaches the browser console: silent, error, warn (default), info,
 * debug — the engines' output as it runs — or trace; `mpTikzWasm.setLogLevel()` changes it later).
 *
 * window.mpTikzWasm: render(), setLogLevel(), figures(), saveFigures(), addFiles(),
 * figureHash(), figureName(), autoRender(), wrapTikz(), wrapMetaPost().
 */
import { MetaPost, LOG_LEVELS, DEFAULT_BUNDLES } from './index.js';
import type { MetaPostOptions, PrefetchKind, LogLevel } from './types.js';
import { Logger, consoleSink, DEFAULT_LOG_LEVEL, plural } from './logger.js';
import { figureHash, figureName, renderFigure, isSvg, makeZip, wrapTikz, wrapMetaPost } from './figures.js';
import type { FigureKind, FigureRequest, FigureResult, SavedFigure } from './figures.js';

export { wrapTikz, wrapMetaPost, figureHash, figureName };
export type { FigureRequest as RenderRequest, SavedFigure };

/** Where the SVG came from: the IndexedDB result cache, a saved figure file, or the engines. */
export type RenderSource = 'cache' | 'file' | 'engine';
/** ms is the engine's own time for this diagram (queueing and engine start-up excluded). */
export interface RenderOutput extends FigureResult { cached: boolean; from: RenderSource; hash: string; name: string }

export interface AutoOptions extends MetaPostOptions {
  /** false: neither read nor write the IndexedDB result cache (data-cache="off" on the loader). */
  cacheResults?: boolean;
  /** Base URL of the saved figures (`figure-HASH.svg`), looked up before the engines start (data-figures on the loader). */
  figuresBaseUrl?: string;
}

// ---------------------------------------------------------------- the result cache
// Version 2: since the saved-figure work the key is the six-character figure
// hash (the same identity as the file name); the store is recreated on upgrade.
// Version 3: a wrapped TikZ figure's SVG is the standalone page, border
// included (renderFigure); the hash is the source, so the old crops must go.
const DB_NAME = 'mp-tikz-wasm-cache', DB_VERSION = 3, STORE = 'svg';
function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (db.objectStoreNames.contains(STORE)) db.deleteObjectStore(STORE);
      db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
}
// each call opens its own connection and closes it when done, so a page of figures does not hold dozens open
async function cacheGet(key: string): Promise<string | undefined> {
  const db = await openDb(); if (!db) return undefined;
  return new Promise((resolve) => {
    const r = db.transaction(STORE).objectStore(STORE).get(key);
    r.onsuccess = () => { resolve(r.result as string | undefined); db.close(); };
    r.onerror = () => { resolve(undefined); db.close(); };
  });
}
async function cachePut(key: string, svg: string): Promise<void> {
  const db = await openDb(); if (!db) return;
  await new Promise<void>((resolve) => {
    const t = db.transaction(STORE, 'readwrite'); t.objectStore(STORE).put(svg, key);
    t.oncomplete = () => { db.close(); resolve(); };
    t.onerror = () => { db.close(); resolve(); };
  });
}

/** A saved figure, or undefined if the server has none by that name (or answers with something that is not SVG). */
async function fetchSavedFigure(url: string): Promise<string | undefined> {
  try {
    const res = await fetch(url);
    if (!res.ok) return undefined;
    const text = await res.text();
    return isSvg(text) ? text : undefined;
  } catch { return undefined; }
}

/** Status spans of figures waiting for the engine; progress events update them (a slow host shows what it is fetching). */
const statusSpans = new Set<HTMLElement>();

export class AutoRenderer {
  private engine: Promise<MetaPost> | null = null;
  private readonly log: Logger;
  private readonly rendered = new Map<string, SavedFigure>();
  private readonly inFlight = new Set<Promise<unknown>>();
  /** Files handed over before the engine existed; applied when it starts (see addFiles). */
  private readonly pendingFiles: Record<string, string | Uint8Array> = {};
  constructor(private options: AutoOptions = {}) {
    this.log = new Logger(options.logLevel ?? DEFAULT_LOG_LEVEL, options.logger ?? consoleSink);
  }

  /** Has an engine been started? A page whose figures all came from the cache or the saved files never starts one. */
  get started(): boolean { return this.engine !== null; }

  /**
   * Put files where this page's TeX runs will find them: a font the host wants to
   * typeset in (`\setmainfont{X.ttf}[Path=./]` — the run's working directory leads
   * OPENTYPEFONTS and TTFONTS), an image, a .sty. They stay for the life of the page.
   *
   * Deliberately does NOT start the engine: files handed over before the first
   * render are held and applied when one is created, so a page whose figures all
   * come from the cache or from saved files still starts nothing. Call it before
   * the figures that need the font, and with the `opentype` bundle loaded
   * (`data-bundles="+opentype"`) if the font is for fontspec.
   */
  addFiles(files: Record<string, string | Uint8Array>): Promise<void> {
    Object.assign(this.pendingFiles, files);
    return this.engine ? this.engine.then((m) => m.addFiles(files)) : Promise.resolve();
  }

  private get mp(): Promise<MetaPost> {
    if (!this.engine) {
      // prefetch the files the page's diagrams will need, in parallel, before the first render;
      // the progress listener goes on first so the placeholders show it happening
      const { prefetch, cacheResults: _c, figuresBaseUrl: _f, ...rest } = this.options;
      const kinds = prefetch ?? (typeof document !== 'undefined' ? prefetchKinds() : []);
      this.engine = MetaPost.create(rest).then(async (m) => {
        m.on('progress', (e) => {
          const text = e.phase === 'fetching'
            ? (e.total ? `fetching files (${e.current} of ${e.total})…` : `fetching ${e.detail ?? ''}…`)
            : e.phase === 'typesetting' ? `typesetting${e.detail ? ` (${e.detail})` : ''}…` : `${e.phase}…`;
          for (const s of statusSpans) s.textContent = text;
        });
        if (Object.keys(this.pendingFiles).length) await m.addFiles(this.pendingFiles);
        if (kinds.length) await m.prefetch(kinds);
        return m;
      });
    }
    return this.engine;
  }

  /** How much reaches the console (see `MetaPostOptions.logLevel`), for the engine now and later. */
  setLogLevel(level: LogLevel): void {
    this.options.logLevel = level;
    this.log.level = level;
    void this.engine?.then((m) => { m.logLevel = level; });
  }

  render(req: FigureRequest): Promise<RenderOutput> {
    const p = this.renderFrom(req);
    this.inFlight.add(p);
    p.catch(() => {}).finally(() => this.inFlight.delete(p));
    return p;
  }

  private async renderFrom(req: FigureRequest): Promise<RenderOutput> {
    const hash = figureHash(req), name = figureName(hash);
    const useCache = this.options.cacheResults !== false && req.attrs.cache !== 'off';
    const found = (svg: string, from: RenderSource): RenderOutput => ({ svg, log: '', diagnostics: [], ok: true, ms: 0, cached: true, from, hash, name });
    if (useCache) {
      const hit = await cacheGet(hash);
      if (hit) { this.log.debug('host', `${name}: from the result cache`); return this.done(req, found(hit, 'cache')); }
      const base = this.options.figuresBaseUrl;
      if (base) {
        const svg = await fetchSavedFigure(new URL(name, base).href);
        if (svg) { this.log.debug('host', `${name}: from ${base}`); void cachePut(hash, svg); return this.done(req, found(svg, 'file')); }
        this.log.debug('host', `${name}: not saved under ${base}; rendering`);
      }
    }
    const mp = await this.mp;
    const r = await renderFigure(mp, req, hash);
    if (useCache && r.ok) void cachePut(hash, r.svg);
    return this.done(req, { ...r, cached: false, from: 'engine', hash, name });
  }

  private done(req: FigureRequest, out: RenderOutput): RenderOutput {
    if (out.ok) this.rendered.set(out.hash, { name: out.name, hash: out.hash, kind: req.kind, source: req.source, svg: out.svg });
    return out;
  }

  /** Drop a figure from figures() (and so from saveFigures()): a live element has replaced it. */
  forget(nameOrHash: string): void {
    for (const [hash, f] of this.rendered) if (hash === nameOrHash || f.name === nameOrHash) this.rendered.delete(hash);
  }

  /** Resolves when no render is in flight. */
  async idle(): Promise<void> { while (this.inFlight.size) await Promise.allSettled([...this.inFlight]); }

  /** Every figure that has rendered successfully so far (from any source), in the order it finished. */
  figures(): SavedFigure[] { return [...this.rendered.values()]; }

  /**
   * Write every figure on the page as figure-HASH.svg: into a folder chosen with the
   * directory picker where the browser has one (Chrome, Edge), otherwise as a zip
   * download. Waits for figures still rendering. Returns the file names written.
   */
  async saveFigures(opts: { zip?: boolean; name?: string } = {}): Promise<string[]> {
    await this.idle();
    const figs = this.figures();
    if (!figs.length) { this.log.warn('host', 'saveFigures: no figure has rendered on this page'); return []; }
    const names = figs.map((f) => f.name);
    const w = globalThis as any;
    if (!opts.zip && typeof w.showDirectoryPicker === 'function') {
      let dir: any = null;
      try { dir = await w.showDirectoryPicker({ mode: 'readwrite', id: 'mp-tikz-wasm-figures' }); }
      catch (e: any) {
        if (e?.name === 'AbortError') { this.log.info('host', 'saveFigures: cancelled'); return []; }
        this.log.info('host', `saveFigures: no directory picker here (${e?.message ?? e}); downloading a zip instead`);
      }
      if (dir) {
        for (const f of figs) {
          const h = await dir.getFileHandle(f.name, { create: true });
          const ws = await h.createWritable();
          await ws.write(f.svg);
          await ws.close();
        }
        this.log.info('host', `saveFigures: wrote ${plural(figs.length, 'figure')} to ${dir.name}/`);
        return names;
      }
    }
    const zip = makeZip(figs.map((f) => ({ name: f.name, data: f.svg })));
    const url = URL.createObjectURL(new Blob([zip], { type: 'application/zip' }));
    const a = document.createElement('a');
    a.href = url; a.download = opts.name ?? 'figures.zip';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    this.log.info('host', `saveFigures: ${a.download} with ${plural(figs.length, 'figure')}`);
    return names;
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
function kindOf(el: Element): FigureKind {
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
  const add = (kind: FigureKind, a: Record<string, string>, src: string) => {
    if (kind === 'tikz') {
      const engine = a.engine ?? 'auto';
      if (engine === 'plain') kinds.add('plain');
      else if (engine === 'lualatex' || engine === 'luatex' || a.gdlibraries || /graphdrawing|\\directlua|luacode/.test(src)) kinds.add('lualatex');
      else kinds.add('latex');
    } else {
      kinds.add('metapost');
      if (a.tex === 'latex' || /documentclass/.test(src)) kinds.add('latex');
    }
  };
  for (const el of Array.from(document.querySelectorAll(SELECTOR))) add(kindOf(el), attrsOf(el), liveSource(el));
  // script tags are replaced by their figure as soon as they are seen, before the
  // engine (and so this scan) exists: they are remembered in replacedScripts
  for (const r of replacedScripts) add(r.kind, r.attrs, r.source);
  return [...kinds];
}

/** The requests of script tags already replaced by their figure, for prefetchKinds(). */
const replacedScripts: FigureRequest[] = [];

/** A figure host: the <figure> a rendered diagram lives in. */
function makeHost(kind: FigureKind, attrs: Record<string, string>): HTMLElement {
  const host = document.createElement('figure');
  host.className = `mpw-figure mpw-${kind} mpw-pending`;
  host.setAttribute('role', 'img');
  if (attrs.alt) host.setAttribute('aria-label', attrs.alt);
  host.innerHTML = `<span class="mpw-status">rendering ${kind === 'tikz' ? 'TikZ' : 'MetaPost'}…</span>`;
  return host;
}

/** Drop a figure from figures() once nothing on the page shows it (a live element replaced, emptied or overtook it). */
function forgetIfUnshown(name: string | undefined): void {
  if (name && renderer && !document.querySelector(`[data-figure="${name}"]`)) renderer.forget(name);
}

/**
 * Swap `el` for the <svg> root(s) now in `host` (data-replace): the diagram becomes plain
 * SVG in the page, so that e.g. reveal.js sees its `class="fragment"` groups as ordinary
 * elements of the slide. The element's id, class and style go to the (first) SVG root.
 * Returns the root that now stands for the figure.
 */
function replaceWithSvg(el: Element, host: HTMLElement, name: string, attrs: Record<string, string>): Element | null {
  const roots = Array.from(host.children).filter((n) => n.localName === 'svg');
  if (!roots.length) return null;
  const first = roots[0];
  const cls = el.getAttribute('class');
  if (cls) first.setAttribute('class', `${first.getAttribute('class') ?? ''} ${cls}`.trim());
  const style = el.getAttribute('style');
  if (style) first.setAttribute('style', `${first.getAttribute('style') ?? ''};${style}`.replace(/^;/, ''));
  if (el.id) first.id = el.id;
  first.setAttribute('role', 'img');
  if (attrs.alt) first.setAttribute('aria-label', attrs.alt);
  for (const r of roots) r.setAttribute('data-figure', name);   // what forgetIfUnshown() looks for
  el.replaceWith(...roots);
  return first;
}

/** Is data-replace on (present, and not "false" or "off")? */
function wantsReplace(el: Element): boolean {
  const v = el.getAttribute('data-replace') ?? el.getAttribute('replace');
  return v !== null && !/^(false|off|no)$/i.test(v.trim());
}

/**
 * Typeset one request. `stale()` is asked before painting, so a result overtaken by a newer
 * edit is dropped. With `replace`, a successful result replaces that element (see
 * replaceWithSvg); returns true when it did.
 */
async function typesetInto(host: HTMLElement, kind: FigureKind, source: string, attrs: Record<string, string>, update: boolean, stale: () => boolean = () => false, replace?: Element): Promise<boolean> {
  const status = host.querySelector<HTMLElement>('.mpw-status');
  if (status) statusSpans.add(status);
  try {
    renderer ??= new AutoRenderer(loaderOptions());
    const r = await renderer.render({ kind, source, attrs });
    if (stale()) { forgetIfUnshown(r.name); return false; }
    const previous = host.dataset.figure;
    host.className = `mpw-figure mpw-${kind} ${r.ok ? 'mpw-ok' : 'mpw-error'}`;
    host.dataset.figure = r.name;
    host.innerHTML = r.svg || '';
    if (!r.ok || 'show-console' in attrs) {
      const pre = document.createElement('pre');
      pre.className = 'mpw-console';
      pre.textContent = (r.diagnostics.map((d) => `${d.severity}: ${d.message}${d.line ? ` (line ${d.line})` : ''}`).join('\n') + '\n' + r.log).trim();
      host.appendChild(pre);
    }
    // replace before announcing, so a listener (Reveal.sync(), say) sees the final DOM
    const root = replace && r.ok ? replaceWithSvg(replace, host, r.name, attrs) : null;
    // a figure no longer shown anywhere on the page is not one saveFigures() should write
    if (previous !== r.name) forgetIfUnshown(previous);
    (root ?? host).dispatchEvent(new CustomEvent('mp-tikz-wasm:rendered', { bubbles: true, detail: { kind, ok: r.ok, ms: r.ms, cached: r.cached, from: r.from, hash: r.hash, name: r.name, update, replaced: !!root } }));
    return !!root;
  } catch (e: any) {
    if (stale()) return false;
    host.className = `mpw-figure mpw-${kind} mpw-error`;
    const msg = typeof e === 'string' ? e : e?.message ?? e?.error ?? (() => { try { return JSON.stringify(e); } catch { return String(e); } })();
    host.innerHTML = `<pre class="mpw-console">${String(msg).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]!))}</pre>`;
    return false;
  } finally {
    if (status) statusSpans.delete(status);
  }
}

// ---- live custom elements
// <tikz-diagram> and <metapost-diagram> typeset again when they change: new text
// content (el.textContent = …, el.innerHTML = …), the `source` property, or an
// attribute that is not purely presentational. The source is kept here because
// the element's children become the figure. Changes are debounced (data-debounce,
// in ms, default 200), the old figure stays up until the new one is ready, and a
// result overtaken by a later change is dropped. Script tags render once.

/** Attributes that never change the typeset result. */
const PRESENTATIONAL = /^(class|style|id|hidden|title|role|tabindex|slot|lang|dir|aria-.*|data-figure)$/;
const DEFAULT_DEBOUNCE_MS = 200;

interface LiveState {
  source: string;
  /** the source and output-affecting attributes last asked for; an equal request is skipped */
  key: string;
  host: HTMLElement | null;
  generation: number;
  timer?: ReturnType<typeof setTimeout>;
  observer: MutationObserver;
}
const live = new WeakMap<Element, LiveState>();

function requestKey(kind: FigureKind, source: string, attrs: Record<string, string>): string {
  return `${figureHash({ kind, source, attrs })}${'show-console' in attrs ? '+console' : ''}`;
}

/** Take new source text out of the element's children (anything but the figure), leaving just the figure. */
function absorbContent(el: Element, st: LiveState): boolean {
  const others = Array.from(el.childNodes).filter((n) => n !== st.host);
  if (!others.length && st.host?.parentNode === el) return false;
  st.source = others.map((n) => n.textContent ?? '').join('').replace(/^\s*\n/, '').replace(/\s+$/, '');
  for (const n of others) n.remove();
  return true;
}

function scheduleLive(el: Element, st: LiveState, immediate = false): void {
  clearTimeout(st.timer);
  const d = Number(el.getAttribute('data-debounce'));
  const delay = immediate ? 0 : Number.isFinite(d) && d >= 0 ? d : DEFAULT_DEBOUNCE_MS;
  const run = () => { void renderLive(el, st); };
  if (delay === 0) run(); else st.timer = setTimeout(run, delay);
}

async function renderLive(el: Element, st: LiveState): Promise<void> {
  const kind = kindOf(el), attrs = attrsOf(el);
  if (!st.source.trim()) {                     // nothing to typeset (yet): an empty element stays empty
    st.key = ''; st.generation++;
    if (st.host) { const shown = st.host.dataset.figure; st.host.remove(); st.host = null; forgetIfUnshown(shown); }
    st.observer.takeRecords();
    return;
  }
  const key = requestKey(kind, st.source, attrs);
  if (key === st.key && st.host?.parentNode === el) return;
  st.key = key;
  const gen = ++st.generation;
  const update = !!st.host;
  if (!st.host) st.host = makeHost(kind, attrs);
  else st.host.classList.add('mpw-pending');   // keep the old figure up, dimmed, until the new one is ready
  if (st.host.parentNode !== el) el.appendChild(st.host);
  st.observer.takeRecords();                   // our own writes are not edits
  const replaced = await typesetInto(st.host, kind, st.source, attrs, update, () => gen !== st.generation, wantsReplace(el) ? el : undefined);
  if (replaced) {                              // the element is gone: the SVG is static from here on
    st.observer.disconnect();
    clearTimeout(st.timer);
    st.host = null;
  }
}

function onLiveMutations(el: Element, st: LiveState, records: MutationRecord[]): void {
  let changed = false;
  for (const m of records) {
    if (st.host?.contains(m.target)) continue;          // the figure and everything in it: our own writes
    if (m.type === 'attributes' && PRESENTATIONAL.test(m.attributeName ?? '')) continue;
    changed = true;
  }
  if (!changed) return;
  absorbContent(el, st);
  st.observer.takeRecords();
  scheduleLive(el, st);
}

/** First sight of a custom element: read its source, start watching it, typeset. Later calls do nothing. */
function startLive(el: Element): void {
  if (live.has(el)) return;
  const st: LiveState = { source: '', key: '', host: null, generation: 0, observer: new MutationObserver((recs) => onLiveMutations(el, st, recs)) };
  live.set(el, st);
  absorbContent(el, st);
  st.observer.observe(el, { childList: true, characterData: true, subtree: true, attributes: true });
  scheduleLive(el, st, true);
}

/** The `source` property of the two custom elements: read the diagram's source, or set it to typeset again. */
function liveSource(el: Element): string { return live.get(el)?.source ?? sourceOf(el); }
function setLiveSource(el: Element, value: string): void {
  const st = live.get(el);
  if (!st) { el.textContent = value; return; }          // not rendered yet: connecting it will read this
  st.source = String(value).replace(/^\s*\n/, '').replace(/\s+$/, '');
  scheduleLive(el, st);
}

export async function renderElement(el: Element): Promise<void> {
  if (el.tagName.toLowerCase() !== 'script') { startLive(el); return; }
  if (pending.has(el)) return;
  pending.add(el);
  const kind = kindOf(el), attrs = attrsOf(el), source = sourceOf(el);
  replacedScripts.push({ kind, attrs, source });
  const host = makeHost(kind, attrs);
  el.replaceWith(host);
  await typesetInto(host, kind, source, attrs, false);
}

function loaderOptions(): AutoOptions {
  const me = (document.currentScript as HTMLScriptElement | null) ?? document.querySelector('script[src*="auto.js"]');
  const ds = (me as HTMLElement | null)?.dataset ?? {};
  const o: AutoOptions = {};
  if (ds.base) o.bundleBaseUrl = new URL('bundles/', new URL(ds.base, location.href)).href;
  if (ds.worker === 'off') o.worker = false;
  if (ds.cache === 'off') o.cacheResults = false;
  if (ds.bundles) {
    // A name prefixed with + is added to the defaults rather than replacing them,
    // which is what an embedder wanting one extra bundle (`+opentype`) actually
    // means: a bare list has to repeat all ten and goes stale when they change.
    // Mixing the two forms is a replace, with the +names appended.
    const names = ds.bundles.split(/[,\s]+/).filter(Boolean);
    const added = names.filter((n) => n.startsWith('+')).map((n) => n.slice(1));
    const listed = names.filter((n) => !n.startsWith('+'));
    o.bundles = [...(listed.length ? listed : DEFAULT_BUNDLES), ...added];
  }
  if (ds.snapshot === 'on' || ds.snapshot === 'auto') o.snapshot = 'auto';   // opt in: 5.8 MB format, faster after the first figure
  if (ds.prefetch === 'off') o.prefetch = [];                                  // default: the kinds the page contains
  if (ds.figures && ds.figures !== 'off') o.figuresBaseUrl = new URL(ds.figures.replace(/\/?$/, '/'), location.href).href;
  if (ds.log && (LOG_LEVELS as string[]).includes(ds.log)) o.logLevel = ds.log as LogLevel;
  return o;
}

/** Render every diagram element currently in the document (and later ones, unless observe is off). */
export function autoRender(root: ParentNode = document): void {
  for (const el of Array.from(root.querySelectorAll(SELECTOR))) void renderElement(el);
}

if (typeof document !== 'undefined' && typeof customElements !== 'undefined') {
  for (const tag of ['tikz-diagram', 'metapost-diagram']) {
    if (!customElements.get(tag)) customElements.define(tag, class extends HTMLElement {
      connectedCallback() { queueMicrotask(() => { if (this.isConnected) void renderElement(this); }); }
      /** The diagram's source; setting it typesets the diagram again. */
      get source(): string { return liveSource(this); }
      set source(value: string) { setLiveSource(this, value); }
    });
  }
  const style = document.createElement('style');
  style.textContent = `.mpw-figure{display:inline-block;margin:0;vertical-align:middle;max-width:100%}.mpw-figure svg{max-width:100%;height:auto}.mpw-figure.mpw-pending>svg{opacity:.55;transition:opacity .2s}.mpw-status{font:13px system-ui,sans-serif;color:#777}.mpw-console{font:12px/1.4 ui-monospace,Menlo,monospace;white-space:pre-wrap;color:#a33;background:#fff5f5;border:1px solid #f0c0c0;padding:6px 8px;margin:4px 0 0;max-width:60em}`;
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
  const shared = () => (renderer ??= new AutoRenderer(loaderOptions()));
  (globalThis as any).mpTikzWasm = {
    render: (req: FigureRequest) => shared().render(req),
    setLogLevel: (level: LogLevel) => shared().setLogLevel(level),
    /** The figures rendered so far, each with its file name, hash, kind, source and SVG. */
    figures: () => renderer?.figures() ?? [],
    /** Save every figure as figure-HASH.svg (a folder you pick, or a zip); `{ zip: true }` forces the zip. */
    saveFigures: (opts?: { zip?: boolean; name?: string }) => shared().saveFigures(opts),
    /** Fonts (or images, .sty files) for this page's TeX runs; does not start the engine by itself. */
    addFiles: (files: Record<string, string | Uint8Array>) => shared().addFiles(files),
    figureHash, figureName, autoRender, wrapTikz, wrapMetaPost,
  };
}
