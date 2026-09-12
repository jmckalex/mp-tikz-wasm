/**
 * core.ts — the orchestrator (docs/01 §3). Runs in a Worker (browser) or on
 * the main thread (Node). Owns one mplib.wasm instance for its lifetime and
 * creates one tex.wasm instance per TeX invocation.
 */
import { MpJob, MpFtype, MPX_FTYPE_TFM, MPX_FTYPE_VF, mpxAddPath, mplibVersion, mplibBuildId, type MplibModule, type MplibFactory } from './mplib.js';
import type { TexFactory, TexModule } from './texengine.js';
import { BundleSet, TEXMF_ROOT } from './vfs/bundle.js';
import { listFiles, mkdirp, writeFileDeep, isUnloadedLazy, ensureLoaded, type EmscriptenFS } from './vfs/lazyfs.js';
import { scanTexBlocks, scanInputs, type TexBlock } from './tex/scanner.js';
import { TexBridge, MemorySnippetCache, resolveEngine, canonicalBody, type Snippet, type ResolvedEngine, type SnippetCache } from './tex/bridge.js';
import { parseMetaPostLog } from './diagnostics.js';
import { postProcessSvg } from './render/svg.js';
import type { MetaPostOptions, RunOptions, RunResult, FigureResult, Diagnostic, RunStats, Figure, OutputFormat, ProgressEvent } from './types.js';

/** Where MetaPost looks for each file type (docs/06 §2). */
export const SEARCH_PATHS: Record<number, string[]> = {
  [MpFtype.program]: ['/work', `${TEXMF_ROOT}/metapost/base`, `${TEXMF_ROOT}/metapost`],
  [MpFtype.memfile]: [`${TEXMF_ROOT}/metapost/base`],
  [MpFtype.metrics]: [`${TEXMF_ROOT}/fonts/tfm`],
  [MpFtype.font]: [`${TEXMF_ROOT}/fonts/type1`],
  [MpFtype.fontmap]: [`${TEXMF_ROOT}/fonts/map`],
  [MpFtype.encoding]: [`${TEXMF_ROOT}/fonts/enc`],
  [MpFtype.text]: ['/work', TEXMF_ROOT],
};
/** bundle path prefixes to consult on a miss, per file type */
const BUNDLE_PREFIX: Record<number, string[]> = {
  [MpFtype.program]: ['metapost/'],
  [MpFtype.memfile]: ['metapost/'],
  [MpFtype.metrics]: ['fonts/tfm/'],
  [MpFtype.font]: ['fonts/type1/'],
  [MpFtype.fontmap]: ['fonts/map/'],
  [MpFtype.encoding]: ['fonts/enc/'],
  [MpFtype.text]: [''],
  [MPX_FTYPE_TFM]: ['fonts/tfm/'],
  [MPX_FTYPE_VF]: ['fonts/vf/'],
};
const DEFAULT_EXT: Record<number, string> = {
  [MpFtype.program]: '.mp', [MpFtype.memfile]: '.mp', [MpFtype.metrics]: '.tfm', [MpFtype.font]: '.pfb',
  [MpFtype.fontmap]: '.map', [MpFtype.encoding]: '.enc', [MPX_FTYPE_TFM]: '.tfm', [MPX_FTYPE_VF]: '.vf',
};

export interface CoreEnv {
  mplibFactory: MplibFactory;
  texFactory?: TexFactory;
  /** bundles merged into /texmf (browser, or Node without texmfDir) */
  bundles?: BundleSet;
  /** Node: real directory mounted at /texmf with NODEFS */
  texmfDir?: string;
  options: MetaPostOptions;
  onProgress?: (e: ProgressEvent) => void;
  onLog?: (line: string) => void;
}

export class MetaPostCore {
  M!: MplibModule;
  private cache: SnippetCache = new MemorySnippetCache();
  private bridge?: TexBridge;
  readonly version: { metapost: string; tex: string; build: string } = { metapost: '', tex: 'pdfTeX 1.40.27 (DVI)', build: '' };
  private userFiles = new Set<string>();

