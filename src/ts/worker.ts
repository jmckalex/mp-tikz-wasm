/**
 * worker.ts — the Web Worker entry point (docs/01 §2). Hosts one MetaPostCore
 * and speaks a tiny request/response protocol with index.ts.
 */
import { MetaPostCore } from './core.js';
import { BundleSet, browserIO } from './vfs/bundle.js';
import { resolveBundleSpecs, DEFAULT_BUNDLES } from './bundles-config.js';
import { Logger, DEFAULT_LOG_LEVEL } from './logger.js';
import type { MetaPostOptions, RunOptions, LatexRunOptions, LogLevel } from './types.js';

export interface WorkerRequest { id: number; op: 'init' | 'run' | 'latex' | 'addFiles' | 'clearCache' | 'preload' | 'prefetch' | 'setLogLevel' | 'dispose'; [k: string]: unknown }
export interface WorkerResponse { id: number; ok: boolean; result?: unknown; error?: string }
export interface WorkerEvent { event: 'progress' | 'log' | 'record'; data: unknown }

let core: MetaPostCore | null = null;
let bundles: BundleSet | null = null;
let logger: Logger | null = null;
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
        // records cross to the main thread, which writes them to the console (or the `logger` option)
        logger = new Logger(options.logLevel ?? DEFAULT_LOG_LEVEL, (r) => post({ event: 'record', data: r }));
        bundles.logger = logger;
        // manifests, hot lists and engine glue all at once: a slow host charges per round trip
        const bundleBase = options.bundleBaseUrl ?? new URL('./bundles/', baseUrl).href;
        const wantTex = (options.tex ?? 'auto') !== 'none';
        const glue = (name: string) => import(/* @vite-ignore */ new URL(name, baseUrl).href).then((m) => m.default, () => undefined);
        const [mplibFactory, texFactory, dvisvgmFactory, luatexFactory] = await Promise.all([
          import(/* @vite-ignore */ new URL('./mplib.mjs', baseUrl).href).then((m) => m.default),
          wantTex ? glue('./tex.mjs') : undefined,
          wantTex ? glue('./dvisvgm.mjs') : undefined,
          wantTex ? glue('./luatex.mjs') : undefined,
          bundles.addAll(resolveBundleSpecs(options.bundles ?? DEFAULT_BUNDLES, bundleBase)),
          bundles.loadHot((bundleBase.endsWith('/') ? bundleBase : bundleBase + '/') + 'hot.json'),
        ]);
        await bundles.prefetchEager();
        if (!bundles.canFetchSync) await bundles.prefetchAll();
        core = new MetaPostCore({
          mplibFactory, texFactory, luatexFactory, dvisvgmFactory, bundles, options, logger,
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
      case 'prefetch': { const n = await bundles!.prefetchHot(req.kinds as string[]); post({ id: req.id, ok: true, result: n }); break; }
      case 'setLogLevel': if (logger) logger.level = req.level as LogLevel; post({ id: req.id, ok: true }); break;
      case 'dispose': post({ id: req.id, ok: true }); (self as any).close(); break;
    }
  } catch (e: any) {
    const msg = typeof e === 'string' ? e : e?.stack ?? e?.message ?? (() => { try { return JSON.stringify(e); } catch { return String(e); } })();
    post({ id: req.id, ok: false, error: msg });
  }
};
