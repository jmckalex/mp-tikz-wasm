// stress-pgfmanual.mjs — typeset the complete PGF/TikZ manual (TeX Live's
// doc/generic/pgf/pgfmanual.tex, ~1180 pages, every library it documents)
// with tex.wasm + dvisvgm.wasm through the public Node API, and compare it
// page by page with the native `latex` + `dvisvgm` from the local TeX Live.
//
//   node scripts/stress-pgfmanual.mjs            full run (~15 min: native reference + wasm)
//   node scripts/stress-pgfmanual.mjs --wasm     reuse an existing native reference
//
// What it takes to make the manual build under pdfTeX at all, and to give the
// wasm run the same inputs as the native one, is documented inline; every
// step is a real-world trap, none is an engine limitation.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { MetaPost } from '../dist/index.js';

const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const OUT = path.join(REPO, 'build/stress/pgfmanual');
const NATIVE = path.join(OUT, 'native');
const TL = execFileSync('kpsewhich', ['-var-value=TEXMFDIST']).toString().trim() + '/';
const DOC = path.join(TL, 'doc/generic/pgf');
const JOB = 'pgfmanual-dvi';
const ENV = { ...process.env, SOURCE_DATE_EPOCH: '1735689600', FORCE_SOURCE_DATE: '1' };
const DVISVGM_ARGS = ['--no-mktexmf', '--exact-bbox', '-v3', '--page=1-', '--no-fonts'];
const wasmOnly = process.argv.includes('--wasm');
const t = () => (performance.now() / 1000).toFixed(0).padStart(4) + 's';

if (!fs.existsSync(path.join(DOC, 'pgfmanual.tex'))) { console.log(`no PGF manual source at ${DOC}`); process.exit(2); }

