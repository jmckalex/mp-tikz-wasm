// smoke-dvisvgm.mjs — run dist/dvisvgm.mjs on a DVI (default: the TikZ test
// produced by tex.wasm) with build/texmf mounted, and diff against native dvisvgm.
import createDvisvgm from '../dist/dvisvgm.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const TEXMF = path.join(REPO, 'build/texmf');
const WORK = path.join(REPO, 'build/tex/work');
const dvi = process.argv[2] ?? 'tikztest.dvi';
const args = ['--no-fonts', '--exact-bbox', '--no-mktexmf', '-v0', '-o', 'wasm-%f.svg', dvi];

const out = [];
let code = -1;
const t0 = performance.now();
const M = await createDvisvgm({
  print: (s) => out.push(s), printErr: (s) => out.push(s),
  noInitialRun: true, thisProgram: '/bin/dvisvgm',
  preRun: [(M) => { M.ENV.TEXMFCNF = '/texmf/web2c'; M.ENV.SOURCE_DATE_EPOCH = '1735689600'; }],
  onExit: (c) => { code = c; },
});
try { M.FS.mkdir('/bin'); } catch {}
M.FS.writeFile('/bin/dvisvgm', '');
M.FS.mkdir('/texmf'); M.FS.mount(M.NODEFS, { root: TEXMF }, '/texmf');
M.FS.mkdir('/work'); M.FS.mount(M.NODEFS, { root: WORK }, '/work'); M.FS.chdir('/work');
try { M.callMain(args); } catch (e) { if (e.name !== 'ExitStatus') throw e; code = e.status; }
console.log(`dvisvgm.wasm exit ${code} in ${(performance.now() - t0).toFixed(0)} ms`);
if (out.length) console.log(out.join('\n'));
const ours = path.join(WORK, `wasm-${dvi.replace(/\.dvi$/, '')}.svg`);
console.log('ours:', fs.existsSync(ours) ? fs.statSync(ours).size + ' bytes' : 'MISSING');
try {
  execFileSync('dvisvgm', ['--no-fonts', '--exact-bbox', '--no-mktexmf', '-v0', '-o', 'native-%f.svg', dvi], { cwd: WORK, env: { ...process.env, SOURCE_DATE_EPOCH: '1735689600' } });
  const nat = path.join(WORK, `native-${dvi.replace(/\.dvi$/, '')}.svg`);
  const a = fs.readFileSync(ours, 'utf8'), b = fs.readFileSync(nat, 'utf8');
  const norm = (s) => s.replace(/<!--[^>]*-->/g, '');
  console.log('native:', b.length, 'bytes; identical modulo comments:', norm(a) === norm(b));
  if (norm(a) !== norm(b)) { const al = norm(a).split('\n'), bl = norm(b).split('\n'); let i = 0; while (i < al.length && al[i] === bl[i]) i++; console.log('first diff line', i + 1, '\n ours:', al[i]?.slice(0, 160), '\n nat: ', bl[i]?.slice(0, 160)); }
} catch (e) { console.log('native dvisvgm not available:', e.message.split('\n')[0]); }
