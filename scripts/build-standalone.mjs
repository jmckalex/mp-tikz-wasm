// build-standalone.mjs — a single self-contained HTML demo: mplib.wasm,
// tex.wasm, the formats, fonts and macro files the gallery needs, and the
// library itself, all inlined (base64). Runs in-process (no Worker, no
// network). Also pre-renders every gallery example with the engine under Node
// so the page shows real output even where WebAssembly is not permitted.
//
//   node scripts/build-standalone.mjs   ->  site/standalone.html
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { MetaPost } from '../dist/index.js';
import { EXAMPLES } from '../site/examples.js';
import { TIKZ_EXAMPLES } from '../site/examples-tikz.js';

const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const DIST = path.join(REPO, 'dist');
const BUNDLES = path.join(DIST, 'bundles');

// ---- 1. pre-render the gallery, recording every bundle file that gets used
const used = new Set();
const record = (url) => { const m = /\/bundles\/[^/]+\/files\/(.+)$/.exec(url); if (m) used.add(m[1]); };
const io = {
  async fetch(u) { record(u); return new Uint8Array(fs.readFileSync(u.replace(/^file:\/\//, ''))); },
  fetchSync(u) { record(u); return new Uint8Array(fs.readFileSync(u.replace(/^file:\/\//, ''))); },
  async fetchJson(u) { return JSON.parse(fs.readFileSync(u.replace(/^file:\/\//, ''), 'utf8')); },
};
const mp = await MetaPost.create({ bundleIO: io, bundleBaseUrl: 'file://' + BUNDLES + '/', log: () => {} });
const gallery = [];
for (let i = 0; i < EXAMPLES.length; i++) {
  const ex = EXAMPLES[i];
  const r = await mp.run(ex.src, { format: 'svg', svg: { idPrefix: `g${i}-` } });
  gallery.push({ id: ex.id, title: ex.title, tier: ex.tier, blurb: ex.blurb, src: ex.src, svg: r.figures[0]?.svg ?? '', status: r.status, stats: r.stats, diagnostics: r.diagnostics.slice(0, 3) });
  console.log(`  ${ex.id.padEnd(8)} ${r.status.padEnd(6)} ${r.stats.totalMs.toFixed(0).padStart(4)} ms  ${(r.figures[0]?.svg?.length ?? 0)} B`);
}
const wordmark = (await mp.run('prologues:=3; beginfig(1); draw "MetaPost" infont "cmbx10" scaled 6; endfig; end.', { format: 'svg', svg: { idPrefix: 'wm-' } })).figures[0].svg;
// TikZ gallery: whole documents through tex.wasm + dvisvgm.wasm
const tikzGallery = [];
for (let i = 0; i < TIKZ_EXAMPLES.length; i++) {
  const ex = TIKZ_EXAMPLES[i];
  const r = await mp.latex(ex.src, { engine: ex.plain ? 'plain' : 'latex', svg: { idPrefix: `t${i}-`, precision: false } });
  tikzGallery.push({ id: ex.id, title: ex.title, tier: ex.tier, blurb: ex.blurb, src: ex.src, svg: r.pages[0] ?? '', status: r.status, stats: r.stats, plain: !!ex.plain });
  console.log(`  ${ex.id.padEnd(12)} ${r.status.padEnd(7)} TeX ${r.stats.texMs.toFixed(0).padStart(4)} ms, dvisvgm ${r.stats.dvisvgmMs.toFixed(0).padStart(3)} ms  ${(r.pages[0]?.length ?? 0)} B`);
}
// warm a few more fonts and files so the live editor has room to play
const extra = [
  'prologues:=3; beginfig(1); label("x" infont "cmr5", origin); label("x" infont "cmr7", origin); label("x" infont "cmr12", origin); label("x" infont "cmr17", origin); label("x" infont "cmbx12", origin); label("x" infont "cmss10", origin); label("x" infont "cmsl10", origin); label("x" infont "cmtt12", origin); label("x" infont "cmmi12", origin); label("x" infont "cmsy5", origin); label("x" infont "cmbx7", origin); label("x" infont "cmitt10", origin); label("x" infont "cmcsc10", origin); endfig; end.',
  'verbatimtex \\documentclass{article}\\usepackage{amsmath,amssymb,amsfonts}\\usepackage[T1]{fontenc}\\begin{document} etex beginfig(1); label(btex \\Large $\\mathcal{A}\\mathfrak{B}\\aleph\\leqslant\\varnothing\\sum\\prod\\oint$ \\textsc{Small} \\textsf{sans} \\texttt{mono} \\tiny tiny \\footnotesize foot \\small small \\large large \\huge huge etex, origin); endfig; end.',
  'input format; input sarith; input rboxes; input string; input marith; beginfig(1); draw origin; endfig; end.',
  'beginfig(1); label(btex \\font\\a=cmr17 \\a Big $\\bf x^2$ \\it italic \\sl slanted \\tt tt etex, origin); endfig; end.',
];
for (const src of extra) await mp.run(src);
mp.dispose();

// ---- 2. collect assets (every blob is gzip-compressed, then base64: the page
// inflates them at boot with DecompressionStream; base64 alone would put the
// three wasm modules over the size budget)
const gz = (data) => zlib.gzipSync(data, { level: 9 }).toString('base64');
const manifestFiles = {};
const files = {};
const fromBundle = (rel) => {
  for (const b of fs.readdirSync(BUNDLES)) { const p = path.join(BUNDLES, b, 'files', rel); if (fs.existsSync(p)) return p; }
  return null;
};
for (const rel of [...used].sort()) {
  const p = fromBundle(rel); if (!p) continue;
  const data = fs.readFileSync(p);
  manifestFiles[rel] = { size: data.length };
  files[rel] = gz(data);
}
// every base macro file and every CM tfm are small; include them all
for (const dir of ['core/files/metapost/base', 'cm-tfm/files/fonts/tfm']) {
  const d = path.join(BUNDLES, dir);
  for (const f of fs.readdirSync(d)) {
    const rel = dir.split('/files/')[1] + '/' + f;
    if (files[rel]) continue;
    const data = fs.readFileSync(path.join(d, f));
    manifestFiles[rel] = { size: data.length }; files[rel] = gz(data);
  }
}
const manifest = { name: 'inline', version: '2025.1', files: manifestFiles, eager: ['web2c/texmf.cnf'] };
const total = Object.values(manifestFiles).reduce((a, f) => a + f.size, 0);
console.log(`  assets: ${Object.keys(files).length} files, ${(total / 1024 / 1024).toFixed(2)} MB`);

// ---- 3. the engine glue and the library bundle
const glue = (name, global) => {
  let s = fs.readFileSync(path.join(DIST, name), 'utf8');
  const exp = /export default (\w+);\s*$/.exec(s);
  if (!exp) throw new Error(`${name}: no default export found`);
  s = s.replace(/export default (\w+);\s*$/, `globalThis.${global} = ${exp[1]};\n`);
  return s;
};
const mplibGlue = glue('mplib.mjs', '__createMplib');
const texGlue = glue('tex.mjs', '__createTex');
const lib = execFileSync(path.join(REPO, 'node_modules/.bin/esbuild'), ['src/ts/index.ts', '--bundle', '--format=esm', '--target=es2022', '--platform=browser', '--external:node:fs', '--log-level=error'], { cwd: REPO, encoding: 'utf8', maxBuffer: 64 << 20 });
const dvisvgmGlue = glue('dvisvgm.mjs', '__createDvisvgm');
const wasm = { mplib: gz(fs.readFileSync(path.join(DIST, 'mplib.wasm'))), tex: gz(fs.readFileSync(path.join(DIST, 'tex.wasm'))), dvisvgm: gz(fs.readFileSync(path.join(DIST, 'dvisvgm.wasm'))) };

// ---- 4. assemble
const template = fs.readFileSync(path.join(REPO, 'site/standalone.template.html'), 'utf8');
const numbers = {
  mplib: fs.statSync(path.join(DIST, 'mplib.wasm')).size, tex: fs.statSync(path.join(DIST, 'tex.wasm')).size,
  latexfmt: fs.statSync(path.join(BUNDLES, 'latex-core/files/web2c/latex.fmt')).size, plainfmt: fs.statSync(path.join(BUNDLES, 'tex-plain/files/web2c/plain.fmt')).size,
  dvisvgm: fs.statSync(path.join(DIST, 'dvisvgm.wasm')).size,
};
const safe = (s) => s.replace(/<\/script/gi, '<\\/script');
// function replacements: the payloads contain `$` sequences that String.replace would interpret
let html = template
  .replace('__WORDMARK__', () => wordmark)
  .replace('__GALLERY_JSON__', () => safe(JSON.stringify(gallery)))
  .replace('__TIKZ_GALLERY_JSON__', () => safe(JSON.stringify(tikzGallery)))
  .replace('__GLUE_DVISVGM__', () => safe(dvisvgmGlue))
  .replace('__NUMBERS_JSON__', () => JSON.stringify(numbers))
  .replace('__ASSETS_JSON__', () => safe(JSON.stringify({ manifest, files, wasm })))
  .replace('__GLUE_MPLIB__', () => safe(mplibGlue))
  .replace('__GLUE_TEX__', () => safe(texGlue))
  .replace('__LIB__', () => safe(lib));
fs.writeFileSync(path.join(REPO, 'site/standalone.html'), html);
console.log(`  site/standalone.html: ${(html.length / 1024 / 1024).toFixed(1)} MB`);
