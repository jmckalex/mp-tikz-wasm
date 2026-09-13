/**
 * mp-tikz-wasm — proposed public API.
 *
 * This is a specification, not an implementation. It is the contract M7 must
 * meet. Rationale for each decision is in docs/08-javascript-api.md.
 */

// ───────────────────────────── entry points ──────────────────────────────

export declare class MetaPost {
  /** Instantiates the wasm modules and loads the eager part of each bundle. */
  static create(options?: MetaPostOptions): Promise<MetaPost>;

  /** Node only. Synchronous construction; lazy loading reads the real FS. */
  static createSync(options?: MetaPostOptions): MetaPost;

  run(source: string, options?: RunOptions): Promise<RunResult>;

  /** Fetch bundles ahead of time so the first run is warm. */
  preload(bundles: BundleName[]): Promise<void>;

  /** Write files into /work without running. */
  addFiles(files: Record<string, string | Uint8Array>): Promise<void>;

  on(event: 'progress', fn: (e: ProgressEvent) => void): () => void;
  on(event: 'log', fn: (line: string) => void): () => void;

  clearCache(what?: 'snippets' | 'assets' | 'all'): Promise<void>;

  /** Terminates the worker. The instance is unusable afterwards. */
  dispose(): void;

  readonly version: { metapost: string; tex: string; build: string };
}

/** One worker per instance; a pool for embarrassingly parallel batch work. */
export declare class MetaPostPool {
  static create(options?: MetaPostOptions & { size?: number }): Promise<MetaPostPool>;
  run(source: string, options?: RunOptions): Promise<RunResult>;
  dispose(): void;
}

// ────────────────────────────── options ──────────────────────────────────

export type BundleName =
  | 'core' | 'cm-tfm' | 'cm-type1'
  | 'tex-plain' | 'latex-core' | 'latex-extra'
  | (string & {});

export interface BundleSpec {
  name: string;
  manifestUrl: string;
  blobBaseUrl?: string;
}

export type NumberSystem = 'scaled' | 'double' | 'decimal' | 'binary' | 'interval';
export type TexEngine    = 'none' | 'plain' | 'etex' | 'latex' | 'auto';

export interface MetaPostOptions {
  bundles?: (BundleName | BundleSpec)[];
  bundleBaseUrl?: string;

  /** MetaPost's arithmetic. 'scaled' matches classic mpost exactly. */
  numberSystem?: NumberSystem;          // default 'scaled'
  tex?: TexEngine;                      // default 'auto'
  texPreamble?: string;                 // MPTEXPRE equivalent

  /** Fixed seed + frozen date/time, so two runs are byte-identical. */
  deterministic?: boolean;              // default true
  randomSeed?: number;                  // default 42

  interaction?: 'batch' | 'nonstop' | 'scroll';   // default 'nonstop'
  haltOnError?: boolean;                // default false
  /** false selects the classic .mpx path instead of the make_text path. */
  extensions?: boolean;                 // default true

  memoryLimitBytes?: number;            // default 512 MiB
  timeoutMs?: number;                   // default 20_000
  texTimeoutMs?: number;                // default 15_000
  maxTexRuns?: number;                  // default 5

  /**
   * Enables MetaPost's `runscript` primitive. OMITTING THIS DISABLES IT.
   * The returned string is injected as MetaPost source — treat the input as
   * untrusted and never eval it.
   */
  runScript?: (code: string) => string;

  /**
   * Overrides the TeX Bridge. Return MetaPost source for a btex block, '' for
   * a verbatimtex block, or undefined to fall through to the built-in bridge.
   * Must be synchronous; return undefined on a miss and the bridge will re-run
   * after you have prefetched.
   */
  makeText?: (text: string, verbatim: boolean) => string | undefined;

  /** Last chance before find_file gives up. Return an absolute VFS path. */
  onFindFile?: (name: string, type: MpFileType, mode: 'r' | 'w') => string | undefined;

  cache?: 'indexeddb' | 'memory' | 'fs' | false;   // default 'indexeddb' / 'fs'
  cacheBudgetBytes?: number;            // default 64 MiB
  log?: (line: string) => void;
  wasmUrls?: { mplib?: string; tex?: string };
}

export type OutputFormat = 'svg' | 'eps' | 'json' | 'binary' | 'png' | 'none';

export interface RunOptions {
  format?: OutputFormat | OutputFormat[];   // default 'svg'
  /** 3 gives self-contained SVG with real glyph outlines. See docs/07 §3. */
  prologues?: 0 | 1 | 2 | 3;                // default 3 for svg, 0 for eps
  files?: Record<string, string | Uint8Array>;
  jobName?: string;                          // default 'job'
  /** Equivalent to `mpost -s NAME=VALUE`. */
  internals?: Record<string, number | string>;
  signal?: AbortSignal;
}

