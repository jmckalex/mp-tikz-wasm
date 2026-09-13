/**
 * bundle.ts — texmf bundles: manifest + files (docs/06 §3–§4).
 *
 * A bundle is a directory (or URL prefix) holding `manifest.json` and the
 * files themselves under `files/<relative path>`. The BundleSet merges any
 * number of bundles into one virtual texmf tree rooted at /texmf.
 *
 * Loading strategies:
 *   - Node:   files are read with fs.readFileSync on demand (always sync).
 *   - Worker: files are fetched with a synchronous XMLHttpRequest on demand.
 *   - Main thread: no sync I/O; everything reachable is prefetched with
 *     fetch() by `prefetchAll()` before the engine runs.
 */
import type { BundleManifest, BundleSpec } from '../types.js';
import { createLazyFile, mkdirp, type EmscriptenFS } from './lazyfs.js';

export interface BundleFile { bundle: string; path: string; size: number; sha?: string; url: string }

export interface BundleIO {
  /** async fetch of bytes */
  fetch(url: string): Promise<Uint8Array>;
  /** sync fetch of bytes, or undefined if this environment cannot do sync I/O */
  fetchSync?: (url: string) => Uint8Array;
  /** fetch + parse JSON */
  fetchJson(url: string): Promise<unknown>;
}

export const TEXMF_ROOT = '/texmf';

function joinUrl(base: string, rel: string): string {
  if (!base.endsWith('/')) base += '/';
  return base + rel;
}

export class BundleSet {
  readonly files = new Map<string, BundleFile>();     // relative texmf path -> file
  readonly byName = new Map<string, BundleFile[]>();   // basename -> files
  readonly manifests: { spec: BundleSpec; manifest: BundleManifest; base: string }[] = [];
  private cache = new Map<string, Uint8Array>();       // in-memory copy of fetched files
  private negative = new Set<string>();
  /** The files a first run of each kind touches (`bundles/hot.json`, written by scripts/make-hotlists.mjs). */
  hot: Record<string, string[]> = {};

  constructor(private io: BundleIO) {}

  /** Load a manifest; `spec.manifestUrl` is the bundle directory/URL (containing manifest.json). */
  async add(spec: BundleSpec): Promise<void> {
    const base = spec.manifestUrl.replace(/\/manifest\.json$/, '');
    const manifest = (await this.io.fetchJson(joinUrl(base, 'manifest.json'))) as BundleManifest;
    this.manifests.push({ spec, manifest, base });
    const blobBase = spec.blobBaseUrl ?? joinUrl(base, 'files');
    for (const [path, info] of Object.entries(manifest.files)) {
      if (this.files.has(path)) continue;      // first bundle wins
      const f: BundleFile = { bundle: manifest.name, path, size: info.size, sha: info.sha, url: joinUrl(blobBase, path) };
      this.files.set(path, f);
      const name = path.slice(path.lastIndexOf('/') + 1);
      const list = this.byName.get(name);
      if (list) list.push(f); else this.byName.set(name, [f]);
    }
  }

  /** Load the hot lists; optional, so a missing file is not an error. */
  async loadHot(url: string): Promise<void> {
    try {
      const h = (await this.io.fetchJson(url)) as { kinds?: Record<string, string[]> } | null;
      if (h && h.kinds) this.hot = h.kinds;
    } catch { /* no hot.json: prefetch() is a no-op */ }
  }

  /** Fetch, in parallel, every file the hot lists name for these kinds that is not in memory yet. Returns how many. */
  async prefetchHot(kinds: string[], concurrency = 16): Promise<number> {
    const paths = new Set<string>();
    for (const k of kinds) for (const p of this.hot[k] ?? []) paths.add(p);
    const wanted: BundleFile[] = [];
    for (const p of paths) { const f = this.files.get(p); if (f && !this.cache.has(f.path)) wanted.push(f); }
    let i = 0;
    await Promise.all(Array.from({ length: Math.min(concurrency, wanted.length) }, async () => {
      while (i < wanted.length) { const f = wanted[i++]; try { await this.fetchAsync(f); } catch { /* the run reports it */ } }
    }));
    return wanted.length;
  }

