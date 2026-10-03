// The single-file demo pages (build-pages.mjs, build-standalone.mjs) bundle the library for
// the browser with esbuild, marking the Node built-ins it imports dynamically as external.
// A new node: import without a matching --external broke those builds once (worker_threads,
// session 11) and went unnoticed for a week; this bundles index.ts with the same flags.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const REPO = path.resolve(new URL('../..', import.meta.url).pathname);
const esbuild = path.join(REPO, 'node_modules/.bin/esbuild');

describe.skipIf(!fs.existsSync(esbuild))('browser bundle', () => {
  it('bundles src/ts/index.ts for the browser with the page builders\' externals', () => {
    const script = fs.readFileSync(path.join(REPO, 'scripts/build-standalone.mjs'), 'utf8');
    const externals = [...script.matchAll(/'(--external:[^']+)'/g)].map((m) => m[1]);
    expect(externals.length).toBeGreaterThan(0);
    expect(fs.readFileSync(path.join(REPO, 'scripts/build-pages.mjs'), 'utf8')).toContain(externals.join("', '"));
    const out = execFileSync(esbuild, ['src/ts/index.ts', '--bundle', '--format=esm', '--target=es2022', '--platform=browser', ...externals, '--log-level=error'], { cwd: REPO, encoding: 'utf8', maxBuffer: 64 << 20 });
    expect(out.length).toBeGreaterThan(10_000);
  });
});
