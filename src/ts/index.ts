/**
 * mp-tikz-wasm — public API (docs/08). `MetaPost.create()` starts a Web
 * Worker in browsers and runs in-process in Node (or when `worker: false`).
 */
import type { MetaPostOptions, RunOptions, RunResult, ProgressEvent, BundleName, LatexRunOptions, LatexResult } from './types.js';
import { MetaPostCore } from './core.js';
import { BundleSet, browserIO } from './vfs/bundle.js';
import { resolveBundleSpecs, DEFAULT_BUNDLES } from './bundles-config.js';
import { isNode, nodeIO } from './node.js';
import type { WorkerResponse, WorkerEvent } from './worker.js';
export * from './types.js';
export { sanitizeSvg, postProcessSvg } from './render/svg.js';
export { scanTexBlocks, scanInputs } from './tex/scanner.js';
export { parseMetaPostLog } from './diagnostics.js';
export { splitMpx } from './tex/mpx.js';

type Listener = (e: any) => void;

interface Backend {
  init(): Promise<{ version: { metapost: string; tex: string; build: string } }>;
  run(source: string, options: RunOptions): Promise<RunResult>;
  latex(source: string, options: LatexRunOptions): Promise<LatexResult>;
  addFiles(files: Record<string, string | Uint8Array>): Promise<void>;
  clearCache(): Promise<void>;
  preload(bundles: BundleName[]): Promise<void>;
  dispose(): void;
}

class InProcessBackend implements Backend {
  private core!: MetaPostCore;
  private bundles?: BundleSet;
  constructor(private options: MetaPostOptions, private emit: (ev: string, data: unknown) => void) {}
  async init() {
    const o = this.options;
    const here = import.meta.url;
    const io = o.bundleIO ?? (isNode ? await nodeIO() : browserIO());
    let texmfDir: string | undefined = o.texmfDir;
    if (!texmfDir) {
      this.bundles = new BundleSet(io);
      const base = o.bundleBaseUrl ?? new URL('./bundles/', here).href;
      for (const spec of resolveBundleSpecs(o.bundles ?? DEFAULT_BUNDLES, base)) await this.bundles.add(spec);
      await this.bundles.prefetchEager();
      if (!this.bundles.canFetchSync) await this.bundles.prefetchAll();
    }
    const mplibFactory = o.modules?.mplib ?? (await import(/* @vite-ignore */ new URL('./mplib.mjs', here).href)).default;
    let texFactory = o.modules?.tex;
    if (!texFactory && (o.tex ?? 'auto') !== 'none') {
      try { texFactory = (await import(/* @vite-ignore */ new URL('./tex.mjs', here).href)).default; } catch { texFactory = undefined; }
    }
    let dvisvgmFactory = o.modules?.dvisvgm;
    if (!dvisvgmFactory && texFactory) {
      try { dvisvgmFactory = (await import(/* @vite-ignore */ new URL('./dvisvgm.mjs', here).href)).default; } catch { dvisvgmFactory = undefined; }
    }
    // luatex.wasm: the factory is cheap to import; the 4 MB module is only fetched on the first lualatex run
    let luatexFactory = o.modules?.luatex;
    if (!luatexFactory && texFactory) {
      try { luatexFactory = (await import(/* @vite-ignore */ new URL('./luatex.mjs', here).href)).default; } catch { luatexFactory = undefined; }
    }
    this.core = new MetaPostCore({
      mplibFactory, texFactory, luatexFactory, dvisvgmFactory, bundles: this.bundles, texmfDir, options: o,
      onProgress: (e) => this.emit('progress', e),
      onLog: (l) => { o.log?.(l); this.emit('log', l); },
    });
    await this.core.init();
    return { version: this.core.version };
  }
  run(source: string, options: RunOptions) { return this.core.run(source, options); }
  latex(source: string, options: LatexRunOptions) { return this.core.latex(source, options); }
  async addFiles(files: Record<string, string | Uint8Array>) { this.core.addFiles(files); }
  async clearCache() { this.core.clearCache(); }
  async preload(bundles: BundleName[]) {
    if (!this.bundles) return;
    const base = this.options.bundleBaseUrl ?? new URL('./bundles/', import.meta.url).href;
    for (const spec of resolveBundleSpecs(bundles, base)) if (!this.bundles.manifests.some((m) => m.spec.name === spec.name)) await this.bundles.add(spec);
    await this.bundles.prefetchAll((f) => bundles.includes(f.bundle));
  }
  dispose() { /* nothing to terminate */ }
}

class WorkerBackend implements Backend {
  private worker: Worker;
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
  private nextId = 1;
  constructor(private options: MetaPostOptions, private emit: (ev: string, data: unknown) => void) {
    this.worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    this.worker.onmessage = (ev: MessageEvent<WorkerResponse | WorkerEvent>) => {
      const m = ev.data as any;
      if ('event' in m) { this.emit(m.event, m.data); if (m.event === 'log') this.options.log?.(m.data); return; }
      const p = this.pending.get(m.id);
      if (!p) return;
      this.pending.delete(m.id);
      if (m.ok) p.resolve(m.result); else p.reject(new Error(m.error));
    };
    this.worker.onerror = (e) => { for (const p of this.pending.values()) p.reject(new Error(String(e.message ?? e))); this.pending.clear(); };
  }
  private call<T>(op: string, payload: Record<string, unknown> = {}): Promise<T> {
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, op, ...payload });
    });
  }
  init() {
    const { runScript, makeText, onFindFile, log, ...cloneable } = this.options;
    return this.call<{ version: any }>('init', { options: cloneable, baseUrl: import.meta.url });
  }
  run(source: string, options: RunOptions) {
    const { signal, ...rest } = options;
    return this.call<RunResult>('run', { source, options: rest });
  }
  latex(source: string, options: LatexRunOptions) {
    const { signal, ...rest } = options;
    return this.call<LatexResult>('latex', { source, options: rest });
  }
  addFiles(files: Record<string, string | Uint8Array>) { return this.call<void>('addFiles', { files }); }
  clearCache() { return this.call<void>('clearCache'); }
  preload(bundles: BundleName[]) { return this.call<void>('preload', { bundles }); }
  dispose() { this.worker.terminate(); }
}

