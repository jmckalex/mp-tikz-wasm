// what a page actually downloads, per scenario (bundle files touched) + the fixed wasm/js payload
import { MetaPost } from new URL('../dist', import.meta.url).pathname.replace(/\/$/, '') + '/index.js';
import fs from 'node:fs';
import zlib from 'node:zlib';
const BUNDLES = new URL('../dist', import.meta.url).pathname.replace(/\/$/, '') + '/bundles';
const DIST = new URL('../dist', import.meta.url).pathname.replace(/\/$/, '') + '';
const gz = (b) => zlib.gzipSync(b, { level: 6 }).length;
const MB = (n) => (n / 1048576).toFixed(2) + ' MB';
let used = new Map();
const record = (u) => { const m = /\/bundles\/([^/]+)\/files\/(.+)$/.exec(u); if (m) { const p = u.replace(/^file:\/\//, ''); used.set(m[2], fs.statSync(p).size); } };
const io = { async fetch(u) { record(u); return new Uint8Array(fs.readFileSync(u.replace(/^file:\/\//, ''))); }, fetchSync(u) { record(u); return new Uint8Array(fs.readFileSync(u.replace(/^file:\/\//, ''))); }, async fetchJson(u) { return JSON.parse(fs.readFileSync(u.replace(/^file:\/\//, ''), 'utf8')); } };
const scenarios = {
  'MetaPost geometry only': () => mp.run('beginfig(1); draw fullcircle scaled 50; endfig; end.'),
  'MetaPost label() (CM outlines)': () => mp.run('prologues:=3; beginfig(1); label("MetaPost", origin); endfig; end.'),
  'MetaPost btex plain TeX': () => mp.run('prologues:=3; beginfig(1); label(btex $\\sqrt{x^2+1}$ etex, origin); endfig; end.'),
  'MetaPost btex LaTeX+amsmath': () => mp.run('verbatimtex \\documentclass{article}\\usepackage{amsmath}\\begin{document} etex prologues:=3; beginfig(1); label(btex $\\begin{pmatrix}1&2\\\\3&4\\end{pmatrix}$ etex, origin); endfig; end.'),
  'TikZ standalone, snapshot': () => mp.latex('\\documentclass[tikz,border=2pt]{standalone}\\usetikzlibrary{arrows.meta}\\begin{document}\\begin{tikzpicture}\\draw[->] (0,0)--(2,1) node[right]{$x^2$};\\end{tikzpicture}\\end{document}'),
  'TikZ standalone, no snapshot': () => mp.latex('\\documentclass[tikz,border=2pt]{standalone}\\usetikzlibrary{arrows.meta}\\begin{document}\\begin{tikzpicture}\\draw[->] (0,0)--(2,1) node[right]{$x^2$};\\end{tikzpicture}\\end{document}', { snapshot: 'none' }),
  'pgfplots, snapshot': () => mp.latex('\\documentclass[border=2pt]{standalone}\\usepackage{pgfplots}\\pgfplotsset{compat=1.18}\\begin{document}\\begin{tikzpicture}\\begin{axis}\\addplot[domain=0:2]{x^2};\\end{axis}\\end{tikzpicture}\\end{document}'),
  'TikZ + lmodern T1 text': () => mp.latex('\\documentclass[tikz,border=2pt]{standalone}\\usepackage{lmodern}\\usepackage[T1]{fontenc}\\begin{document}\\tikz\\node[draw]{Latin Modern \\textbf{bold} \\textit{it}};\\end{document}'),
};
let mp;
console.log('fixed payload (fetched once, then browser-cached):');
for (const f of ['mplib.wasm', 'tex.wasm', 'dvisvgm.wasm']) { const b = fs.readFileSync(`${DIST}/${f}`); console.log(`  ${f.padEnd(14)} ${MB(b.length)} raw, ${MB(gz(b))} gzip`); }
let js = 0, jsgz = 0; for (const f of fs.readdirSync(DIST)) if (/\.(js|mjs)$/.test(f)) { const b = fs.readFileSync(`${DIST}/${f}`); js += b.length; jsgz += gz(b); } for (const d of ['tex', 'vfs', 'render']) for (const f of fs.readdirSync(`${DIST}/${d}`)) if (f.endsWith('.js')) { const b = fs.readFileSync(`${DIST}/${d}/${f}`); js += b.length; jsgz += gz(b); }
console.log(`  JavaScript      ${MB(js)} raw, ${MB(jsgz)} gzip`);
console.log('\nbundle files touched per scenario (each fetched once, then browser-cached):');
for (const [name, run] of Object.entries(scenarios)) {
  used = new Map();
  mp = await MetaPost.create({ bundleIO: io, bundleBaseUrl: 'file://' + BUNDLES + '/', log: () => {} });
  await run();
  let raw = 0, gzs = 0; for (const [p, n] of used) { raw += n; gzs += gz(fs.readFileSync(`${BUNDLES}/${[...fs.readdirSync(BUNDLES)].find((b) => fs.existsSync(`${BUNDLES}/${b}/files/${p}`))}/files/${p}`)); }
  const fmt = [...used.keys()].filter((p) => p.endsWith('.fmt')).map((p) => p.split('/').pop()).join(',');
  console.log(`  ${name.padEnd(32)} ${String(used.size).padStart(4)} files  ${MB(raw).padStart(8)} raw  ${MB(gzs).padStart(8)} gzip  ${fmt ? '(' + fmt + ')' : ''}`);
  mp.dispose();
}
const total = fs.readdirSync(BUNDLES).filter((b) => fs.existsSync(`${BUNDLES}/${b}/manifest.json`)).map((b) => JSON.parse(fs.readFileSync(`${BUNDLES}/${b}/manifest.json`)).files).reduce((a, f) => a + Object.values(f).reduce((x, y) => x + y.size, 0), 0);
console.log(`\nwhole bundle tree on the server: ${MB(total)}`);
process.exit(0);