  /** Every manifest's `eager` list, fetched into memory. */
  async prefetchEager(): Promise<void> {
    const wanted: BundleFile[] = [];
    for (const { manifest } of this.manifests) for (const p of manifest.eager ?? []) { const f = this.files.get(p); if (f) wanted.push(f); }
    await Promise.all(wanted.map((f) => this.fetchAsync(f)));
  }

  /** Fetch every file in the set (for environments without sync I/O). */
  async prefetchAll(filter?: (f: BundleFile) => boolean): Promise<void> {
    const wanted = [...this.files.values()].filter((f) => !this.cache.has(f.path) && (!filter || filter(f)));
    // modest concurrency
    let i = 0;
    const workers = Array.from({ length: 8 }, async () => {
      while (i < wanted.length) { const f = wanted[i++]; await this.fetchAsync(f); }
    });
    await Promise.all(workers);
  }

  async fetchAsync(f: BundleFile): Promise<Uint8Array> {
    const hit = this.cache.get(f.path);
    if (hit) return hit;
    const data = await this.io.fetch(f.url);
    this.cache.set(f.path, data);
    return data;
  }

  /** Synchronous bytes for a file: from memory, else via fetchSync. Throws if impossible. */
  fetchSyncFile(f: BundleFile): Uint8Array {
    const hit = this.cache.get(f.path);
    if (hit) return hit;
    if (!this.io.fetchSync) throw new Error(`mp-tikz-wasm: ${f.path} was not prefetched and this environment cannot load files synchronously (run in a Worker, or call preload())`);
    const data = this.io.fetchSync(f.url);
    this.cache.set(f.path, data);
    return data;
  }

  get canFetchSync(): boolean { return !!this.io.fetchSync; }
  has(path: string): boolean { return this.cache.has(path); }

  /**
   * Materialise the tree in the Emscripten FS under /texmf, plus an ls-R
   * database so kpathsea never has to walk directories. Directories are
   * created on demand: the root gets a lookup hook that creates a child
   * directory or a lazy file the first time anything asks for it, so a run
   * pays for the handful of files it touches, not for the whole tree
   * (installing every node eagerly cost ~60 ms per TeX run).
   */
  install(FS: EmscriptenFS, root = TEXMF_ROOT): void {
    mkdirp(FS, root);
    const index = this.index();
    const lazyDir = (dirPath: string, rel: string) => {
      const node = FS.lookupPath(dirPath).node;
      const origOps = node.node_ops;
      const children = index.dirs.get(rel);
      const materialised = new Set<string>();
      const create = (name: string): boolean => {
        if (materialised.has(name)) return false;
        materialised.add(name);
        const childRel = rel ? `${rel}/${name}` : name;
        const full = `${dirPath}/${name}`;
        if (index.dirs.has(childRel)) { FS.mkdir(full); lazyDir(full, childRel); return true; }
        const f = this.files.get(childRel);
        if (!f) return false;
        const data = this.cache.get(childRel);
        if (data) FS.writeFile(full, data); else createLazyFile(FS, full, f.size, () => this.fetchSyncFile(f));
        return true;
      };
      node.node_ops = {
        ...origOps,
        lookup: (parent: any, name: string) => {
          if (children?.has(name) && create(name)) return FS.lookupNode(parent, name);
          return origOps.lookup(parent, name);
        },
        readdir: (n: any) => { if (children) for (const name of children) create(name); return origOps.readdir(n); },
      };
    };
    lazyDir(root, '');
    FS.writeFile(`${root}/ls-R`, this.lsRText ??= this.lsR());
  }

