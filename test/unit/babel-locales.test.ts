/**
 * scripts/babel-locales.sh, which build-texmf.sh uses for the latex-doc bundle's babel locales and
 * languages: a directory that TeX Live lacks is warned about, not skipped in silence.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { repoRoot } from './oracle.js';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mpw-babel-'));
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

// FUNCTION SRC DEST NAME... under build-texmf.sh's `set -euo pipefail`
const run = (fn: string, src: string, dest: string, ...names: string[]) => spawnSync('bash', ['-c',
  'set -euo pipefail; . "$1/scripts/babel-locales.sh"; fn="$2"; shift 2; "$fn" "$@"', '_', repoRoot, fn, src, dest, ...names], { encoding: 'utf8' });
const copy = (src: string, dest: string, ...locales: string[]) => run('copy_babel_locales', src, dest, ...locales);
const script = () => fs.readFileSync(path.join(repoRoot, 'scripts', 'build-texmf.sh'), 'utf8');

describe('copy_babel_locales', () => {
  it('copies the locales there are and warns for a missing one', () => {
    const src = path.join(dir, 'src'), dest = path.join(dir, 'out');
    fs.mkdirSync(path.join(src, 'ca'), { recursive: true });
    fs.writeFileSync(path.join(src, 'ca', 'babel-ca.ini'), '[identification]\n');
    fs.mkdirSync(path.join(src, 'invalid'));
    fs.writeFileSync(path.join(src, 'invalid', 'babel-ngerman.ini'), '[identification]\n');
    const r = copy(src, dest, 'ca', 'de', 'invalid');
    expect(r.status, r.stderr).toBe(0);
    expect(fs.readFileSync(path.join(dest, 'ca', 'babel-ca.ini'), 'utf8')).toBe('[identification]\n');
    expect(fs.existsSync(path.join(dest, 'invalid', 'babel-ngerman.ini'))).toBe(true);
    expect(r.stderr).toMatch(/warning: babel's locale\/de not found/);
    expect(r.stderr.trim().split('\n')).toHaveLength(1);
  });
  it('says nothing when invalid/ is absent: babel before 26 has none', () => {
    const src = path.join(dir, 'src25'), dest = path.join(dir, 'out25');
    fs.mkdirSync(path.join(src, 'de'), { recursive: true });
    const r = copy(src, dest, 'de', 'invalid');
    expect(r.status, r.stderr).toBe(0);
    expect(r.stderr).toBe('');
    expect(fs.existsSync(path.join(dest, 'de'))).toBe(true);
  });
  it('is what build-texmf.sh copies the locales with', () => {
    expect(script()).toContain('. "$REPO/scripts/babel-locales.sh"');
    expect(script()).toMatch(/copy_babel_locales "\$t\/tex\/generic\/babel\/locale" "\$OUT\/tex\/generic\/babel\/locale" \$BABEL_LOCALES/);
  });
});

describe('copy_babel_languages', () => {
  it('copies the languages\' .ldf packages there are and warns for a missing one', () => {
    const src = path.join(dir, 'generic'), dest = path.join(dir, 'generic-out');
    fs.mkdirSync(path.join(src, 'babel-german'), { recursive: true });
    fs.writeFileSync(path.join(src, 'babel-german', 'ngerman.ldf'), '% ngerman\n');
    fs.mkdirSync(dest);
    const r = run('copy_babel_languages', src, dest, 'german', 'welsh');
    expect(r.status, r.stderr).toBe(0);
    expect(fs.readFileSync(path.join(dest, 'babel-german', 'ngerman.ldf'), 'utf8')).toBe('% ngerman\n');
    expect(fs.existsSync(path.join(dest, 'babel-welsh'))).toBe(false);
    expect(r.stderr).toMatch(/warning: babel-welsh not found/);
    expect(r.stderr.trim().split('\n')).toHaveLength(1);
  });
  it('is what build-texmf.sh copies the languages with', () => {
    expect(script()).toMatch(/copy_babel_languages "\$t\/tex\/generic" "\$OUT\/tex\/generic" \$BABEL_LDFS/);
  });
});
