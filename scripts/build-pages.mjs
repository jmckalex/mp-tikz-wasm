// build-pages.mjs — the two small pages: site/minimal.html (two CodeMirror
// editors, MetaPost and TikZ) and site/live.html (graphics that re-typeset in
// real time). Each template is emitted twice:
//   site/<page>.html               hosted next to dist/ (Web Worker, lazy bundles)
//   build/pages/<page>.single.html self-contained: engines, formats and the files
//                                  the page's documents touch are inlined, as in
//                                  build-standalone.mjs (in-process, no network)
//
//   node scripts/build-pages.mjs [minimal|live]      REPO_URL / GUIDE_URL override the links
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { MetaPost } from '../dist/index.js';

const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const DIST = path.join(REPO, 'dist'), BUNDLES = path.join(DIST, 'bundles'), SITE = path.join(REPO, 'site'), OUT = path.join(REPO, 'build/pages');
const REPO_URL = process.env.REPO_URL ?? 'https://github.com/YOUR-GITHUB-USER/metapost-wasm';
const only = process.argv[2];
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(path.join(REPO, 'build/vendor'), { recursive: true });

const loadSources = (file) => { const g = {}; new Function('globalThis', fs.readFileSync(path.join(SITE, file), 'utf8'))(g); return g.PAGE_SOURCES; };
const cmCssPath = path.join(REPO, 'build/vendor/codemirror.min.css');
if (!fs.existsSync(cmCssPath)) fs.writeFileSync(cmCssPath, await (await fetch('https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/codemirror.min.css')).text());
const cmCss = fs.readFileSync(cmCssPath, 'utf8');

const PAGES = {
  minimal: {
    sources: 'minimal-sources.js', engines: 'one',
    warm: (S) => [{ mp: S.metapost }, { tex: S.tikz }],
  },
  live: {
    sources: 'live-sources.js', engines: 'two',
    warm: (S) => [{ mp: S.harmonograph() }, { mp: S.harmonograph({ f1: 5.3, f2: 1.2, f3: 7, f4: 4.4, phase: 200, damping: 0.9, hue: 0.1 }) }, { mp: S.cube(0) }, { mp: S.cube(7.31) },
      { tex: S.clock(23, 59, 59) }, { tex: S.clock(1, 5, 0) }, { tex: S.plot() }, { tex: S.plot({ A: 0.1, k: 0, w: 6 }) }, { tex: S.plot({ A: 0.55, k: 1, w: 0.5 }) }],
  },
};

const safe = (s) => s.replace(/<\/script/gi, '<\\/script');
const gz = (data) => zlib.gzipSync(data, { level: 9 }).toString('base64');
const glue = (name, global) => { let s = fs.readFileSync(path.join(DIST, name), 'utf8'); const m = /export default (\w+);\s*$/.exec(s); if (!m) throw new Error(`${name}: no default export`); return s.replace(/export default (\w+);\s*$/, `globalThis.${global} = ${m[1]};\n`); };
let libText;
const lib = () => libText ??= execFileSync(path.join(REPO, 'node_modules/.bin/esbuild'), ['src/ts/index.ts', '--bundle', '--format=esm', '--target=es2022', '--platform=browser', '--external:node:fs', '--log-level=error'], { cwd: REPO, encoding: 'utf8', maxBuffer: 64 << 20 });
const fromBundle = (rel) => { for (const b of fs.readdirSync(BUNDLES)) { const p = path.join(BUNDLES, b, 'files', rel); if (fs.existsSync(p)) return p; } return null; };