// ---- 1. the native reference: three passes of latex + dvisvgm ---------------
if (!wasmOnly || !fs.existsSync(path.join(NATIVE, 'svg'))) {
  fs.rmSync(NATIVE, { recursive: true, force: true }); fs.mkdirSync(NATIVE, { recursive: true });
  fs.cpSync(DOC, NATIVE, { recursive: true });
  // pgfmanual.cfg uses \ignoreligaturesinfont, a LuaTeX primitive: guard it.
  fs.writeFileSync(path.join(NATIVE, 'pgfmanual.cfg'), fs.readFileSync(path.join(NATIVE, 'pgfmanual.cfg'), 'utf8')
    .replace(/\\makeatletter([\s\S]*?)\\makeatother/, '\\usepackage{iftex}\\ifluatex\n\\makeatletter$1\\makeatother\n\\fi'));
  // Same first lines the library injects: PGF's dvisvgm driver, then Latin
  // Modern (the EC/cm-super fonts the manual would otherwise use are not bundled).
  fs.writeFileSync(path.join(NATIVE, JOB + '.tex'), '\\def\\pgfsysdriver{pgfsys-dvisvgm.def}\\RequirePackage{lmodern}\n' + fs.readFileSync(path.join(NATIVE, 'pgfmanual.tex'), 'utf8'));
  for (let pass = 1; pass <= 3; pass++) {
    const t0 = performance.now();
    try { execFileSync('latex', ['-recorder', '-interaction=nonstopmode', JOB + '.tex'], { cwd: NATIVE, stdio: 'ignore', env: ENV }); } catch { /* errors are counted below */ }
    const log = fs.readFileSync(path.join(NATIVE, JOB + '.log'), 'latin1');
    const errors = (log.match(/^!/gm) ?? []).length;
    const pages = /Output written on [^ ]* \((\d+) pages/.exec(log)?.[1] ?? '0';
    console.log(`${t()} native pass ${pass}: ${pages} pages, ${errors} errors, ${((performance.now() - t0) / 1000).toFixed(0)} s`);
    if (errors) { console.log(log.split('\n').filter((l) => l.startsWith('!')).slice(0, 5).join('\n')); process.exit(1); }
  }
  fs.mkdirSync(path.join(NATIVE, 'svg'));
  const t0 = performance.now();
  execFileSync('dvisvgm', [...DVISVGM_ARGS, '-o', 'svg/%p.svg', JOB + '.dvi'], { cwd: NATIVE, stdio: ['ignore', 'ignore', fs.openSync(path.join(NATIVE, 'dvisvgm.log'), 'w')], env: ENV });
  console.log(`${t()} native dvisvgm: ${fs.readdirSync(path.join(NATIVE, 'svg')).length} pages, ${((performance.now() - t0) / 1000).toFixed(0)} s`);
}

// ---- 2. the wasm run gets exactly what the third native pass read ---------
// The recorder lists every file TeX opened. Files the bundles already hold
// are left to the bundle loader; the rest (chapters, plots, the converged
// .aux/.toc/.out files, the makeindex output the wasm engine cannot spawn,
// and any TeX Live package not bundled) are handed over as job files.
const bundled = new Set();
for (const b of fs.readdirSync(path.join(REPO, 'dist/bundles'))) {
  const mf = path.join(REPO, 'dist/bundles', b, 'manifest.json');
  if (fs.existsSync(mf)) for (const k of Object.keys(JSON.parse(fs.readFileSync(mf, 'utf8')).files)) bundled.add(path.basename(k));
}
const inputs = [...new Set(fs.readFileSync(path.join(NATIVE, JOB + '.fls'), 'utf8').split('\n').filter((l) => l.startsWith('INPUT ')).map((l) => { const p = l.slice(6).trim(); return path.isAbsolute(p) ? p : path.join(NATIVE, p); }))];
const files = {}; const fromTL = [];
for (const p of inputs) {
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) continue;
  if (p.startsWith(TL)) { if (bundled.has(path.basename(p)) || /\.(fmt|log)$/.test(p)) continue; files[path.basename(p)] = fs.readFileSync(p); fromTL.push(p.slice(TL.length)); }
  else if (p.startsWith(NATIVE + '/')) { const rel = p.slice(NATIVE.length + 1); if (rel === JOB + '.tex' || /\.(log|dvi)$/.test(rel)) continue; files[rel] = fs.readFileSync(p); }
}
// dvisvgm's needs are not in the recorder file: virtual fonts, the raw
// metrics they reference, and the Type 1 / encoding files their map entries
// name (psnfss fonts resolve ptmr8t -> ptmr8t.vf -> ptmr8r -> utmr8a.pfb).
const kpse = (n) => { try { return execFileSync('kpsewhich', [n], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return ''; } };
const mapFile = kpse('pdftex.map');
const mapIndex = new Map(fs.readFileSync(mapFile, 'utf8').split('\n').map((l) => [l.split(/\s+/)[0], l]));
const queue = inputs.filter((p) => p.endsWith('.tfm')).map((p) => path.basename(p, '.tfm')); const seen = new Set();
const addFont = (p) => { if (p && !bundled.has(path.basename(p)) && !files[path.basename(p)]) { files[path.basename(p)] = fs.readFileSync(p); fromTL.push(p.slice(TL.length)); } };
while (queue.length) {
  const n = queue.shift(); if (seen.has(n)) continue; seen.add(n);
  addFont(kpse(n + '.tfm'));
  const vf = kpse(n + '.vf');
  if (vf) { addFont(vf); for (const m of execFileSync('vftovp', [vf, kpse(n + '.tfm')], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().matchAll(/\(FONTNAME ([^)]+)\)/g)) queue.push(m[1].trim()); }
  const line = mapIndex.get(n); if (line) for (const m of line.matchAll(/<\[?([^\s<]+\.(pfb|enc|pfa))/g)) addFont(kpse(m[1]));
}
if (!bundled.has('pdftex.map') || fromTL.some((f) => /\.(pfb|vf)$/.test(f))) { files['pdftex.map'] = fs.readFileSync(mapFile); files['ps2pk.map'] = files['pdftex.map']; }
console.log(`${t()} ${Object.keys(files).length} job files; ${fromTL.length} from TeX Live because the bundles lack them${fromTL.length ? ':\n  ' + fromTL.sort().join('\n  ') : ''}`);

// ---- 3. tex.wasm + dvisvgm.wasm through the API ---------------------------
const src = '\\RequirePackage{lmodern}\n' + fs.readFileSync(path.join(DOC, 'pgfmanual.tex'), 'utf8');
const mp = await MetaPost.create({ log: () => {} });
const r = await mp.latex(src, { engine: 'latex', snapshot: 'none', jobName: JOB, files });
mp.dispose();
const errors = r.diagnostics.filter((d) => d.severity === 'error' || d.severity === 'fatal');
console.log(`${t()} wasm: status ${r.status}, ${r.pages.length} pages, ${errors.length} errors; TeX ${(r.stats.texMs / 1000).toFixed(0)} s, dvisvgm ${(r.stats.dvisvgmMs / 1000).toFixed(0)} s`);
for (const d of errors.slice(0, 5)) console.log(`  ! ${d.file ?? ''}:${d.line ?? ''} ${d.message}`);
const W = path.join(OUT, 'wasm'); fs.rmSync(W, { recursive: true, force: true }); fs.mkdirSync(W, { recursive: true });
r.pages.forEach((p, i) => fs.writeFileSync(path.join(W, `${String(i + 1).padStart(4, '0')}.svg`), p));
fs.writeFileSync(path.join(W, 'tex.log'), r.texLog ?? r.log); fs.writeFileSync(path.join(W, 'dvisvgm.log'), r.dvisvgmLog ?? '');

// ---- 4. compare ------------------------------------------------------------
// dvisvgm defines a font used at several sizes once and references it with
// <use transform=scale()>, and which size becomes the base varies from run
// to run (two native runs of one DVI differ on a third of the pages). So
// every glyph id (DVI font number + character) is resolved to its absolute
// outline, rounded to 3 decimals, and the <defs> block is compared as a
// sorted set; everything outside <defs> must match exactly.
const scalePath = (d, s) => d.replace(/-?\d*\.?\d+(?:e-?\d+)?/g, (n) => String(Math.round(parseFloat(n) * s * 1000) / 1000));
const canon = (svg) => svg.replace(/<!--[^>]*-->/g, '').replace(/<defs>\n([\s\S]*?)<\/defs>/g, (_m, body) => {
  const paths = new Map(), uses = [], rest = [];
  for (const l of body.split('\n').filter((l) => l !== '')) {
    let m;
    if ((m = /^<path id='(g\d+-\d+)' d='([^']*)'\/>$/.exec(l))) paths.set(m[1], m[2]);
    else if ((m = /^<use id='(g\d+-\d+)' xlink:href='#(g\d+-\d+)' transform='scale\(([^)]+)\)'\/>$/.exec(l))) uses.push([m[1], m[2], parseFloat(m[3])]);
    else rest.push(l);
  }
  const glyphs = [...paths].map(([id, d]) => `${id} ${scalePath(d, 1)}`).concat(uses.map(([id, base, s]) => `${id} ${paths.has(base) ? scalePath(paths.get(base), s) : '?' + base}`));
  return '<defs>\n' + [...glyphs.sort(), ...rest].join('\n') + '\n</defs>';
});
const nat = fs.readdirSync(path.join(NATIVE, 'svg')).sort(), ours = fs.readdirSync(W).filter((f) => f.endsWith('.svg')).sort();
let same = 0; const bad = [];
for (let i = 0; i < Math.min(nat.length, ours.length); i++) {
  if (canon(fs.readFileSync(path.join(NATIVE, 'svg', nat[i]), 'utf8')) === canon(fs.readFileSync(path.join(W, ours[i]), 'utf8'))) same++; else bad.push(i + 1);
}
console.log(`${t()} pages: native ${nat.length}, wasm ${ours.length}; identical ${same}/${Math.min(nat.length, ours.length)}${bad.length ? `; differing: ${bad.slice(0, 40).join(' ')}${bad.length > 40 ? ' …' : ''}` : ''}`);
process.exit(nat.length === ours.length && same === nat.length && errors.length === 0 ? 0 : 1);
