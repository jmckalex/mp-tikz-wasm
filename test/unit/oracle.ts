/**
 * Test helper: locate (or build) the native mpto oracle described in
 * test/unit/mpto-oracle.c. Returns null when it cannot be built, so tests can
 * skip gracefully on machines without a C toolchain or `make native`.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));

let cached: string | null | undefined;

export function findOracle(): string | null {
  if (cached !== undefined) return cached;
  const bin = join(repoRoot, 'build', 'native', 'mpto-oracle');
  const lib = join(repoRoot, 'build', 'native', 'libmplib.a');
  const src = join(repoRoot, 'test', 'unit', 'mpto-oracle.c');
  if (existsSync(bin)) return (cached = bin);
  if (!existsSync(lib)) return (cached = null);
  const r = spawnSync(
    'cc',
    [
      '-w', '-DMPWASM_NATIVE=1', '-DMPWASM_NO_SPAWN=1',
      '-Isrc/c/include', '-Isrc/c/include/stub', '-Ibuild/gen', '-Ibuild/patched', '-Isrc/c',
      '-o', bin, src, lib, '-lm',
    ],
    { cwd: repoRoot, stdio: 'pipe' },
  );
  return (cached = r.status === 0 && existsSync(bin) ? bin : null);
}

export interface OracleRun {
  /** The generated .tex (or troff .i) file, as raw bytes. */
  tex: Buffer;
  /** mpto's stderr ("makempx error: ..." lines). */
  stderr: string;
  /** mpx history: 0 spotless, 2 error, 3 fatal. */
  history: number;
}

/**
 * Run upstream mpto on `source`, saved as `fileName` in a fresh temp
 * directory (mpto writes `mptotmp.tex` in the cwd and puts the file name in
 * its `% line N file` comments, so the name matters).
 */
export function runOracle(
  bin: string,
  source: string | Buffer,
  fileName: string,
  options: { mode?: 0 | 1; mptexpre?: string } = {},
): OracleRun {
  const dir = mkdtempSync(join(tmpdir(), 'mpto-oracle-'));
  writeFileSync(join(dir, fileName), source);
  const args = [fileName, 'out.tex', String(options.mode ?? 0)];
  if (options.mptexpre !== undefined) {
    writeFileSync(join(dir, 'pre.tex'), options.mptexpre);
    args.push('pre.tex');
  } else {
    args.push('/nonexistent/mptexpre.tex');
  }
  const r = spawnSync(bin, args, { cwd: dir, encoding: 'utf8', timeout: 10_000 });
  if (r.error !== undefined || r.status !== 0) {
    throw new Error(`oracle failed (${r.status ?? r.signal}): ${r.stderr}`);
  }
  return { tex: readFileSync(join(dir, 'out.tex')), stderr: r.stderr, history: Number(r.stdout.trim()) };
}