// ────────────────────────────── results ──────────────────────────────────

export type Status = 'ok' | 'warning' | 'error' | 'fatal';

export interface RunResult {
  status: Status;
  /** mplib's history value, unmodified: 0 spotless … 4 system error. */
  history: 0 | 1 | 2 | 3 | 4;
  figures: FigureResult[];
  log: string;
  texLog?: string;
  diagnostics: Diagnostic[];
  stats: RunStats;
  /** Files MetaPost wrote (TFMs, `write … to` output), by VFS path. */
  artifacts: Record<string, Uint8Array>;
}

export interface FigureResult {
  /** The N in beginfig(N). */
  charcode: number;
  bbox: [minX: number, minY: number, maxX: number, maxY: number];
  svg?: string;
  eps?: string;
  json?: Figure;
  binary?: ArrayBuffer;
  png?: Blob;
}

export interface RunStats {
  totalMs: number;
  metapostMs: number;
  texMs: number;
  texRuns: number;
  snippetCacheHits: number;
  snippetCacheMisses: number;
  peakMemoryBytes: number;
}

export interface Diagnostic {
  severity: 'error' | 'warning';
  source: 'metapost' | 'tex' | 'bundle' | 'host';
  message: string;
  /** mplib's own help text. Worth surfacing — it is unusually good. */
  help?: string[];
  file?: string;
  line?: number;
  column?: number;
  /** For TeX errors: the btex block that failed. */
  snippet?: string;
}

export interface ProgressEvent {
  phase: 'loading' | 'scanning' | 'typesetting' | 'running' | 'rendering';
  detail?: string;
  current?: number;
  total?: number;
}

// ──────────────────── structured figure representation ───────────────────
// Mirrors mp_edge_object / mp_*_object from the generated mplibps.h.

export interface Figure {
  charcode: number;
  bbox: [number, number, number, number];
  width: number;
  height: number;
  depth: number;
  italicCorrection: number;
  objects: GraphicObject[];
}

export type GraphicObject =
  | FillObject | StrokeObject | TextObject
  | ClipObject | BoundsObject | SpecialObject;

export interface Knot {
  x: number; y: number;
  /** Incoming control point. */
  lx: number; ly: number;
  /** Outgoing control point. */
  rx: number; ry: number;
  leftType: KnotType; rightType: KnotType;
}

export type KnotType = 0 | 1 | 2 | 3 | 4 | 5;  // endpoint explicit given curl open endCycle

export interface Color {
  model: 'none' | 'grey' | 'rgb' | 'cmyk';
  values: number[];      // 0 | 1 | 3 | 4 components
}

interface ObjectBase {
  prescript?: string;
  postscript?: string;
}

export interface FillObject extends ObjectBase {
  type: 'fill';
  path: Knot[];
  /** Closed when the knot chain cycles. */
  closed: boolean;
  htap?: Knot[];         // reversed path, for the even-odd/`unfill` case
  pen?: Knot[];
  color: Color;
  ljoin: number;
  miterlimit: number;
}

export interface StrokeObject extends ObjectBase {
  type: 'stroke';
  path: Knot[];
  closed: boolean;
  pen?: Knot[];
  color: Color;
  ljoin: number;
  lcap: number;
  miterlimit: number;
  dash?: { offset: number; pattern: number[] };
}

export interface TextObject extends ObjectBase {
  type: 'text';
  text: string;          // raw font-encoded bytes, not Unicode
  font: string;          // TFM name, e.g. "cmr10"
  designSize: number;
  color: Color;
  width: number; height: number; depth: number;
  /** [txx, txy, tyx, tyy, tx, ty] */
  transform: [number, number, number, number, number, number];
}

export interface ClipObject   { type: 'startClip' | 'stopClip';     path?: Knot[] }
export interface BoundsObject { type: 'startBounds' | 'stopBounds'; path?: Knot[] }
export interface SpecialObject extends ObjectBase { type: 'special'; script: string }

// ────────────────────────────── misc ─────────────────────────────────────

export type MpFileType =
  | 'terminal' | 'error' | 'program' | 'log' | 'postscript' | 'bitmap'
  | 'memfile'  | 'metrics' | 'fontmap' | 'font' | 'encoding' | 'text';

/**
 * Render an SVG string safely for innerHTML. MetaPost's `special` and
 * `withprescript` let a document author put arbitrary content in the output;
 * see docs/10 §3.1.
 */
export declare function sanitizeSvg(svg: string): string;

/** Standalone DVI → MPX conversion, matching `mpost --dvitomp`. */
export declare function dvitomp(dvi: Uint8Array, options?: {
  bundles?: BundleName[];
}): Promise<string>;