  constructor(private env: CoreEnv) {}

  async init(): Promise<void> {
    const o = this.env.options;
    this.env.onProgress?.({ phase: 'loading', detail: 'mplib.wasm' });
    this.M = await this.env.mplibFactory({
      print: (s: string) => this.env.onLog?.(s),
      printErr: (s: string) => this.env.onLog?.(s),
      ...(o.wasmUrls?.mplib ? { locateFile: (p: string) => (p.endsWith('.wasm') ? o.wasmUrls!.mplib! : p) } : {}),
    });
    const FS = this.M.FS;
    mkdirp(FS, '/work');
    this.installTexmf(FS, this.M.NODEFS);
    FS.chdir('/work');
    mpxAddPath(this.M, `${TEXMF_ROOT}/fonts/tfm`);
    mpxAddPath(this.M, `${TEXMF_ROOT}/fonts/vf`);
    this.M.mpwasmHooks = {
      findFile: (name, ftype, mode) => this.findFile(name, ftype, mode),
      makeText: (text, mode) => this.makeText(text, mode),
      runScript: (script) => this.runScript(script),
    };
    this.version.metapost = mplibVersion(this.M);
    this.version.build = mplibBuildId(this.M);
    if (this.env.texFactory && (o.tex ?? 'auto') !== 'none') {
      this.bridge = new TexBridge({
        texFactory: this.env.texFactory,
        mplib: this.M,
        setupTexFS: (T) => { mkdirp(T.FS, '/work'); this.installTexmf(T.FS, T.NODEFS); this.copyUserFiles(T); },
        cache: this.cache,
        texPreamble: o.texPreamble,
        onLine: this.env.onLog,
        engineId: this.version.build,
        formatIds: { plain: this.formatId('plain'), etex: this.formatId('etex'), latex: this.formatId('latex') },
      });
    }
  }

  private formatId(name: string): string {
    const f = this.env.bundles?.files.get(`web2c/${name}.fmt`);
    return f ? `${name}:${f.sha ?? f.size}` : `${name}:${this.env.texmfDir ?? 'local'}`;
  }

  private installTexmf(FS: EmscriptenFS, NODEFS: unknown): void {
    if (this.env.texmfDir) {
      mkdirp(FS, TEXMF_ROOT);
      FS.mount(NODEFS, { root: this.env.texmfDir }, TEXMF_ROOT);
    } else if (this.env.bundles) {
      this.env.bundles.install(FS, TEXMF_ROOT);
    } else {
      mkdirp(FS, TEXMF_ROOT);
    }
  }

  private copyUserFiles(T: TexModule): void {
    // TeX may \input files the user supplied next to the job
    for (const p of this.userFiles) {
      try { writeFileDeep(T.FS, p, this.M.FS.readFile(p, { encoding: 'binary' }) as Uint8Array); } catch { /* ignore */ }
    }
  }

  // ---- host hooks ---------------------------------------------------------

  /** Last-chance file resolution when the C search failed: consult bundles, then the user hook. */
  private findFile(name: string, ftype: number, mode: string): string | null {
    if (mode[0] !== 'r') return null;
    const base = name.slice(name.lastIndexOf('/') + 1);
    const ext = DEFAULT_EXT[ftype];
    const candidates = ext && !base.endsWith(ext) ? [base, base + ext] : [base];
    const b = this.env.bundles;
    if (b) {
      for (const c of candidates) {
        const f = b.lookup(c, BUNDLE_PREFIX[ftype] ?? ['']);
        if (f) {
          const full = `${TEXMF_ROOT}/${f.path}`;
          if (isUnloadedLazy(this.M.FS, full)) { try { ensureLoaded(this.M.FS, full); } catch { return null; } }
          return full;
        }
      }
    }
    const hook = this.env.options.onFindFile;
    if (hook) {
      const r = hook(name, (['terminal', 'error', 'program', 'log', 'postscript', 'bitmap', 'memfile', 'metrics', 'fontmap', 'font', 'encoding', 'text'] as const)[Math.min(ftype, 11)], 'r');
      if (r) return r;
    }
    return null;
  }