async function recordAssets(warm) {
  const used = new Set();
  const record = (u) => { const m = /\/bundles\/[^/]+\/files\/(.+)$/.exec(u); if (m) used.add(m[1]); };
  const io = { async fetch(u) { record(u); return new Uint8Array(fs.readFileSync(u.replace(/^file:\/\//, ''))); }, fetchSync(u) { record(u); return new Uint8Array(fs.readFileSync(u.replace(/^file:\/\//, ''))); }, async fetchJson(u) { return JSON.parse(fs.readFileSync(u.replace(/^file:\/\//, ''), 'utf8')); } };
  const mp = await MetaPost.create({ bundleIO: io, bundleBaseUrl: 'file://' + BUNDLES + '/', log: () => {}, snapshot: 'none' });
  for (const w of warm) {
    const r = w.mp ? await mp.run(w.mp, { format: 'svg' }) : await mp.latex(w.tex, { snapshot: 'none' });
    if (r.status === 'error' || r.status === 'fatal') console.log('  ! a warm-up document failed:', r.diagnostics.filter((d) => d.severity === 'error').map((d) => d.message).slice(0, 2));
  }
  mp.dispose();
  used.delete('web2c/tikz.fmt');
  const manifestFiles = {}, files = {};
  for (const rel of [...used].sort()) { const p = fromBundle(rel); if (!p) continue; const data = fs.readFileSync(p); manifestFiles[rel] = { size: data.length }; files[rel] = gz(data); }
  for (const dir of ['core/files/metapost/base', 'cm-tfm/files/fonts/tfm']) {   // small, and they let the editor stray a little
    const d = path.join(BUNDLES, dir);
    for (const f of fs.readdirSync(d)) { const rel = dir.split('/files/')[1] + '/' + f; if (files[rel]) continue; const data = fs.readFileSync(path.join(d, f)); manifestFiles[rel] = { size: data.length }; files[rel] = gz(data); }
  }
  const total = Object.values(manifestFiles).reduce((a, f) => a + f.size, 0);
  console.log(`  assets: ${Object.keys(files).length} files, ${(total / 1048576).toFixed(2)} MB raw`);
  return { manifest: { name: 'inline', version: '2025.1', files: manifestFiles, eager: ['web2c/texmf.cnf'] }, files, wasm: { mplib: gz(fs.readFileSync(path.join(DIST, 'mplib.wasm'))), tex: gz(fs.readFileSync(path.join(DIST, 'tex.wasm'))), dvisvgm: gz(fs.readFileSync(path.join(DIST, 'dvisvgm.wasm'))) } };
}

function remoteBoot(engines) {
  return `<script type="module">
import { MetaPost } from '../dist/index.js';
${engines === 'two'
    ? `globalThis.enginePromise = MetaPost.create({ tex: 'none' });            // MetaPost only: the animation must never wait for TeX
globalThis.texEnginePromise = MetaPost.create({ snapshot: 'auto' });   // pdfTeX + dvisvgm; the pre-warmed tikz.fmt makes pgfplots ~250 ms`
    : `globalThis.enginePromise = MetaPost.create({ snapshot: 'auto' });`}
</script>`;
}
// the Emscripten glue uses import.meta, so it must be a module script (a classic
// inline script would be a syntax error and leave the globals undefined)
function inlineBoot(engines, assets) {
  return `<script type="application/json" id="mpw-assets">${safe(JSON.stringify(assets))}</script>
<script type="module">${safe(glue('mplib.mjs', '__createMplib'))}</script>
<script type="module">${safe(glue('tex.mjs', '__createTex'))}</script>
<script type="module">${safe(glue('dvisvgm.mjs', '__createDvisvgm'))}</script>
<script type="module">
${safe(lib())}
const ASSETS = JSON.parse(document.getElementById('mpw-assets').textContent);
const b64 = (s) => { const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
const inflate = async (s) => new Uint8Array(await new Response(new Blob([b64(s)]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
const decoded = new Map();
const file = (u) => { const d = decoded.get(u.replace(/^inline:\\/\\/inline\\/files\\//, '')); if (!d) throw new Error('not embedded: ' + u); return d; };
const io = { fetch: async (u) => file(u), fetchSync: (u) => file(u), fetchJson: async () => ASSETS.manifest };
const base = (async () => {
  if (typeof WebAssembly === 'undefined' || typeof DecompressionStream === 'undefined') throw new Error('WebAssembly or DecompressionStream is not available here');
  const names = Object.keys(ASSETS.files); const blobs = await Promise.all(names.map((n) => inflate(ASSETS.files[n]))); names.forEach((n, i) => decoded.set(n, blobs[i]));
  const [mplibWasm, texWasm, dvisvgmWasm] = await Promise.all([inflate(ASSETS.wasm.mplib), inflate(ASSETS.wasm.tex), inflate(ASSETS.wasm.dvisvgm)]);
  return { mplib: (o = {}) => globalThis.__createMplib({ ...o, wasmBinary: mplibWasm }), tex: (o = {}) => globalThis.__createTex({ ...o, wasmBinary: texWasm }), dvisvgm: (o = {}) => globalThis.__createDvisvgm({ ...o, wasmBinary: dvisvgmWasm }) };
})();
const make = (extra) => base.then((modules) => MetaPost.create({ worker: false, modules, bundleIO: io, bundleBaseUrl: 'inline://', bundles: ['inline'], log: () => {}, ...extra }));
${engines === 'two' ? `globalThis.enginePromise = make({ tex: 'none' });\nglobalThis.texEnginePromise = make({});` : `globalThis.enginePromise = make({});`}
</script>`;
}

for (const [name, page] of Object.entries(PAGES)) {
  if (only && only !== name) continue;
  console.log(`== ${name}`);
  const template = fs.readFileSync(path.join(SITE, `${name}.template.html`), 'utf8');
  const S = loadSources(page.sources);
  const assets = await recordAssets(page.warm(S));
  for (const mode of ['remote', 'inline']) {
    const html = template
      .replace('__CM_CSS__', () => cmCss)
      .replace('__SOURCES_SCRIPT__', () => mode === 'remote' ? `<script src="./${page.sources}"></script>` : `<script>${safe(fs.readFileSync(path.join(SITE, page.sources), 'utf8'))}</script>`)
      .replace('__COMMON_SCRIPT__', () => mode === 'remote' ? '<script src="./page-common.js"></script>' : `<script>${safe(fs.readFileSync(path.join(SITE, 'page-common.js'), 'utf8'))}</script>`)
      .replace('__BOOT__', () => mode === 'remote' ? remoteBoot(page.engines) : inlineBoot(page.engines, assets))
      .replace(/__GUIDE_URL__/g, mode === 'remote' ? './guide.html' : (process.env.GUIDE_URL ?? './guide.html'))
      .replace(/__REPO_URL__/g, REPO_URL);
    const out = mode === 'remote' ? path.join(SITE, `${name}.html`) : path.join(OUT, `${name}.single.html`);
    fs.writeFileSync(out, html);
    console.log(`  ${path.relative(REPO, out)}: ${(html.length / 1048576).toFixed(2)} MB`);
  }
}