export class MetaPost {
  private listeners = new Map<string, Set<Listener>>();
  private queue: Promise<unknown> = Promise.resolve();
  readonly version: { metapost: string; tex: string; build: string } = { metapost: '', tex: '', build: '' };
  private constructor(private backend: Backend, private options: MetaPostOptions) {}

  static async create(options: MetaPostOptions = {}): Promise<MetaPost> {
    if (options.snapshot === undefined) options = { ...options, snapshot: isNode ? 'auto' : 'none' };
    const hasCallbacks = !!(options.runScript || options.makeText || options.onFindFile || options.modules || options.bundleIO);
    const useWorker = options.worker ?? (!isNode && typeof Worker !== 'undefined' && !hasCallbacks);
    if (!isNode && (options.runScript || options.makeText || options.onFindFile) && options.worker === undefined && typeof console !== 'undefined') {
      console.warn('mp-tikz-wasm: runScript/makeText/onFindFile callbacks require in-process mode; running on the main thread');
    }
    let mp!: MetaPost;
    const emit = (ev: string, data: unknown) => mp.emit(ev, data);
    const backend = useWorker ? new WorkerBackend(options, emit) : new InProcessBackend(options, emit);
    mp = new MetaPost(backend, options);
    const { version } = await backend.init();
    Object.assign(mp.version, version);
    return mp;
  }

  /** Compile MetaPost source. Calls are serialised on this instance. */
  run(source: string, options: RunOptions = {}): Promise<RunResult> {
    const timeout = this.options.timeoutMs ?? 20_000;
    const task = () => {
      const p = this.backend.run(source, options);
      if (!(this.backend instanceof WorkerBackend) || !timeout) return p;
      return new Promise<RunResult>((resolve, reject) => {
        const t = setTimeout(() => { this.backend.dispose(); reject(new Error(`mp-tikz-wasm: run exceeded ${timeout} ms; worker terminated`)); }, timeout);
        p.then((r) => { clearTimeout(t); resolve(r); }, (e) => { clearTimeout(t); reject(e); });
        options.signal?.addEventListener('abort', () => { clearTimeout(t); this.backend.dispose(); reject(new Error('aborted')); });
      });
    };
    const next = this.queue.then(task, task);
    this.queue = next.catch(() => undefined);
    return next;
  }
  /** Typeset a whole LaTeX/TikZ (or plain TeX) document to one SVG per page. */
  latex(source: string, options: LatexRunOptions = {}): Promise<LatexResult> {
    const timeout = this.options.timeoutMs ?? 20_000;
    const task = () => {
      const p = this.backend.latex(source, options);
      if (!(this.backend instanceof WorkerBackend) || !timeout) return p;
      return new Promise<LatexResult>((resolve, reject) => {
        const t = setTimeout(() => { this.backend.dispose(); reject(new Error(`mp-tikz-wasm: latex exceeded ${timeout} ms; worker terminated`)); }, timeout);
        p.then((r) => { clearTimeout(t); resolve(r); }, (e) => { clearTimeout(t); reject(e); });
      });
    };
    const next = this.queue.then(task, task);
    this.queue = next.catch(() => undefined);
    return next;
  }
  addFiles(files: Record<string, string | Uint8Array>): Promise<void> { return this.backend.addFiles(files); }
  preload(bundles: BundleName[]): Promise<void> { return this.backend.preload(bundles); }
  clearCache(): Promise<void> { return this.backend.clearCache(); }
  on(event: 'progress', fn: (e: ProgressEvent) => void): () => void;
  on(event: 'log', fn: (line: string) => void): () => void;
  on(event: string, fn: Listener): () => void {
    let s = this.listeners.get(event); if (!s) { s = new Set(); this.listeners.set(event, s); }
    s.add(fn); return () => s!.delete(fn);
  }
  private emit(event: string, data: unknown) { this.listeners.get(event)?.forEach((f) => f(data)); }
  dispose(): void { this.backend.dispose(); }
}

/** A pool of independent instances for batch work (docs/10 §2.3). */
export class MetaPostPool {
  private idle: MetaPost[] = [];
  private waiters: ((mp: MetaPost) => void)[] = [];
  private constructor(private all: MetaPost[]) { this.idle = [...all]; }
  static async create(options: MetaPostOptions & { size?: number } = {}): Promise<MetaPostPool> {
    const size = options.size ?? (typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency ?? 2) : 2);
    const all = await Promise.all(Array.from({ length: Math.max(1, size) }, () => MetaPost.create(options)));
    return new MetaPostPool(all);
  }
  private acquire(): Promise<MetaPost> {
    const mp = this.idle.pop();
    return mp ? Promise.resolve(mp) : new Promise((r) => this.waiters.push(r));
  }
  private release(mp: MetaPost) { const w = this.waiters.shift(); if (w) w(mp); else this.idle.push(mp); }
  async run(source: string, options?: RunOptions): Promise<RunResult> {
    const mp = await this.acquire();
    try { return await mp.run(source, options); } finally { this.release(mp); }
  }
  dispose() { for (const mp of this.all) mp.dispose(); }
}