  // per-run state
  private chain: string[] = [];
  private misses: Snippet[] = [];
  private stats!: RunStats;
  private engine: ResolvedEngine | 'none' = 'plain';
  private texDiagnostics: Diagnostic[] = [];

  private makeText(text: string, mode: number): string {
    const user = this.env.options.makeText;
    if (user) { const r = user(text, mode === 1); if (r !== undefined) return r; }
    if (mode === 1) { this.chain.push(text); return ''; }
    if (this.engine === 'none' || !this.bridge) {
      this.misses.push({ key: '', chain: [...this.chain], body: text });
      return 'nullpicture';
    }
    const key = this.bridge.key(this.engine, this.chain, text);
    const hit = this.cache.get(key);
    // mplib injects the returned string as a ONE-line pseudo-file, so an .mpx
    // chunk (several lines, no comments) is joined with spaces (docs/04 §5.1).
    if (hit !== undefined) { this.stats.snippetCacheHits++; return hit.replace(/\r?\n/g, ' '); }
    this.stats.snippetCacheMisses++;
    this.misses.push({ key, chain: [...this.chain], body: text });
    return 'nullpicture';
  }

  private runScript(script: string): string {
    const f = this.env.options.runScript;
    if (!f) return '';   // runscript is opt-in (docs/10 §3)
    try { return String(f(script) ?? ''); } catch (e) { return `errmessage("runscript: ${String(e).replace(/"/g, "'")}")`; }
  }

  // ---- public operations --------------------------------------------------

  addFiles(files: Record<string, string | Uint8Array>): void {
    for (const [name, data] of Object.entries(files)) {
      const p = name.startsWith('/') ? name : `/work/${name}`;
      writeFileDeep(this.M.FS, p, data);
      this.userFiles.add(p);
    }
  }

  clearCache(): void { this.cache.clear(); }

