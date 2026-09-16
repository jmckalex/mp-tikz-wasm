import { describe, it, expect, vi, afterEach } from 'vitest';
import { Logger, LOG_LEVELS, consoleSink, formatRecord, isLogLevel } from '../../src/ts/logger.js';
import type { LogRecord } from '../../src/ts/types.js';

function collect(level: Parameters<typeof Logger.prototype.log>[0] | 'silent') {
  const records: LogRecord[] = [];
  const logger = new Logger(level, (r) => records.push(r));
  return { logger, records };
}
const everything = (logger: Logger) => {
  logger.error('host', 'e'); logger.warn('tex', 'w'); logger.info('host', 'i'); logger.debug('metapost', 'd'); logger.trace('bundle', 't');
};

describe('Logger', () => {
  it('lets through the records at or below its level, each level including the ones before it', () => {
    const seen: Record<string, string[]> = {};
    for (const level of LOG_LEVELS) {
      const { logger, records } = collect(level);
      everything(logger);
      seen[level] = records.map((r) => r.level);
    }
    expect(seen).toEqual({
      silent: [],
      error: ['error'],
      warn: ['error', 'warn'],
      info: ['error', 'warn', 'info'],
      debug: ['error', 'warn', 'info', 'debug'],
      trace: ['error', 'warn', 'info', 'debug', 'trace'],
    });
  });
  it('defaults to warn', () => {
    const records: LogRecord[] = [];
    const logger = new Logger(undefined, (r) => records.push(r));
    everything(logger);
    expect(records.map((r) => r.level)).toEqual(['error', 'warn']);
  });
  it('checks the level at call time, so it can change between two lines', () => {
    const { logger, records } = collect('error');
    logger.info('host', 'before');
    logger.level = 'info';
    logger.info('host', 'after');
    expect(records.map((r) => r.message)).toEqual(['after']);
    expect(logger.enabled('debug')).toBe(false);
  });
  it('records carry the source, the message and a time in ms since creation', () => {
    const { logger, records } = collect('trace');
    logger.debug('dvisvgm', 'processing page 1');
    expect(records[0]).toMatchObject({ level: 'debug', source: 'dvisvgm', message: 'processing page 1' });
    expect(records[0].time).toBeGreaterThanOrEqual(0);
    expect(records[0].time).toBeLessThan(1000);
  });
  it('recognises the level names', () => {
    for (const l of LOG_LEVELS) expect(isLogLevel(l)).toBe(true);
    expect(isLogLevel('verbose')).toBe(false);
    expect(isLogLevel(3)).toBe(false);
  });
});

describe('consoleSink', () => {
  afterEach(() => vi.restoreAllMocks());
  it('prefixes the library name and the source, and picks the console method by level', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
    consoleSink({ level: 'error', source: 'tex', message: '! Undefined control sequence.', time: 1 });
    consoleSink({ level: 'warn', source: 'metapost', message: 'Warning: x', time: 2 });
    consoleSink({ level: 'info', source: 'host', message: 'run job.mp: ok', time: 3 });
    consoleSink({ level: 'debug', source: 'metapost', message: 'This is MetaPost, Version 2.11', time: 4 });
    consoleSink({ level: 'trace', source: 'bundle', message: 'fetched plain.mp', time: 5 });
    expect(error).toHaveBeenCalledWith('mp-tikz-wasm tex: ! Undefined control sequence.');
    expect(warn).toHaveBeenCalledWith('mp-tikz-wasm metapost: Warning: x');
    expect(info).toHaveBeenCalledWith('mp-tikz-wasm: run job.mp: ok');
    // the two verbose levels use console.log: Chrome hides console.debug under "Verbose" by default
    expect(log).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenCalledWith('mp-tikz-wasm metapost: This is MetaPost, Version 2.11');
    expect(debug).not.toHaveBeenCalled();
  });
  it('formatRecord leaves the source out for the library\'s own lines', () => {
    expect(formatRecord({ level: 'info', source: 'host', message: 'ready', time: 0 })).toBe('mp-tikz-wasm: ready');
    expect(formatRecord({ level: 'debug', source: 'dvisvgm', message: 'x', time: 0 })).toBe('mp-tikz-wasm dvisvgm: x');
  });
});
