/**
 * metapost-wasm — public types. Mirrors reference/api.d.ts (the M7 contract);
 * see docs/08-javascript-api.md for the rationale behind each choice.
 */

export type BundleName =
  | 'core' | 'cm-tfm' | 'cm-type1' | 'tex-plain' | 'latex-core' | 'latex-extra'
  | (string & {});

export interface BundleSpec {
  name: string;
  /** URL (browser) or directory (Node) of the bundle's manifest.json. */
  manifestUrl: string;
  blobBaseUrl?: string;
}

export type NumberSystem = 'scaled' | 'double' | 'decimal' | 'binary' | 'interval';
export type TexEngine = 'none' | 'plain' | 'etex' | 'latex' | 'auto';

export type MpFileType =
  | 'terminal' | 'error' | 'program' | 'log' | 'postscript' | 'bitmap'
  | 'memfile' | 'metrics' | 'fontmap' | 'font' | 'encoding' | 'text';

export interface MetaPostOptions {
  /** Bundles to load. Default: ['core', 'cm-tfm', 'cm-type1', 'tex-plain', 'latex-core'] when a bundleBaseUrl is known. */
  bundles?: (BundleName | BundleSpec)[];
  /** Base URL (browser) or directory (Node) under which `<bundle>/manifest.json` lives. */
  bundleBaseUrl?: string;
  /** Node only: a texmf directory to mount directly (mirrors build/texmf). Overrides bundles. */
  texmfDir?: string;

  numberSystem?: NumberSystem;          // default 'scaled'
  tex?: TexEngine;                      // default 'auto'
  texPreamble?: string;                 // MPTEXPRE equivalent

  deterministic?: boolean;              // default true
  randomSeed?: number;                  // default 42

  interaction?: 'batch' | 'nonstop' | 'scroll';   // default 'nonstop'
  haltOnError?: boolean;                // default false
  /** false selects the classic .mpx path instead of the make_text path. */
  extensions?: boolean;                 // default true
  /** Append `end.` after `input <job>` so a file that forgets `end` still finishes cleanly (default true). */
  autoEnd?: boolean;

  memoryLimitBytes?: number;
  timeoutMs?: number;                   // default 20_000 (worker only)
  texTimeoutMs?: number;                // default 15_000
  maxTexRuns?: number;                  // default 5

  runScript?: (code: string) => string;
  makeText?: (text: string, verbatim: boolean) => string | undefined;
  onFindFile?: (name: string, type: MpFileType, mode: 'r' | 'w') => string | undefined;

  cache?: 'memory' | false;             // snippet cache
  log?: (line: string) => void;
  wasmUrls?: { mplib?: string; tex?: string };
  /** Pre-loaded Emscripten module factories (e.g. for a single-file build); in-process mode only. */
  modules?: { mplib?: (opts?: Record<string, unknown>) => Promise<any>; tex?: (opts?: Record<string, unknown>) => Promise<any> };
  /** Custom bundle I/O (e.g. files embedded in the page); in-process mode only. */
  bundleIO?: { fetch(url: string): Promise<Uint8Array>; fetchSync?: (url: string) => Uint8Array; fetchJson(url: string): Promise<unknown> };
  /** Run in-process instead of in a Web Worker (default: worker in browsers, in-process in Node). */
  worker?: boolean;
}

export type OutputFormat = 'svg' | 'eps' | 'json' | 'none';

export interface RunOptions {
  format?: OutputFormat | OutputFormat[];   // default 'svg'
  prologues?: 0 | 1 | 2 | 3;                // default 3 for svg, 0 for eps
  procset?: 0 | 1;
  files?: Record<string, string | Uint8Array>;
  jobName?: string;                          // default 'job'
  internals?: Record<string, number | string>;
  tex?: TexEngine;
  svg?: SvgPostOptions;
  signal?: AbortSignal;
}

export interface SvgPostOptions {
  /** Round numbers to this many decimals (default 3). false = leave MetaPost's %.6f. */
  precision?: number | false;
  /** Prefix glyph ids so several figures can be inlined on one page (default: per figure). */
  idPrefix?: string | false;
  /** Rewrite xlink:href to href. Default false (keep upstream output). */
  modernHref?: boolean;
  /** Add role="img" and a <title>. */
  title?: string;
  /** Units for width/height: 'pt' keeps MetaPost's, 'px' converts at 96/72, 'none' drops them. */
  units?: 'pt' | 'px' | 'none';
}

export type Status = 'ok' | 'warning' | 'error' | 'fatal';

export interface RunResult {
  status: Status;
  history: 0 | 1 | 2 | 3 | 4;
  figures: FigureResult[];
  log: string;
  texLog?: string;
  diagnostics: Diagnostic[];
  stats: RunStats;
  artifacts: Record<string, Uint8Array>;
}

export interface FigureResult {
  charcode: number;
  bbox: [number, number, number, number];
  width: number; height: number; depth: number; italicCorrection: number;
  svg?: string;
  eps?: string;
  json?: Figure;
}

export interface RunStats {
  totalMs: number;
  metapostMs: number;
  texMs: number;
  texRuns: number;
  metapostRuns: number;
  snippetCacheHits: number;
  snippetCacheMisses: number;
}

export interface Diagnostic {
  severity: 'error' | 'warning';
  source: 'metapost' | 'tex' | 'bundle' | 'host';
  message: string;
  help?: string[];
  file?: string;
  line?: number;
  column?: number;
  snippet?: string;
}

export interface ProgressEvent {
  phase: 'loading' | 'scanning' | 'typesetting' | 'running' | 'rendering';
  detail?: string;
  current?: number;
  total?: number;
}

// ---- structured figure representation (mirrors mplibps.h) -----------------

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
  | FillObject | StrokeObject | TextObject | ClipObject | BoundsObject | SpecialObject;

export interface Knot {
  x: number; y: number;
  lx: number; ly: number;
  rx: number; ry: number;
  leftType: KnotType; rightType: KnotType;
}
export type KnotType = 0 | 1 | 2 | 3 | 4 | 5;

export interface Color { model: 'none' | 'grey' | 'rgb' | 'cmyk'; values: number[] }

interface ObjectBase { prescript?: string; postscript?: string }

export interface FillObject extends ObjectBase {
  type: 'fill'; path: Knot[]; closed: boolean; htap?: Knot[]; pen?: Knot[];
  color: Color; ljoin: number; miterlimit: number;
}
export interface StrokeObject extends ObjectBase {
  type: 'stroke'; path: Knot[]; closed: boolean; pen?: Knot[];
  color: Color; ljoin: number; lcap: number; miterlimit: number;
  dash?: { offset: number; pattern: number[] };
}
export interface TextObject extends ObjectBase {
  type: 'text'; text: string; font: string; designSize: number; color: Color;
  width: number; height: number; depth: number;
  transform: [number, number, number, number, number, number];
}
export interface ClipObject { type: 'startClip' | 'stopClip'; path?: Knot[] }
export interface BoundsObject { type: 'startBounds' | 'stopBounds'; path?: Knot[] }
export interface SpecialObject extends ObjectBase { type: 'special'; script: string }

/** The bundle manifest format (docs/06 §3). Paths are relative to the texmf root. */
export interface BundleManifest {
  name: string;
  version: string;
  texlive?: string;
  /** relative path -> size in bytes (and optional sha256) */
  files: Record<string, { size: number; sha?: string }>;
  /** files fetched together with the manifest */
  eager?: string[];
  /** directories that exist even if empty */
  dirs?: string[];
}