  async run(source: string, ro: RunOptions = {}): Promise<RunResult> {
    const o = this.env.options;
    const t0 = now();
    this.stats = { totalMs: 0, metapostMs: 0, texMs: 0, texRuns: 0, metapostRuns: 0, snippetCacheHits: 0, snippetCacheMisses: 0 };
    this.texDiagnostics = [];
    const FS = this.M.FS;
    const jobName = ro.jobName ?? 'job';
    if (ro.files) this.addFiles(ro.files);
    const before = new Set(listFiles(FS, '/work'));
    writeFileDeep(FS, `/work/${jobName}.mp`, source);
    // Emscripten's MEMFS mtime granularity is fine for the classic path's staleness check
    const formats = new Set<OutputFormat>(Array.isArray(ro.format) ? ro.format : [ro.format ?? 'svg']);

    // 1. scan (docs/05 §3)
    this.env.onProgress?.({ phase: 'scanning' });
    const blocks = this.scanAll(source, `${jobName}.mp`);
    this.engine = resolveEngine(ro.tex ?? o.tex ?? 'auto', blocks, source);
    const useBridge = !!this.bridge && this.engine !== 'none' && (o.extensions ?? true);

    // 2. typeset the misses found by the scan
    if (useBridge && blocks.some((b) => b.kind === 'btex')) {
      const { misses } = this.bridge!.misses(this.engine as ResolvedEngine, blocks);
      if (misses.length) await this.typeset(misses);
    }

    // 3.–5. run MetaPost, re-typesetting on cache misses until a fixpoint
    let job: MpJob | null = null;
    const maxRuns = 1 + (o.maxTexRuns ?? 5);
    for (let iter = 0; iter < maxRuns; iter++) {
      job?.free();
      this.chain = [];
      this.misses = [];
      this.env.onProgress?.({ phase: 'running', current: iter + 1 });
      job = this.runMetaPost(source, jobName, ro);
      if (this.misses.length === 0 || !useBridge) break;
      if (iter === maxRuns - 1) {
        this.texDiagnostics.push({ severity: 'error', source: 'tex', message: `btex blocks still unresolved after ${maxRuns - 1} TeX runs: ${this.misses.map((m) => JSON.stringify(m.body.slice(0, 40))).join(', ')}` });
        break;
      }
      await this.typeset(this.misses);
    }
    const j = job!;

    // 6. render
    this.env.onProgress?.({ phase: 'rendering' });
    const figures: FigureResult[] = [];
    const n = j.figureCount;
    // prologues: an explicit option wins; otherwise the document's own value
    // at the time each figure was shipped out (like mpost; patch 0009), except
    // that SVG defaults to 3 when that value is 0, because prologues<3 SVG has
    // no usable text (docs/07 §3).
    for (let i = 0; i < n; i++) {
      const dims = j.dims(i);
      const fig: FigureResult = { charcode: j.charcode(i), bbox: dims.bbox, width: dims.width, height: dims.height, depth: dims.depth, italicCorrection: dims.italicCorrection };
      if (formats.has('svg')) {
        const svg = j.svg(i, ro.prologues ?? (dims.prologues > 0 ? dims.prologues : 3));
        if (svg != null) fig.svg = postProcessSvg(svg, ro.svg ?? {}, i);
      }
      if (formats.has('eps')) { const ps = j.ps(i, ro.prologues ?? -1, ro.procset ?? -1); if (ps != null) fig.eps = ps; }
      if (formats.has('json')) { const js = j.json(i); if (js != null) fig.json = JSON.parse(js) as Figure; }
      figures.push(fig);
    }

    // 7. finish
    const termOut = j.termOut;
    const logOut = j.logOut;
    const history = Math.max(0, Math.min(4, j.history)) as 0 | 1 | 2 | 3 | 4;
    const diagnostics: Diagnostic[] = [...parseMetaPostLog(termOut), ...this.texDiagnostics];
    if (this.misses.length && !useBridge) {
      diagnostics.push({ severity: 'error', source: 'host', message: this.bridge ? 'btex used but TeX is disabled (tex: "none")' : 'btex used but tex.wasm is not available in this build', snippet: this.misses[0].body });
    }
    const artifacts: Record<string, Uint8Array> = {};
    for (const p of listFiles(FS, '/work')) {
      if (before.has(p) || p === `/work/${jobName}.mp`) continue;
      if (/\.(mpx|dvi|tex)$/.test(p) && /\/mpx[0-9a-z]+\./.test(p)) { try { FS.unlink(p); } catch { /* ignore */ } continue; }
      try { artifacts[p.slice('/work/'.length)] = FS.readFile(p, { encoding: 'binary' }) as Uint8Array; } catch { /* ignore */ }
    }
    if (logOut) artifacts[`${jobName}.log`] = new TextEncoder().encode(logOut);
    j.free();
    this.stats.totalMs = now() - t0;
    const status = history === 0 ? 'ok' : history === 1 ? 'warning' : history === 2 ? 'error' : 'fatal';
    return { status, history, figures, log: termOut, texLog: this.lastTexLog || undefined, diagnostics, stats: this.stats, artifacts };
  }

  private lastTexLog = '';

  private async typeset(misses: Snippet[]): Promise<void> {
    this.env.onProgress?.({ phase: 'typesetting', total: misses.length });
    const r = await this.bridge!.typeset(this.engine as ResolvedEngine, misses);
    this.stats.texRuns++;
    this.stats.texMs += r.ms;
    this.lastTexLog = r.texLog;
    this.texDiagnostics.push(...r.diagnostics);
  }

