// golden-tikz.mjs — golden tests for the LaTeX/TikZ pipeline: every
// test/golden/tikz/*.tex is typeset with tex.wasm + dvisvgm.wasm and with the
// oracle (latex/tex + dvisvgm from TeX Live), and the SVG pages are compared
// byte for byte after dropping XML comments (which carry the dvisvgm banner).
//
//   node scripts/golden-tikz.mjs            compare against the oracle
//   node scripts/golden-tikz.mjs --update   only regenerate test/golden/tikz-expected
//   node scripts/golden-tikz.mjs --check    compare against committed expectations
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { MetaPost } from '../dist/index.js';

const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const CASES = path.join(REPO, 'test/golden/tikz');
const EXPECTED = path.join(REPO, 'test/golden/tikz-expected');
const OUT = path.join(REPO, 'test/golden/_out/tikz');
const argv = process.argv.slice(2);
const mode = argv.find((a) => a.startsWith('--')) ?? '';
const only = argv.filter((a) => !a.startsWith('--'));
// dvisvgm emits glyph definitions from an unordered container, so the order
// of <path id='gN-M'> lines inside <defs> differs between builds (native
// libc++/libstdc++ and wasm32 all differ). Sort them; everything else must match.
const normalise = (s) => s.replace(/<!--[^>]*-->/g, '').replace(/<defs>\n([\s\S]*?)<\/defs>/g, (_m, body) => {
  const lines = body.split('\n').filter((l) => l !== '');
  const paths = lines.filter((l) => /^<path id='g\d+-\d+'/.test(l)).sort();
  const rest = lines.filter((l) => !/^<path id='g\d+-\d+'/.test(l));
  return '<defs>\n' + [...paths, ...rest].join('\n') + '\n</defs>';
});
const DVISVGM_ARGS = ['--no-mktexmf', '--exact-bbox', '-v3', '--page=1-', '--no-fonts'];

function oracle(caseFile, plain) {
  const dir = fs.mkdtempSync(path.join(OUT, 'oracle-'));
  // the same driver line the library injects (docs/14 §7), same first line
  const src = fs.readFileSync(caseFile, 'utf8');
  fs.writeFileSync(path.join(dir, 'doc.tex'), '\\def\\pgfsysdriver{pgfsys-dvisvgm.def}' + src);
  const env = { ...process.env, SOURCE_DATE_EPOCH: '1735689600', FORCE_SOURCE_DATE: '1' };
  try { execFileSync(plain ? 'etex' : 'latex', ['-interaction=nonstopmode', 'doc.tex'], { cwd: dir, stdio: 'ignore', env }); } catch { /* errors are part of some cases */ }
  const pages = [];
  if (fs.existsSync(path.join(dir, 'doc.dvi'))) {
    try { execFileSync('dvisvgm', [...DVISVGM_ARGS, '-o', 'doc-%p.svg', 'doc.dvi'], { cwd: dir, stdio: 'ignore', env }); } catch { /* keep what was produced */ }
    for (let p = 1; ; p++) { const f = path.join(dir, `doc-${p}.svg`); if (!fs.existsSync(f)) break; pages.push(normalise(fs.readFileSync(f, 'utf8'))); }
  }
  fs.rmSync(dir, { recursive: true, force: true });
  return pages;
}

fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(EXPECTED, { recursive: true });
const mp = await MetaPost.create({ log: () => {} });
let pass = 0, fail = 0;
const files = fs.readdirSync(CASES).filter((f) => f.endsWith('.tex') && (only.length === 0 || only.some((o) => f.includes(o)))).sort();
for (const f of files) {
  const name = path.basename(f, '.tex');
  const src = fs.readFileSync(path.join(CASES, f), 'utf8');
  const plain = /\\bye\s*$/.test(src.trim());
  let r, rs;
  try {
    r = await mp.latex(src, { engine: plain ? 'plain' : 'latex', snapshot: 'none' });
    // the pre-warmed tikz.fmt must produce exactly the same pages as plain latex.fmt
    rs = await mp.latex(src, { engine: plain ? 'plain' : 'latex' });
  } catch (e) { fail++; console.log(`FAIL ${name}: threw ${e?.message ?? e}`); continue; }
  const ours = r.pages.map(normalise);
  const snapPages = rs.pages.map(normalise);
  const snapNote = rs.format === 'tikz' ? ` | snapshot: TeX ${rs.stats.texMs.toFixed(0)} ms${JSON.stringify(snapPages) === JSON.stringify(ours) ? ', identical' : ', DIFFERENT'}` : '';
  if (rs.format === 'tikz' && JSON.stringify(snapPages) !== JSON.stringify(ours)) { fail++; console.log(`FAIL ${name}: tikz.fmt output differs from latex.fmt output`); continue; }
  const caseOut = path.join(OUT, name); fs.mkdirSync(caseOut, { recursive: true });
  fs.writeFileSync(path.join(caseOut, 'log.txt'), r.log + '\n---- dvisvgm ----\n' + r.dvisvgmLog);
  ours.forEach((s, i) => fs.writeFileSync(path.join(caseOut, `${i + 1}.ours.svg`), s));
  let expected;
  if (mode === '--check') expected = JSON.parse(fs.readFileSync(path.join(EXPECTED, name + '.json'), 'utf8')).pages;
  else { expected = oracle(path.join(CASES, f), plain); fs.writeFileSync(path.join(EXPECTED, name + '.json'), JSON.stringify({ oracle: 'TeX Live 2025 / dvisvgm 3.4.3', pages: expected }, null, 1)); }
  if (mode === '--update') { console.log(`  updated ${name} (${expected.length} pages)`); continue; }
  const problems = [];
  if (expected.length !== ours.length) problems.push(`page count: oracle ${expected.length}, ours ${ours.length}`);
  for (let i = 0; i < Math.min(expected.length, ours.length); i++) {
    if (expected[i] !== ours[i]) {
      fs.writeFileSync(path.join(caseOut, `${i + 1}.oracle.svg`), expected[i]);
      const al = expected[i].split('\n'), bl = ours[i].split('\n'); let k = 0; while (k < al.length && al[k] === bl[k]) k++;
      problems.push(`page ${i + 1} differs at line ${k + 1}\n        oracle: ${(al[k] ?? '').slice(0, 110)}\n        ours:   ${(bl[k] ?? '').slice(0, 110)}`);
    }
  }
  if (problems.length) { fail++; console.log(`FAIL ${name} (status ${r.status})\n      ${problems.join('\n      ')}`); }
  else { pass++; console.log(`ok   ${name} (${ours.length} page${ours.length === 1 ? '' : 's'}, ${r.status}, TeX ${r.stats.texMs.toFixed(0)} ms, dvisvgm ${r.stats.dvisvgmMs.toFixed(0)} ms${snapNote})`); }
}
mp.dispose();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