  private lsRText?: string;
  private indexCache?: { dirs: Map<string, Set<string>> };
  /** directory -> immediate children, for the on-demand tree */
  private index(): { dirs: Map<string, Set<string>> } {
    if (this.indexCache) return this.indexCache;
    const dirs = new Map<string, Set<string>>();
    const ensure = (d: string) => { let s = dirs.get(d); if (!s) { s = new Set(); dirs.set(d, s); } return s; };
    ensure('');
    for (const path of this.files.keys()) {
      const parts = path.split('/');
      let d = '';
      for (let i = 0; i < parts.length - 1; i++) { ensure(d).add(parts[i]); d = d ? `${d}/${parts[i]}` : parts[i]; ensure(d); }
      ensure(d).add(parts[parts.length - 1]);
    }
    for (const { manifest } of this.manifests) for (const d of manifest.dirs ?? []) { const parts = d.split('/'); let p = ''; for (const x of parts) { ensure(p).add(x); p = p ? `${p}/${x}` : x; ensure(p); } }
    return (this.indexCache = { dirs });
  }

  /** kpathsea ls-R database text for the merged tree. */
  lsR(): string {
    const dirs = new Map<string, string[]>();
    const ensure = (d: string) => { let l = dirs.get(d); if (!l) { l = []; dirs.set(d, l); } return l; };
    ensure('.');
    for (const path of this.files.keys()) {
      const parts = path.split('/');
      let d = '.';
      for (let i = 0; i < parts.length - 1; i++) {
        const sub = parts[i];
        const list = ensure(d);
        if (!list.includes(sub)) list.push(sub);
        d = d + '/' + sub;
        ensure(d);
      }
      ensure(d).push(parts[parts.length - 1]);
    }
    let out = '% ls-R -- filename database for kpathsea; do not change this line.\n';
    for (const d of [...dirs.keys()].sort()) {
      out += `\n${d}:\n`;
      for (const e of dirs.get(d)!.sort()) out += e + '\n';
    }
    return out;
  }

  /** Find bundle files by bare name (e.g. "cmr10.tfm"), optionally restricted to a directory prefix. */
  lookup(name: string, prefixes?: string[]): BundleFile | undefined {
    const list = this.byName.get(name);
    if (!list) return undefined;
    if (!prefixes) return list[0];
    for (const p of prefixes) { const f = list.find((x) => x.path.startsWith(p)); if (f) return f; }
    return undefined;
  }

  noteMiss(key: string): void { this.negative.add(key); }
  isMiss(key: string): boolean { return this.negative.has(key); }
}

/** Browser I/O: fetch() plus a synchronous XHR that only works inside a Worker. */
export function browserIO(): BundleIO {
  const inWorker = typeof (globalThis as any).WorkerGlobalScope !== 'undefined' && typeof (globalThis as any).importScripts === 'function';
  const io: BundleIO = {
    async fetch(url) { const r = await fetch(url); if (!r.ok) throw new Error(`fetch ${url}: ${r.status}`); return new Uint8Array(await r.arrayBuffer()); },
    async fetchJson(url) { const r = await fetch(url); if (!r.ok) throw new Error(`fetch ${url}: ${r.status}`); return r.json(); },
  };
  if (inWorker && typeof XMLHttpRequest !== 'undefined') {
    io.fetchSync = (url) => {
      // one progress event per on-demand file, so the caller's stall watchdog sees a slow host at work
      try { (globalThis as any).postMessage({ event: 'progress', data: { phase: 'fetching', detail: url.slice(url.lastIndexOf('/') + 1) } }); } catch { /* not a worker */ }
      const xhr = new XMLHttpRequest();
      xhr.open('GET', url, false);
      xhr.responseType = 'arraybuffer';
      xhr.send(null);
      if (xhr.status < 200 || xhr.status >= 300) throw new Error(`sync fetch ${url}: ${xhr.status}`);
      return new Uint8Array(xhr.response as ArrayBuffer);
    };
  }
  return io;
}
