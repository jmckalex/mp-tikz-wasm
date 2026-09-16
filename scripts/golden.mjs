// golden.mjs — L2 golden tests (docs/09 §2): compile every test/golden/cases/*.mp
// with mp-tikz-wasm and with the oracle `mpost`, and compare EPS and SVG byte
// for byte after normalising the creation-date lines.
//
//   node scripts/golden.mjs            compare against the oracle (regenerating expectations)
//   node scripts/golden.mjs --update   only regenerate test/golden/expected
//   node scripts/golden.mjs --check    compare against committed expectations (no mpost needed)
//   ... [substring filters]            restrict to matching case names
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { MetaPost } from '../dist/index.js';

const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const CASES = path.join(REPO, 'test/golden/cases');
const EXPECTED = path.join(REPO, 'test/golden/expected');
const OUT = path.join(REPO, 'test/golden/_out');
const argv = process.argv.slice(2);
const mode = argv.find((a) => a.startsWith('--')) ?? '';
const only = argv.filter((a) => !a.startsWith('--'));

const normalise = (s) => s
  .replace(/^%%CreationDate:.*$/m, '%%CreationDate: <normalised>')
  .replace(/^<!-- Created by MetaPost [^\n]* on [^\n]*-->$/m, '<!-- Created by MetaPost <normalised> -->')
  // upstream's SVG backend prints stroke-miterlimit for filldraw objects from
  // uninitialised memory (patch 0005 fixes the read); the value is not comparable
  .replace(/stroke-miterlimit: [0-9.]+;/g, 'stroke-miterlimit: <normalised>;');

function oracle(caseFile, fmt) {
  const dir = fs.mkdtempSync(path.join(OUT, 'oracle-'));
  const src = fs.readFileSync(caseFile, 'utf8');
  const name = path.basename(caseFile, '.mp');
  fs.copyFileSync(caseFile, path.join(dir, name + '.mp'));
  const tex = /\\documentclass/.test(src) ? 'latex' : 'tex';
  // freeze the date/time internals exactly as the wasm build does (docs/04 §7),
  // so %%CreationDate and the font subset tags (which hash the job id) agree
  const args = ['-interaction=nonstopmode', `-tex=${tex}`, '-s', 'year=2025', '-s', 'month=1', '-s', 'day=1', '-s', 'time=0'];
  if (fmt === 'svg') args.push('-s', 'outputformat="svg"', '-s', 'prologues=3');
  args.push(name + '.mp');
  try { execFileSync('mpost', args, { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] }); } catch (e) { /* errors are part of some cases */ }
  const figs = {};
  for (const f of fs.readdirSync(dir)) {
    const m = new RegExp(`^${name}\\.(\\d+)$`).exec(f) ?? new RegExp(`^${name}-(\\d+)\\.svg$`).exec(f);
    if (m) figs[Number(m[1])] = fs.readFileSync(path.join(dir, f), 'utf8');
  }
  const log = fs.existsSync(path.join(dir, name + '.log')) ? fs.readFileSync(path.join(dir, name + '.log'), 'utf8') : '';
  fs.rmSync(dir, { recursive: true, force: true });
  return { figs, log };
}

fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(EXPECTED, { recursive: true });
const mp = await MetaPost.create({ logLevel: 'silent' });
let pass = 0, fail = 0;
const files = fs.readdirSync(CASES).filter((f) => f.endsWith('.mp') && (only.length === 0 || only.some((o) => f.includes(o)))).sort();
for (const f of files) {
  const name = path.basename(f, '.mp');
  const src = fs.readFileSync(path.join(CASES, f), 'utf8');
  // two runs, mirroring the two oracle invocations: eps with the document's own
  // prologues, svg with -s outputformat="svg" -s prologues=3
  let r, r2;
  try {
    r = await mp.run(src, { format: 'eps', jobName: name });
    r2 = await mp.run(src, { format: 'svg', jobName: name, internals: { outputformat: 'svg', prologues: 3 }, svg: { precision: false, idPrefix: false } });
  } catch (e) { fail++; console.log(`FAIL ${name}: threw ${e?.message ?? e}`); continue; }
  const ours = { eps: {}, svg: {} };
  for (const fig of r.figures) ours.eps[fig.charcode] = normalise(fig.eps ?? '');
  for (const fig of r2.figures) ours.svg[fig.charcode] = normalise(fig.svg ?? '');
  const caseOut = path.join(OUT, name); fs.mkdirSync(caseOut, { recursive: true });
  fs.writeFileSync(path.join(caseOut, 'log.txt'), r.log);
  let expected;
  if (mode === '--check') {
    expected = JSON.parse(fs.readFileSync(path.join(EXPECTED, name + '.json'), 'utf8'));
  } else {
    const eps = oracle(path.join(CASES, f), 'eps'), svg = oracle(path.join(CASES, f), 'svg');
    expected = { eps: Object.fromEntries(Object.entries(eps.figs).map(([k, v]) => [k, normalise(v)])), svg: Object.fromEntries(Object.entries(svg.figs).map(([k, v]) => [k, normalise(v)])), oracle: 'TeX Live 2025 / MetaPost 2.11' };
    fs.writeFileSync(path.join(EXPECTED, name + '.json'), JSON.stringify(expected, null, 1));
  }
  if (mode === '--update') { console.log(`  updated ${name}`); continue; }
  const problems = [];
  for (const fmt of ['eps', 'svg']) {
    const keys = new Set([...Object.keys(expected[fmt]), ...Object.keys(ours[fmt])]);
    for (const k of keys) {
      const a = expected[fmt][k], b = ours[fmt][k];
      if (a === undefined) problems.push(`${fmt} fig ${k}: oracle produced nothing, we did`);
      else if (b === undefined) problems.push(`${fmt} fig ${k}: we produced nothing, oracle did`);
      else if (a !== b) {
        fs.writeFileSync(path.join(caseOut, `${k}.oracle.${fmt}`), a); fs.writeFileSync(path.join(caseOut, `${k}.ours.${fmt}`), b);
        const al = a.split('\n'), bl = b.split('\n'); let i = 0; while (i < al.length && al[i] === bl[i]) i++;
        problems.push(`${fmt} fig ${k}: differs at line ${i + 1}\n        oracle: ${(al[i] ?? '').slice(0, 110)}\n        ours:   ${(bl[i] ?? '').slice(0, 110)}`);
      }
    }
  }
  if (problems.length) { fail++; console.log(`FAIL ${name} (status ${r.status})\n      ${problems.join('\n      ')}`); }
  else { pass++; console.log(`ok   ${name} (${r.figures.length} figs, ${r.status}, ${r.stats.totalMs.toFixed(0)} ms${r.stats.texRuns ? ', ' + r.stats.texRuns + ' TeX run' : ''})`); }
}
mp.dispose();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
