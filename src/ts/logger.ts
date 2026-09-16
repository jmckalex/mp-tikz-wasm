/**
 * logger.ts — levelled logging for the engines (docs/08 §4). Every part of
 * the pipeline reports through one Logger; records at or below the chosen
 * level reach the sink (the console by default, or the `logger` option) and
 * the rest cost nothing. Each level includes the ones before it:
 *
 *   silent   nothing
 *   error    the errors of every run (MetaPost, TeX, dvisvgm, bundles, the host)
 *   warn     plus warnings                                        (the default)
 *   info     plus one line per run and per engine pass, with timings
 *   debug    plus the engines' own terminal output, line by line, as it is written
 *   trace    plus every file looked up or fetched, cache hits, progress events
 *
 * The level is checked at call time, so `mp.logLevel = 'debug'` takes effect
 * for the next line an engine prints.
 */
import type { LogLevel, LogRecord, LogSource } from './types.js';

export const LOG_LEVELS: readonly LogLevel[] = ['silent', 'error', 'warn', 'info', 'debug', 'trace'];
export const DEFAULT_LOG_LEVEL: LogLevel = 'warn';
export type LogSink = (record: LogRecord) => void;
type Level = Exclude<LogLevel, 'silent'>;

export function isLogLevel(x: unknown): x is LogLevel { return typeof x === 'string' && (LOG_LEVELS as string[]).includes(x); }

export class Logger {
  private readonly t0 = now();
  constructor(public level: LogLevel = DEFAULT_LOG_LEVEL, public sink: LogSink = consoleSink) {}

  enabled(level: Level): boolean { return LOG_LEVELS.indexOf(level) <= LOG_LEVELS.indexOf(this.level); }

  log(level: Level, source: LogSource, message: string): void {
    if (!this.enabled(level)) return;
    this.sink({ level, source, message, time: Math.round((now() - this.t0) * 10) / 10 });
  }
  error(source: LogSource, message: string): void { this.log('error', source, message); }
  warn(source: LogSource, message: string): void { this.log('warn', source, message); }
  info(source: LogSource, message: string): void { this.log('info', source, message); }
  debug(source: LogSource, message: string): void { this.log('debug', source, message); }
  trace(source: LogSource, message: string): void { this.log('trace', source, message); }
}

/** A logger that drops everything (for parts of the pipeline created without one). */
export const silentLogger = new Logger('silent', () => {});

/** `mp-tikz-wasm tex: ...` for an engine's line, `mp-tikz-wasm: ...` for the library's own. */
export function formatRecord(r: LogRecord): string {
  return r.source === 'host' ? `mp-tikz-wasm: ${r.message}` : `mp-tikz-wasm ${r.source}: ${r.message}`;
}

/** The default sink. Errors and warnings use the console's own levels; the two
 *  verbose levels use console.log rather than console.debug, which Chrome
 *  hides under "Verbose" by default — someone who asked for the engines'
 *  output should see it without changing a DevTools filter. */
export function consoleSink(r: LogRecord): void {
  if (typeof console === 'undefined') return;
  const line = formatRecord(r);
  switch (r.level) {
    case 'error': console.error(line); break;
    case 'warn': console.warn(line); break;
    case 'info': console.info(line); break;
    default: console.log(line);
  }
}

/** `ok in 123 ms`-style helpers shared by the summaries. */
export function ms(x: number): string { return `${x < 10 ? x.toFixed(1) : Math.round(x)} ms`; }
export function plural(n: number, noun: string): string { return `${n} ${noun}${n === 1 ? '' : 's'}`; }

function now(): number { return typeof performance !== 'undefined' ? performance.now() : Date.now(); }
