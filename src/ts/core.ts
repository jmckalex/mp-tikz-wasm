/**
 * core.ts — the orchestrator (docs/01 §3). Runs in a Worker (browser) or on
 * the main thread (Node). Owns one mplib.wasm instance for its lifetime and
 * creates one tex.wasm instance per TeX invocation.
 */
import { MpJob, MpFtype, MP_FTYPE_NAMES, MPX_FTYPE_TFM, MPX_FTYPE_VF, mpxAddPath, mplibVersion, mplibBuildId, type MplibModule, type MplibFactory } from './mplib.js';
import { runTex, type TexFactory, type TexModule } from './texengine.js';
import { runDvisvgm, type DvisvgmFactory } from './dvisvgm.js';
import { dviSpecials, describeLostPostScript } from './postscript.js';
import type { Ghostscript } from './ghostscript.js';
import { BundleSet, TEXMF_ROOT } from './vfs/bundle.js';
import { listFiles, mkdirp, writeFileDeep, isUnloadedLazy, ensureLoaded, type EmscriptenFS } from './vfs/lazyfs.js';
import { scanTexBlocks, scanInputs, type TexBlock } from './tex/scanner.js';
import { TexBridge, MemorySnippetCache, resolveEngine, canonicalBody, type Snippet, type ResolvedEngine, type SnippetCache } from './tex/bridge.js';
import { parseMetaPostLog } from './diagnostics.js';
import { postProcessSvg } from './render/svg.js';
import { Logger, silentLogger, ms, plural } from './logger.js';
import type { MetaPostOptions, RunOptions, RunResult, FigureResult, Diagnostic, RunStats, Figure, OutputFormat, ProgressEvent, LatexRunOptions, LatexResult } from './types.js';

/** TEXMFVAR in the bundled texmf.cnf — where luaotfload keeps its font cache. */
const TEXMF_VAR = '/texmf-var';
/**
 * luaotfload's font-name database, prebuilt against the bundled tree by
 * scripts/make-fontdb.mjs and shipped in the `opentype` bundle under
 * FONT_DB_SEED. Without it every fresh engine builds the database on its
 * first font request by opening every face it can see (72 of them).
 */
const FONT_DB = 'luaotfload-names.lua.gz';
const FONT_DB_SEED = `${TEXMF_ROOT}/luaotfload/${FONT_DB}`;
const FONT_DB_PATH = `${TEXMF_VAR}/luatex-cache/generic/names/${FONT_DB}`;