  private runMetaPost(source: string, jobName: string, ro: RunOptions): MpJob {
    const o = this.env.options;
    const t0 = now();
    const job = new MpJob(this.M, {
      mathMode: o.numberSystem === 'double' ? 1 : o.numberSystem === 'decimal' ? 3 : 0,
      extensions: o.extensions ?? true,
      interaction: o.interaction === 'batch' ? 1 : o.interaction === 'scroll' ? 3 : 2,
      haltOnError: o.haltOnError,
      randomSeed: o.randomSeed ?? 42,
      memName: 'plain',
      jobName,
      recorder: true,
      searchPaths: SEARCH_PATHS,
    });
    let prefix = '';
    if (o.deterministic ?? true) prefix += 'year:=2025; month:=1; day:=1; time:=0; ';
    if (o.numberSystem === 'binary' || o.numberSystem === 'interval') {
      this.texDiagnostics.push({ severity: 'warning', source: 'host', message: `numbersystem ${o.numberSystem} is not built into mplib.wasm; using scaled` });
    }
    for (const [k, v] of Object.entries(ro.internals ?? {})) {
      prefix += typeof v === 'string' ? `${k}:="${v.replace(/"/g, '')}"; ` : `${k}:=${v}; `;
    }
    const cmd = `${prefix}input ${jobName}${(o.autoEnd ?? true) ? '; end.' : ''}`;
    job.run(cmd);
    this.stats.metapostRuns++;
    this.stats.metapostMs += now() - t0;
    return job;
  }

  /**
   * Scan the job and every `input`-ed file reachable from it (lexically),
   * splicing each input file's blocks in at the line of the `input` statement
   * so the verbatimtex chain seen by the pre-scan matches the run's order.
   */
  private scanAll(source: string, fileName: string): TexBlock[] {
    const blocks: TexBlock[] = [];
    const seen = new Set<string>([fileName]);
    const visit = (src: string, name: string) => {
      const mine = scanTexBlocks(src, name);
      const inputs = inputStatements(src);
      let bi = 0;
      const flush = (uptoLine: number) => {
        while (bi < mine.length && mine[bi].line <= uptoLine) { const b = mine[bi++]; b.index = blocks.length; blocks.push(b); }
      };
      for (const inp of inputs) {
        flush(inp.line);
        const resolved = this.resolveInput(inp.name);
        if (!resolved || seen.has(resolved)) continue;
        seen.add(resolved);
        let text: string;
        try { text = this.M.FS.readFile(resolved, { encoding: 'utf8' }) as string; } catch { continue; }
        visit(text, resolved.startsWith('/work/') ? resolved.slice(6) : resolved);
      }
      flush(Infinity);
    };
    visit(source, fileName);
    return blocks;
  }

  private resolveInput(name: string): string | null {
    const FS = this.M.FS;
    const names = name.endsWith('.mp') ? [name] : [name + '.mp', name];
    for (const dir of SEARCH_PATHS[MpFtype.program]) {
      for (const n of names) { const p = `${dir}/${n}`; if (FS.analyzePath(p).exists) return p; }
    }
    for (const n of names) {
      const f = this.env.bundles?.lookup(n, ['metapost/']);
      if (f) return `${TEXMF_ROOT}/${f.path}`;
    }
    return null;
  }
}

function now(): number { return typeof performance !== 'undefined' ? performance.now() : Date.now(); }

/** `input name` statements with their 1-based line numbers (lexical; comments and strings skipped). */
function inputStatements(src: string): { name: string; line: number }[] {
  const out: { name: string; line: number }[] = [];
  const lines = src.split('\n');
  const wanted = new Set(scanInputs(src));
  for (let i = 0; i < lines.length; i++) {
    let l = lines[i];
    const pc = l.indexOf('%'); if (pc >= 0) l = l.slice(0, pc);
    const re = /(^|[^A-Za-z_])input\s+("?)([^\s;"]+)\2/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(l))) if (wanted.has(m[3])) out.push({ name: m[3], line: i + 1 });
  }
  return out;
}
