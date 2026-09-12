/**
 * worker.ts — the Web Worker entry point (docs/01 §2). Hosts one MetaPostCore
 * and speaks a tiny request/response protocol with index.ts.
 */
import { MetaPostCore } from './core.js';
import { BundleSet, browserIO } from './vfs/bundle.js';
import { resolveBundleSpecs, DEFAULT_BUNDLES } from './bundles-config.js';
import type { MetaPostOptions, RunOptions, LatexRunOptions } from './types.js';

export interface WorkerRequest { id: number; op: 'init' | 'run' | 'latex' | 'addFiles' | 'clearCache' | 'preload' | 'dispose'; [k: string]: unknown }
export interface WorkerResponse { id: number; ok: boolean; result?: unknown; error?: string }
export interface WorkerEvent { event: 'progress' | 'log'; data: unknown }

let core: MetaPostCore | null = null;
let bundles: BundleSet | null = null;
let baseUrl = '';

const post = (m: WorkerResponse | WorkerEvent, transfer?: Transferable[]) => (self as any).postMessage(m, transfer ?? []);

self.onmessage = async (ev: MessageEvent<WorkerRequest>) => {
  const req = ev.data;
  try {
    switch (req.op) {
      case 'init': {
        const options = req.options as MetaPostOptions;
        baseUrl = String(req.baseUrl);
        const io = browserIO();
        bundles = new BundleSet(io);
        for (const spec of resolveBundleSpecs(options.bundles ?? DEFAULT_BUNDLES, options.bundleBaseUrl ?? new URL('./bundles/', baseUrl).href)) {
          await bundles.add(spec);
        }
        await bundles.prefetchEager();
        if (!bundles.canFetchSync) await bundles.prefetchAll();
        const mplibFactory = (await import(/* @vite-ignore */ new URL('./mplib.mjs', baseUrl).href)).default;
        let texFactory, dvisvgmFactory;
        if ((options.tex ?? 'auto') !== 'none') {
          try { texFactory = (await import(/* @vite-ignore */ new URL('./tex.mjs', baseUrl).href)).default; } catch { texFactory = undefined; }
          try { dvisvgmFactory = (await import(/* @vite-ignore */ new URL('./dvisvgm.mjs', baseUrl).href)).default; } catch { dvisvgmFactory = undefined; }
        }
        core = new MetaPostCore({
          mplibFactory, texFactory, dvisvgmFactory, bundles, options,
          onProgress: (e) => post({ event: 'progress', data: e }),
          onLog: (line) => post({ event: 'log', data: line }),
        });
        await core.init();
        post({ id: req.id, ok: true, result: { version: core.version } });
        break;
      }
      case 'run': {
        const r = await core!.run(req.source as string, req.options as RunOptions);
        post({ id: req.id, ok: true, result: r });
        break;
      }
      case 'latex': {
        const r = await core!.latex(req.source as string, req.options as LatexRunOptions);
        post({ id: req.id, ok: true, result: r });
        break;
      }
      case 'addFiles': core!.addFiles(req.files as Record<string, string | Uint8Array>); post({ id: req.id, ok: true }); break;
      case 'clearCache': core!.clearCache(); post({ id: req.id, ok: true }); break;
      case 'preload': {
        const names = req.bundles as string[];
        for (const spec of resolveBundleSpecs(names, new URL('./bundles/', baseUrl).href)) {
          if (!bundles!.manifests.some((m) => m.spec.name === spec.name)) await bundles!.add(spec);
        }
        await bundles!.prefetchAll((f) => names.includes(f.bundle));
        post({ id: req.id, ok: true });
        break;
      }
      case 'dispose': post({ id: req.id, ok: true }); (self as any).close(); break;
    }
  } catch (e: any) {
    const msg = typeof e === 'string' ? e : e?.stack ?? e?.message ?? (() => { try { return JSON.stringify(e); } catch { return String(e); } })();
    post({ id: req.id, ok: false, error: msg });
  }
};