/** The local references (href="#id") in an SVG that name no element in it. */
export function danglingRefs(svg: string): string[] {
  const ids = new Set<string>();
  for (const m of svg.matchAll(/\bid=(["'])([^"']+)\1/g)) ids.add(m[2]);
  const missing = new Set<string>();
  for (const m of svg.matchAll(/href=(["'])#([^"']+)\1/g)) if (!ids.has(m[2])) missing.add(m[2]);
  return [...missing];
}

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
  /** luatex.wasm, same module interface as tex.wasm; needed for engine 'lualatex' / 'luatex' */
  luatexFactory?: TexFactory;
  dvisvgmFactory?: DvisvgmFactory;
  /** the Ghostscript module for dvisvgm's PostScript (ghostscript.ts), when enabled; null if it cannot be loaded */
  ghostscript?: () => Promise<Ghostscript | null>;
  /** bundles merged into /texmf (browser, or Node without texmfDir) */
  bundles?: BundleSet;
  /** Node: real directory mounted at /texmf with NODEFS */
  texmfDir?: string;
  options: MetaPostOptions;
  onProgress?: (e: ProgressEvent) => void;
  onLog?: (line: string) => void;
  /** where every part of a run reports (docs/08 §4); silent if absent */
  logger?: Logger;
}

export class MetaPostCore {
  M!: MplibModule;
  private cache: SnippetCache = new MemorySnippetCache();
  private bridge?: TexBridge;
  readonly version: { metapost: string; tex: string; build: string } = { metapost: '', tex: 'pdfTeX 1.40.27 (DVI)', build: '' };
  private userFiles = new Set<string>();
  /**
   * luaotfload's font cache (TEXMF_VAR), carried from one LuaTeX run to the
   * next. Parsing an OpenType face costs about a second, and every TeX run
   * gets a fresh filesystem, so without this each render pays that again.
   */
  private texmfVar = new Map<string, Uint8Array>();
  private get logger(): Logger { return this.env.logger ?? silentLogger; }

  constructor(private env: CoreEnv) {}

  async init(): Promise<void> {
    const o = this.env.options;
    this.progress({ phase: 'loading', detail: 'mplib.wasm' });
    // mplib's own stdout/stderr (dvitomp, the runtime) and, through the termLine hook, MetaPost's terminal
    // as it is written: the raw 'log' event, the last lines for an abort message, and the debug log
    const note = (s: string) => { this.recentOutput.push(s); if (this.recentOutput.length > 20) this.recentOutput.shift(); this.env.onLog?.(s); this.logger.debug('metapost', s); };
    this.M = await this.env.mplibFactory({
      print: note,
      printErr: note,
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
      termLine: note,
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
        onLine: (l) => { this.env.onLog?.(l); this.logger.debug('tex', l); },
        engineId: this.version.build,
        formatIds: { plain: this.formatId('plain'), etex: this.formatId('etex'), latex: this.formatId('latex') },
      });
    }
    const b = this.env.bundles;
    this.logger.info('host', `ready: MetaPost ${this.version.metapost}, ${this.bridge ? this.version.tex : 'no TeX'}${this.env.luatexFactory ? ', LuaTeX' : ''}${this.env.dvisvgmFactory ? ', dvisvgm' : ''}; ${b ? `${plural(b.manifests.length, 'bundle')}, ${plural(b.files.size, 'file')}` : this.env.texmfDir ? `texmf ${this.env.texmfDir}` : 'no texmf tree'}`);
  }

  private progress(e: ProgressEvent): void {
    this.env.onProgress?.(e);
    this.logger.debug('host', `${e.phase}${e.detail ? ` ${e.detail}` : ''}${e.current !== undefined ? ` ${e.current}` : ''}${e.total !== undefined ? ` (${e.total})` : ''}`);
  }

  /** The errors and warnings of a finished run, one record each; a MetaPost help paragraph is indented under its error. */
  private report(diagnostics: Diagnostic[]): void {
    for (const d of diagnostics) {
      const where = d.file ? `${d.file}${d.line ? `:${d.line}` : ''}: ` : d.line ? `line ${d.line}: ` : '';
      const help = d.help?.length ? '\n' + d.help.map((h) => `  ${h}`).join('\n') : '';
      this.logger.log(d.severity === 'error' ? 'error' : 'warn', d.source, `${where}${d.message}${help}`);
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

  /** Restore the font cache this instance has accumulated (LuaTeX runs only). */
  private installTexmfVar(FS: EmscriptenFS): void {
    mkdirp(FS, TEXMF_VAR);
    if (!this.texmfVar.has(FONT_DB_PATH)) this.seedFontDb(FS);
    for (const [p, bytes] of this.texmfVar) writeFileDeep(FS, p, bytes);
  }

  /**
   * Start the font cache from the prebuilt name database, if the tree has one
   * (the `opentype` bundle, or a mounted texmfDir built by make-fontdb). Its
   * paths are the /texmf ones every instance sees; luaotfload checks only the
   * index version, and rescans by itself when a lookup misses.
   */
  private seedFontDb(FS: EmscriptenFS): void {
    if (!FS.analyzePath(FONT_DB_SEED).exists) return;
    try {
      ensureLoaded(FS, FONT_DB_SEED);
      this.texmfVar.set(FONT_DB_PATH, FS.readFile(FONT_DB_SEED, { encoding: 'binary' }) as Uint8Array);
      this.logger.trace('host', `font cache: seeded from ${FONT_DB_SEED}`);
    } catch (e) {
      this.logger.warn('host', `font cache: cannot read ${FONT_DB_SEED}: ${(e as Error)?.message ?? e}`);
    }
  }

  /** Keep whatever luaotfload wrote, so the next run starts warm. */
  private collectTexmfVar(FS: EmscriptenFS): void {
    const kept = new Map<string, Uint8Array>();
    try {
      for (const p of listFiles(FS, TEXMF_VAR)) kept.set(p, FS.readFile(p, { encoding: 'binary' }) as Uint8Array);
    } catch { return; }          // nothing was written; keep what we had
    let bytes = 0; for (const v of kept.values()) bytes += v.length;
    this.logger.trace('host', `font cache: ${plural(kept.size, 'file')}, ${(bytes / 1024).toFixed(0)} KB`);
    this.texmfVar = kept;
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
    const r = this.findFileImpl(name, ftype);
    this.logger.trace('host', `find_file ${name} (${ftypeName(ftype)}): ${r ?? 'not found'}`);
    return r;
  }
  private findFileImpl(name: string, ftype: number): string | null {
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
    this.logger.trace('host', `btex ${hit !== undefined ? 'cached' : 'miss'}: ${JSON.stringify(text.length > 60 ? text.slice(0, 57) + '...' : text)}`);
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
    this.recentOutput = [];
    const FS = this.M.FS;
    const jobName = ro.jobName ?? 'job';
    if (ro.files) this.addFiles(ro.files);
    const before = new Set(listFiles(FS, '/work'));
    writeFileDeep(FS, `/work/${jobName}.mp`, source);
    // Emscripten's MEMFS mtime granularity is fine for the classic path's staleness check
    const formats = new Set<OutputFormat>(Array.isArray(ro.format) ? ro.format : [ro.format ?? 'svg']);

    // 1. scan (docs/05 §3)
    this.progress({ phase: 'scanning' });
    const blocks = this.scanAll(source, `${jobName}.mp`);
    this.engine = resolveEngine(ro.tex ?? o.tex ?? 'auto', blocks, source);
    const useBridge = !!this.bridge && this.engine !== 'none' && (o.extensions ?? true);
    const nBtex = blocks.filter((b) => b.kind === 'btex').length;
    this.logger.info('host', `run ${jobName}.mp: ${source.length} bytes, ${[...formats].join('+')}${nBtex ? `, ${plural(nBtex, 'btex block')} via ${this.engine}` : ''}`);

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
      this.progress({ phase: 'running', current: iter + 1 });
      job = this.runMetaPost(source, jobName, ro);
      this.logger.debug('host', `MetaPost pass ${iter + 1}: history ${job.history}${this.misses.length ? `, ${plural(this.misses.length, 'label')} to typeset` : ''}`);
      if (this.misses.length === 0 || !useBridge) break;
      if (iter === maxRuns - 1) {
        this.texDiagnostics.push({ severity: 'error', source: 'tex', message: `btex blocks still unresolved after ${maxRuns - 1} TeX runs: ${this.misses.map((m) => JSON.stringify(m.body.slice(0, 40))).join(', ')}` });
        break;
      }
      await this.typeset(this.misses);
    }
    const j = job!;

    // 6. render
    this.progress({ phase: 'rendering' });
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
    if (this.logger.enabled('trace')) for (const f of j.openedFiles) this.logger.trace('metapost', `opened ${f.name} (${ftypeName(f.type)}) = ${f.path}`);
    j.free();
    this.stats.totalMs = now() - t0;
    const status = history === 0 ? 'ok' : history === 1 ? 'warning' : history === 2 ? 'error' : 'fatal';
    this.report(diagnostics);
    if (history >= 3 && !diagnostics.some((d) => d.severity === 'error')) this.logger.error('metapost', `fatal error (history ${history}): ${termOut.trimEnd().split('\n').pop() ?? ''}`);
    this.logger.info('host', `run ${jobName}.mp: ${status}, ${plural(figures.length, 'figure')} in ${ms(this.stats.totalMs)} (MetaPost ${ms(this.stats.metapostMs)}${this.stats.metapostRuns > 1 ? ` in ${this.stats.metapostRuns} passes` : ''}${this.stats.texRuns ? `, TeX ${ms(this.stats.texMs)} in ${plural(this.stats.texRuns, 'run')}` : ''}${this.stats.snippetCacheHits ? `, ${plural(this.stats.snippetCacheHits, 'cached label')}` : ''})`);
    return { status, history, figures, log: termOut, texLog: this.lastTexLog || undefined, diagnostics, stats: this.stats, artifacts };
  }

  private lastTexLog = '';
  private recentOutput: string[] = [];

  /**
   * Typeset a complete LaTeX (or plain TeX) document with tex.wasm and convert
   * every page to SVG with dvisvgm.wasm — the TikZ/PGF pipeline. Text becomes
   * glyph outlines unless fonts: 'woff2' is requested.
   */
  async latex(source: string, lo: LatexRunOptions = {}): Promise<LatexResult> {
    const t0 = now();
    if (!this.env.texFactory) throw new Error('mp-tikz-wasm: tex.wasm is not available in this build');
    const pdfOut = lo.output === 'pdf';
    if (!pdfOut && !this.env.dvisvgmFactory) throw new Error('mp-tikz-wasm: dvisvgm.wasm is not available in this build');
    const job = lo.jobName ?? 'doc';
    let engine = lo.engine ?? 'latex';
    if (engine === 'auto') engine = needsLuaTeX(source) ? 'lualatex' : /\\bye\b/.test(source) ? 'plain' : 'latex';
    const lua = engine === 'lualatex' || engine === 'luatex';
    if (lua && !this.env.luatexFactory) throw new Error('mp-tikz-wasm: luatex.wasm is not available in this build');
    // 'plain' is plain TeX with e-TeX (TeX Live's etex), which PGF requires;
    // 'tex' is Knuth-compatible plain.fmt without it; the LuaTeX engines use
    // TeX Live's DVI-mode formats dvilualatex / dviluatex.
    let fmt: string = engine === 'plain' ? 'etex' : engine === 'lualatex' ? 'dvilualatex' : engine === 'luatex' ? 'dviluatex' : engine;
    const progname = engine === 'plain' ? 'etex' : lua ? fmt : engine;
    // the pre-warmed snapshot: latex.fmt with pgf/pgfplots/tikz-cd preloaded
    const snapshot = lo.snapshot ?? this.env.options.snapshot ?? 'auto';
    // (not for PDF output: the snapshot has PGF's dvisvgm driver built in)
    if (engine === 'latex' && snapshot !== 'none' && !pdfOut && this.hasSnapshot()) {
      const usesTikz = /\\usepackage\s*(\[[^\]]*\])?\s*\{[^}]*\b(tikz|pgfplots|tikz-cd)\b|\\documentclass\s*\[[^\]]*\btikz\b/.test(source);
      if (snapshot === 'tikz' || usesTikz) fmt = 'tikz';
    }
    if (lo.files) this.addFiles(lo.files);
    // PGF's default DVI driver (dvips) draws with PostScript specials, which
    // dvisvgm can only interpret through Ghostscript. PGF ships a dvisvgm
    // driver that emits SVG directly, so select it unless told otherwise --
    // or, for PDF output, the driver of the engine writing the PDF.
    let doc = source;
    if ((lo.pgfDriver ?? 'dvisvgm') === 'dvisvgm') {
      const driver = !pdfOut ? 'pgfsys-dvisvgm.def' : lua ? 'pgfsys-luatex.def' : 'pgfsys-pdftex.def';
      const line = `\\def\\pgfsysdriver{${driver}}`;
      doc = source.startsWith('%&') ? source.replace(/^([^\n]*\n)/, `$1${line}`) : line + source;  // same first line: no line-number shift
    }
    this.logger.info('host', `latex ${job}.tex: ${source.length} bytes, engine ${engine}, format ${fmt}${pdfOut ? ', PDF output' : ''}`);
    this.progress({ phase: 'typesetting', detail: engine });
    // 1. TeX → DVI
    let dvi: Uint8Array | null = null;
    let pdf: Uint8Array | null = null;
    const outName = `${job}.${pdfOut ? 'pdf' : 'dvi'}`;
    let texLog = '';
    const artifacts: Record<string, Uint8Array> = {};
    const tex = await runTex(lua ? this.env.luatexFactory! : this.env.texFactory, {
      program: lua ? '/bin/luatex' : '/bin/pdftex',
      // LuaTeX has no -parse-first-line option (%& lines are honoured through texmf.cnf instead)
      // -output-format=pdf switches pdfTeX (\pdfoutput) or LuaTeX (\outputmode) to PDF after the
      // format is loaded, so the same formats serve both outputs and the source is left untouched
      args: [`-fmt=${fmt}`, `-progname=${progname}`, '-interaction=nonstopmode', ...(lua ? [] : ['-parse-first-line']), ...(pdfOut ? ['-output-format=pdf'] : []), `-jobname=${job}`, `${job}.tex`],
      setup: (M) => { mkdirp(M.FS, '/work'); this.installTexmf(M.FS, M.NODEFS); if (lua) this.installTexmfVar(M.FS); this.copyUserFiles(M); writeFileDeep(M.FS, `/work/${job}.tex`, doc); M.FS.chdir('/work'); },
      collect: (M) => {
        if (lua) this.collectTexmfVar(M.FS);
        let out: Uint8Array | null;
        try { out = M.FS.readFile(`/work/${outName}`, { encoding: 'binary' }) as Uint8Array; } catch { out = null; }
        if (pdfOut) pdf = out; else dvi = out;
        try { texLog = M.FS.readFile(`/work/${job}.log`, { encoding: 'utf8' }) as string; } catch { texLog = ''; }
        for (const p of listFiles(M.FS, '/work')) {
          const name = p.slice('/work/'.length);
          if (name === `${job}.tex` || name === outName || name === `${job}.log` || this.userFiles.has(p)) continue;
          try { artifacts[name] = M.FS.readFile(p, { encoding: 'binary' }) as Uint8Array; } catch { /* ignore */ }
        }
      },
      onLine: (l) => { this.env.onLog?.(l); this.logger.debug('tex', l); },
    });
    const written = (pdfOut ? pdf : dvi) as Uint8Array | null;
    this.logger.info('host', `TeX: ${written ? `${written.length}-byte ${pdfOut ? 'PDF' : 'DVI'}` : `no ${pdfOut ? 'PDF' : 'DVI'}`} in ${ms(tex.ms)}${tex.exitCode ? `, exit ${tex.exitCode}` : ''}`);
    const diagnostics = parseTexLogDocument(texLog || tex.log, `${job}.tex`).filter((d) => {
      // environmental noise, not the document's doing: there is never a shell here
      if (/^shellesc: Shell escape disabled/.test(d.message)) return false;
      if (/^epstopdf: Shell escape feature is not enabled/.test(d.message)) return false;   // PDF output: graphics' epstopdf
      // Without the `opentype` bundle LuaLaTeX probes for the OpenType font loader, does
      // not find it and reverts to OT1 and the Type 1 fonts. That is environmental, not the
      // document's doing. Anything else luaotfload says -- a missing face, a bad feature --
      // is about this document and has to get through.
      if (/luaotfload/.test(d.message) && /not found|reverting to OT1/.test(d.message)) return false;
      // the snapshot preloads pgfplots; its compat notice only concerns documents that use it
      if (fmt === 'tikz' && /^pgfplots: running in backwards compatibility mode/.test(d.message) && !/pgfplots/.test(source)) return false;
      return true;
    });
    // LaTeX runs are full of benign package warnings, so unlike MetaPost's
    // history the status only turns on errors: ok | error | fatal (no DVI).
    let status: LatexResult['status'] = (tex.exitCode === 0 && !diagnostics.some((d) => d.severity === 'error')) ? 'ok' : 'error';
    const pages: string[] = [];
    const danglingPages: string[] = [];
    let dvisvgmLog = '';
    let dvisvgmMs = 0;
    // 2. DVI → SVG (PDF output is finished: TeX wrote it)
    if (pdfOut) {
      if (!pdf) {
        status = diagnostics.some((d) => d.severity === 'error') ? 'error' : 'fatal';
        if (!diagnostics.length) diagnostics.push({ severity: 'error', source: 'tex', message: `TeX produced no PDF (exit ${tex.exitCode})` });
      }
    } else if (dvi) {
      const dviBytes: Uint8Array = dvi;
      this.progress({ phase: 'rendering', detail: 'dvisvgm' });
      // dvisvgm's verbosity is a bit set: 3 = errors and warnings, 7 = also its progress messages, wanted when they are being logged
      const args = ['--no-mktexmf', '--exact-bbox', this.logger.enabled('debug') ? '-v7' : '-v3', `--page=${lo.pages === undefined || lo.pages === 'all' ? '1-' : String(lo.pages)}`, '-o', `${job}-%p.svg`];
      if (lo.fonts === 'woff2') args.push('--font-format=woff2'); else args.push('--no-fonts');
      if (lo.bbox) args.push(`--bbox=${lo.bbox}`);
      args.push(...(lo.dvisvgmArgs ?? []), `${job}.dvi`);
      // PostScript that dvisvgm can only draw through Ghostscript (postscript.ts).
      // Nearly every LaTeX DVI has some PostScript that draws nothing (the l3
      // kernel's header, hyperref's pdfmarks); Ghostscript is loaded only for the
      // rest, so every other document renders exactly as without it.
      const lost = describeLostPostScript(dviSpecials(dviBytes));
      const gs = lost && this.env.ghostscript ? await this.env.ghostscript() : null;
      if (gs) this.logger.info('host', `PostScript (${lost}): dvisvgm runs it through Ghostscript`);
      let r: Awaited<ReturnType<typeof runDvisvgm>>;
      try {
        r = await runDvisvgm(this.env.dvisvgmFactory!, {   // checked at the top for SVG output
          args,
          ...(gs ? { module: { gsBridge: gs.bridge() } } : {}),
          // Ghostscript opens files itself (an EPS is `(fig.eps) run`): it sees dvisvgm's /work and /texmf
          setup: (M) => {
            mkdirp(M.FS, '/work'); this.installTexmf(M.FS, M.NODEFS); this.copyUserFiles(M);
            // what TeX wrote beside the job (an EPS from filecontents, say), as a native
            // dvisvgm run in the same directory would see it
            for (const [name, data] of Object.entries(artifacts)) writeFileDeep(M.FS, `/work/${name}`, data);
            writeFileDeep(M.FS, `/work/${job}.dvi`, dviBytes); M.FS.chdir('/work');
            // Ghostscript runs a document's PostScript without SAFER (dvisvgm asks for
            // -dDELAYSAFER and never sets it), so it gets only in-memory trees: /work, and
            // /texmf unless that is a real directory (texmfDir, mounted with NODEFS)
            gs?.mount(M.FS, this.env.texmfDir ? ['/work'] : ['/work', TEXMF_ROOT]);
          },
          collect: (M) => {
            const names = listFiles(M.FS, '/work').filter((p) => new RegExp(`^/work/${job.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(\\d+)\\.svg$`).test(p))
              .sort((a, b) => Number(/-(\d+)\.svg$/.exec(a)![1]) - Number(/-(\d+)\.svg$/.exec(b)![1]));
            for (let i = 0; i < names.length; i++) {
              const svg = M.FS.readFile(names[i], { encoding: 'utf8' }) as string;
              const dangling = danglingRefs(svg);
              if (dangling.length) danglingPages.push(`page ${i + 1}: ${plural(dangling.length, 'reference')} (${dangling.slice(0, 3).join(', ')}${dangling.length > 3 ? ', …' : ''})`);
              pages.push(lo.svg ? postProcessSvg(svg, lo.svg, i) : svg);
            }
          },
          onLine: (l) => { this.env.onLog?.(l); this.logger.debug('dvisvgm', l); },
        });
      } finally {
        gs?.unmount();
      }
      dvisvgmLog = r.log; dvisvgmMs = r.ms;
      // dvisvgm carries on when a font has no outline file (no map entry, no .pfb):
      // it writes <use> references to glyphs it never defines and exits 0, so the
      // text silently vanishes -- and the tags would cache that. Seen with a stale,
      // HTTP-cached font map that predated a font. Make both signs of it errors.
      const noFont = [...new Set([...r.log.matchAll(/no font file found for '([^']+)'/g)].map((m) => m[1]))];
      if (noFont.length) {
        status = 'error';
        diagnostics.push({ severity: 'error', source: 'host', message: `dvisvgm found no font file for ${noFont.join(', ')}: their glyphs are missing from the SVG (no entry in the font map, or the font is not bundled)` });
      } else if (danglingPages.length) {
        status = 'error';
        diagnostics.push({ severity: 'error', source: 'host', message: `the SVG refers to glyphs it does not define -- ${danglingPages.join('; ')}` });
      }
      // PostScript that carried part of the picture and was skipped: no Ghostscript
      // (not enabled, or not loadable), or Ghostscript gave up on it
      if (lost && (!gs || /PostScript specials? ignored/.test(r.log))) {
        const why = !this.env.ghostscript ? "dvisvgm runs PostScript through Ghostscript: add the 'ghostscript' bundle"
          : !gs ? 'the Ghostscript module could not be loaded' : 'Ghostscript did not run it';
        diagnostics.push({ severity: 'warning', source: 'host', message: `PostScript was ignored, so the SVG is missing ${lost}: ${why}`, help: ['TikZ, pgfplots, tikz-cd and MetaPost draw without PostScript and are unaffected'] });
      }
      if (gs) {
        for (const m of new Set([...r.log.matchAll(/PostScript error: (.*)/g)].map((x) => x[1].trim()))) {
          diagnostics.push({ severity: 'warning', source: 'host', message: `Ghostscript: PostScript error ${m}` });
        }
      }
      this.logger.info('host', `dvisvgm: ${plural(pages.length, 'page')} in ${ms(r.ms)}${r.exitCode ? `, exit ${r.exitCode}` : ''}`);
      if (r.exitCode !== 0 && pages.length === 0) {
        status = 'error';
        diagnostics.push({ severity: 'error', source: 'host', message: `dvisvgm failed (exit ${r.exitCode}): ${r.log.split('\n').filter((l) => /error/i.test(l)).join('; ') || r.log.slice(-300)}` });
      }
    } else {
      status = diagnostics.some((d) => d.severity === 'error') ? 'error' : 'fatal';
      if (!diagnostics.length) diagnostics.push({ severity: 'error', source: 'tex', message: `TeX produced no DVI (exit ${tex.exitCode})` });
    }
    const totalMs = now() - t0;
    this.report(diagnostics);
    this.logger.info('host', pdfOut
      ? `latex ${job}.tex: ${status}, ${pdf ? `${(pdf as Uint8Array).length}-byte PDF` : 'no PDF'} in ${ms(totalMs)}`
      : `latex ${job}.tex: ${status}, ${plural(pages.length, 'page')} in ${ms(totalMs)} (TeX ${ms(tex.ms)}, dvisvgm ${ms(dvisvgmMs)})`);
    return { status, pages, ...(pdf ? { pdf: pdf as Uint8Array } : {}), log: tex.log, texLog, dvisvgmLog, diagnostics, stats: { totalMs, texMs: tex.ms, dvisvgmMs, texSetupMs: tex.setupMs, texMainMs: tex.mainMs, instantiateMs: tex.ms - tex.setupMs - tex.mainMs }, format: fmt, artifacts };
  }

  private hasSnapshot(): boolean {
    if (this.env.bundles) return this.env.bundles.files.has('web2c/tikz.fmt');
    if (this.env.texmfDir) { try { return this.M.FS.analyzePath(`${TEXMF_ROOT}/web2c/tikz.fmt`).exists; } catch { return false; } }
    return false;
  }

  private async typeset(misses: Snippet[]): Promise<void> {
    this.progress({ phase: 'typesetting', total: misses.length });
    const r = await this.bridge!.typeset(this.engine as ResolvedEngine, misses);
    this.logger.info('host', `TeX (${this.engine}): ${plural(misses.length, 'label')} in ${ms(r.ms)}${r.resolved < misses.length ? `, ${misses.length - r.resolved} unresolved` : ''}${r.exitCode ? `, exit ${r.exitCode}` : ''}`);
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
    try {
      job.run(cmd);
    } catch (e: any) {
      // mplib calls exit() on a few hard limits (e.g. "input stack overflow",
      // which native mpost hits too); Emscripten surfaces that as ExitStatus.
      if (e && e.name === 'ExitStatus') {
        job.history = 3;
        this.texDiagnostics.push({ severity: 'error', source: 'metapost', message: `MetaPost aborted: ${this.recentOutput.slice(-3).join(' ').trim() || 'exit ' + e.status}` });
      } else throw e;
    }
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

function ftypeName(t: number): string { return t === MPX_FTYPE_TFM ? 'tfm' : t === MPX_FTYPE_VF ? 'vf' : MP_FTYPE_NAMES[t] ?? String(t); }

/** Errors (`! ...` + `l.N`) and package warnings from a TeX transcript, attributed to the document. */
export function parseTexLogDocument(log: string, file: string): Diagnostic[] {
  const out: Diagnostic[] = [];
  const lines = log.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = /^! (.*)$/.exec(lines[i]);
    if (m) {
      let line: number | undefined; const help: string[] = []; let j = i + 1;
      for (; j < lines.length && j < i + 30; j++) { const lm = /^l\.(\d+)/.exec(lines[j]); if (lm) { line = Number(lm[1]); break; } if (/^! /.test(lines[j])) break; }
      if (line !== undefined) for (let k = j + 2; k < lines.length && k < i + 30; k++) { if (lines[k].trim() === '' || /^! |^l\.\d+/.test(lines[k])) break; help.push(lines[k]); }
      out.push({ severity: 'error', source: 'tex', message: m[1], help: help.length ? help : undefined, file, line });
      continue;
    }
    const w = /^(?:LaTeX|Package (\S+)|Class (\S+)) Warning: (.*)$/.exec(lines[i]);
    if (w) {
      let msg = w[3]; let j = i + 1;
      while (j < lines.length && lines[j].startsWith('(') && /^\([^)]*\) /.test(lines[j])) { msg += ' ' + lines[j].replace(/^\([^)]*\)\s*/, ''); j++; }
      const lm = /on input line (\d+)/.exec(msg);
      out.push({ severity: 'warning', source: 'tex', message: (w[1] ? w[1] + ': ' : w[2] ? w[2] + ': ' : '') + msg, file, line: lm ? Number(lm[1]) : undefined });
    }
  }
  return out;
}

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

/** Does a LaTeX source need LuaTeX? (TikZ graphdrawing, \directlua, luacode.) Used by engine 'auto'. */
export function needsLuaTeX(source: string): boolean {
  return /\\usegdlibrary|graphdrawing|\\directlua|\\latelua|luacode|contourlua|contour lua|\\usepackage(\[[^\]]*\])?\{luatexbase\}/.test(source);
}
