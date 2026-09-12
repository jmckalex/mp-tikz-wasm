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
import { createLazyFile, mkdirp, writeFileDeep, type EmscriptenFS } from './lazyfs.js';

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
    if (!this.io.fetchSync) throw new Error(`metapost-wasm: ${f.path} was not prefetched and this environment cannot load files synchronously (run in a Worker, or call preload())`);
    const data = this.io.fetchSync(f.url);
    this.cache.set(f.path, data);
    return data;
  }

  get canFetchSync(): boolean { return !!this.io.fetchSync; }
  has(path: string): boolean { return this.cache.has(path); }

  /**
   * Materialise the whole tree in the Emscripten FS under /texmf as lazy
   * nodes (or real files for those already in memory), plus an ls-R database
   * so kpathsea never has to walk directories.
   */
  install(FS: EmscriptenFS, root = TEXMF_ROOT): void {
    mkdirp(FS, root);
    for (const { manifest } of this.manifests) for (const d of manifest.dirs ?? []) mkdirp(FS, `${root}/${d}`);
    for (const f of this.files.values()) {
      const full = `${root}/${f.path}`;
      const data = this.cache.get(f.path);
      if (data) { if (!FS.analyzePath(full).exists) writeFileDeep(FS, full, data); continue; }
      createLazyFile(FS, full, f.size, () => this.fetchSyncFile(f));
    }
    writeFileDeep(FS, `${root}/ls-R`, this.lsR());
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
