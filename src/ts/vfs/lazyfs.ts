/**
 * lazyfs.ts — lazily-loaded files in the Emscripten MEMFS (docs/06 §4.3).
 *
 * A lazy file is a real MEMFS node whose size is known up front (so that
 * stat(), readdir() and kpathsea's ls-R walks work) and whose bytes are
 * fetched synchronously the first time anything reads it. The loader must be
 * synchronous: a sync XMLHttpRequest inside a Web Worker, or fs.readFileSync
 * in Node. On the browser main thread there is no synchronous loader, so the
 * caller must prefetch (see bundle.ts).
 */

export interface EmscriptenFS {
  mkdir(path: string, mode?: number): void;
  writeFile(path: string, data: Uint8Array | string, opts?: { encoding?: string }): void;
  readFile(path: string, opts?: { encoding?: 'binary' | 'utf8' }): Uint8Array | string;
  analyzePath(path: string): { exists: boolean; object?: any; isRoot?: boolean };
  createFile(parent: string, name: string, properties: object, canRead: boolean, canWrite: boolean): any;
  lookupPath(path: string, opts?: object): { node: any };
  unlink(path: string): void;
  readdir(path: string): string[];
  stat(path: string): { size: number; mode: number; mtime: Date };
  isDir(mode: number): boolean;
  isFile(mode: number): boolean;
  chdir(path: string): void;
  cwd(): string;
  mount(type: unknown, opts: object, mountpoint: string): void;
  utime?(path: string, atime: number, mtime: number): void;
  [k: string]: any;
}

export type LazyLoader = (path: string) => Uint8Array;

const LAZY = Symbol('mpwasm.lazy');

/** mkdir -p */
export function mkdirp(FS: EmscriptenFS, dir: string): void {
  const parts = dir.split('/').filter(Boolean);
  let cur = '';
  for (const p of parts) {
    cur += '/' + p;
    const a = FS.analyzePath(cur);
    if (!a.exists) FS.mkdir(cur);
  }
}

/** Create a lazy node at `path` with the given size. Returns false if a file already exists there. */
export function createLazyFile(FS: EmscriptenFS, path: string, size: number, load: LazyLoader): boolean {
  const i = path.lastIndexOf('/');
  const dir = i > 0 ? path.slice(0, i) : '/';
  const name = path.slice(i + 1);
  if (FS.analyzePath(path).exists) return false;
  mkdirp(FS, dir);
  const node = FS.createFile(dir, name, {}, true, true);
  const state = { loaded: false, data: null as Uint8Array | null };
  node[LAZY] = state;
  const origOps = node.stream_ops;
  const origUsedBytes = Object.getOwnPropertyDescriptor(node, 'usedBytes');
  Object.defineProperty(node, 'usedBytes', {
    configurable: true, enumerable: true,
    get: () => (state.loaded ? state.data!.length : size),
    set: () => { /* ignored until loaded */ },
  });
  const force = () => {
    if (state.loaded) return;
    const data = load(path);
    state.loaded = true;
    state.data = data;
    // become an ordinary MEMFS file again
    delete node.usedBytes;
    if (origUsedBytes) Object.defineProperty(node, 'usedBytes', origUsedBytes);
    node.contents = data;
    node.usedBytes = data.length;
    node.stream_ops = origOps;
  };
  const ops: Record<string, any> = {};
  for (const k of Object.keys(origOps)) {
    ops[k] = (...args: unknown[]) => { force(); return origOps[k](...args); };
  }
  node.stream_ops = ops;
  return true;
}

/** True if `path` is a lazy node that has not been fetched yet. */
export function isUnloadedLazy(FS: EmscriptenFS, path: string): boolean {
  const a = FS.analyzePath(path);
  if (!a.exists || !a.object) return false;
  const st = a.object[LAZY];
  return !!st && !st.loaded;
}

/** Force-load a lazy node (no-op for ordinary files). */
export function ensureLoaded(FS: EmscriptenFS, path: string): void {
  const a = FS.analyzePath(path);
  if (!a.exists || !a.object) return;
  const st = a.object[LAZY];
  if (st && !st.loaded) {
    // trigger through the stream ops
    const fd = FS.open(path, 'r');
    const buf = new Uint8Array(1);
    FS.read(fd, buf, 0, 1, 0);
    FS.close(fd);
  }
}

/** Write a text or binary file, creating directories as needed. */
export function writeFileDeep(FS: EmscriptenFS, path: string, data: Uint8Array | string): void {
  const i = path.lastIndexOf('/');
  if (i > 0) mkdirp(FS, path.slice(0, i));
  if (FS.analyzePath(path).exists) { try { FS.unlink(path); } catch { /* ignore */ } }
  FS.writeFile(path, data);
}

/** Recursively collect regular files under `dir` (used to harvest artifacts). */
export function listFiles(FS: EmscriptenFS, dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const name of FS.readdir(d)) {
      if (name === '.' || name === '..') continue;
      const p = d === '/' ? '/' + name : d + '/' + name;
      const st = FS.stat(p);
      if (FS.isDir(st.mode)) walk(p); else out.push(p);
    }
  };
  walk(dir);
  return out;
}
