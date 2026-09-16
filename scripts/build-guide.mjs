// build-guide.mjs — render every figure in scripts/guide-examples.mjs with the
// wasm engines and assemble site/guide.html from site/guide.template.html.
// The result is a static page (no wasm needed to view it) suitable for
// GitHub Pages and for the release archive.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { MetaPost } from '../dist/index.js';
import { GUIDE } from './guide-examples.mjs';
import { highlightPage } from './highlight.mjs';

const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const REPO_URL = process.env.REPO_URL ?? 'https://github.com/jmckalex/mp-tikz-wasm';
const VERSION = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8')).version;
const esc = (s) => s.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
const MB = (n) => (n / 1048576).toFixed(1);

const mp = await MetaPost.create({ logLevel: 'silent' });
const figures = {};
for (const ex of GUIDE) {
  let svg, ms;
  if (ex.kind === 'mp') {
    const r = await mp.run(ex.src, { format: 'svg', svg: { idPrefix: `${ex.id}-` } });
    if (r.status === 'error' || r.status === 'fatal') console.log(`  ! ${ex.id}: ${r.diagnostics.map((d) => d.message).join('; ')}`);
    svg = r.figures[0]?.svg ?? ''; ms = `${r.stats.metapostMs.toFixed(0)} ms MetaPost${r.stats.texRuns ? `, ${r.stats.texMs.toFixed(0)} ms TeX` : ''}`;
  } else {
    const r = await mp.latex(ex.src, { engine: ex.engine ?? (ex.plain ? 'plain' : 'latex'), svg: { idPrefix: `${ex.id}-`, precision: false } });
    if (r.status !== 'ok') console.log(`  ! ${ex.id}: ${r.diagnostics.map((d) => d.message).join('; ')}`);
    svg = r.pages[0] ?? ''; ms = `${r.stats.texMs.toFixed(0)} ms ${/lua/.test(r.format) ? 'LuaTeX' : 'TeX'}, ${r.stats.dvisvgmMs.toFixed(0)} ms dvisvgm${r.format === 'tikz' ? ' (snapshot)' : ''}`;
  }
  // Both engines emit an XML prolog and a comment before the root element;
  // drop them so the SVG can be inlined, then let CSS size it: the intrinsic
  // width (px for MetaPost, pt for dvisvgm) scaled up for legibility.
  svg = svg.replace(/^[\s\S]*?(?=<svg[\s>])/, '');
  const m = /^<svg[^>]*?\swidth=['"]([\d.]+)(pt|px)?['"]/.exec(svg);
  const w = m ? parseFloat(m[1]) * (m[2] === 'pt' ? 96 / 72 : 1) : 200;
  const shown = Math.min(Math.max(w * 1.7, 220), 640).toFixed(0);
  const scaled = svg.replace(/^(<svg[^>]*?)\sheight=['"][^'"]*['"]/, '$1').replace(/^(<svg[^>]*?)\swidth=['"][^'"]*['"]/, `$1 style="width:min(100%,${shown}px)"`);
  if (!/^<svg[^>]*style=/.test(scaled)) console.log(`  ! ${ex.id}: could not size svg`);
  figures[ex.id] = `<figure class="ex" id="${ex.id}">
  <div class="fig">${scaled}</div>
  <figcaption><b>${esc(ex.title)}</b>${ex.note ? ` — ${ex.note.replace(/`([^`]+)`/g, (_m, c) => `<code>${esc(c)}</code>`)}` : ''} <span class="ms">${ms}</span></figcaption>
  <details><summary>source (${ex.kind === 'mp' ? 'MetaPost' : ex.plain ? 'plain TeX' : 'LaTeX'})</summary><pre><code>${esc(ex.src)}</code></pre></details>
</figure>`;
  console.log(`  ${ex.id.padEnd(12)} ${ms}`);
}
const wordmark = (await mp.run('prologues:=3; beginfig(1); draw "mp-tikz-wasm" infont "cmbx10" scaled 4.5; endfig; end.', { format: 'svg', svg: { idPrefix: 'wm-' } })).figures[0].svg;
mp.dispose();

const sz = (f) => fs.statSync(path.join(REPO, 'dist', f)).size;
const gz = (f) => zlib.gzipSync(fs.readFileSync(path.join(REPO, 'dist', f)), { level: 6 }).length;
const numbers = { mplib: sz('mplib.wasm'), tex: sz('tex.wasm'), dvisvgm: sz('dvisvgm.wasm'), gz: gz('mplib.wasm') + gz('tex.wasm') + gz('dvisvgm.wasm') };  // luatex.wasm is optional and listed separately

let html = fs.readFileSync(path.join(REPO, 'site/guide.template.html'), 'utf8');
html = html.replace(/__FIG:([a-z0-9-]+)__/g, (_m, id) => figures[id] ?? `<p class="missing">missing figure ${id}</p>`)
  .replace(/__WORDMARK__/g, () => wordmark)
  .replace(/__REPO_URL__/g, REPO_URL)
  .replace(/__VERSION__/g, VERSION)
  .replace(/__WASM_MB__/g, MB(numbers.mplib + numbers.tex + numbers.dvisvgm))
  .replace(/__WASM_GZ_MB__/g, MB(numbers.gz))
  .replace(/__MPLIB_MB__/g, MB(numbers.mplib)).replace(/__TEX_MB__/g, MB(numbers.tex)).replace(/__DVISVGM_MB__/g, MB(numbers.dvisvgm)).replace(/__LUATEX_MB__/g, MB(sz('luatex.wasm')));
html = highlightPage(html);   // the lang-html / lang-js code blocks
fs.writeFileSync(path.join(REPO, 'site/guide.html'), html);
console.log(`  site/guide.html: ${(html.length / 1024).toFixed(0)} KB`);
