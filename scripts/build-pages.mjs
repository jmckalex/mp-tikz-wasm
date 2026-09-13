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
const REPO_URL = process.env.REPO_URL ?? 'https://github.com/jmckalex/mp-tikz-wasm';
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
    sources: 'live-sources.js', engines: 'three',
    extras: false,   // no editor on this page: leave out the spare metric files, keeping the single file small
    warm: (S) => [{ mp: S.harmonograph() }, { mp: S.harmonograph({ f1: 5.3, f2: 1.2, f3: 7, f4: 4.4, phase: 200, damping: 0.9, hue: 0.1 }) }, { mp: S.cube(0) }, { mp: S.cube(7.31) },
      { mp: S.pendulum({ a1: 1, a2: 2, trail: [[0, -100], [5, -103], [9, -108]] }) },
      { tex: S.clock(23, 59, 59) }, { tex: S.clock(1, 5, 0) }, { tex: S.plot() }, { tex: S.plot({ A: 0.1, k: 0, w: 6 }) }, { tex: S.plot({ A: 0.55, k: 1, w: 0.5 }) },
      { tex: S.formula() }, { tex: S.formula('\\sum_{n=1}^\\infty \\frac{1}{n^2} = \\frac{\\pi^2}{6} \\quad \\mathbb{R}^n \\otimes \\mathcal{H} \\quad \\begin{pmatrix} \\alpha & \\beta \\\\ \\gamma & \\delta \\end{pmatrix} \\quad \\hat{x} \\vec{v} \\tilde{y} \\leqslant \\varnothing \\aleph_0') },
      { tex: S.formula('\\lim_{x\\to 0} \\frac{\\sin x}{x} = 1, \\qquad \\oint_\\gamma f(z)\\,dz = 2\\pi i \\sum \\operatorname{Res} f, \\qquad \\nabla \\cdot \\mathbf{E} = \\frac{\\rho}{\\varepsilon_0}, \\quad \\sqrt[3]{x} \\Big| \\big\\| \\prod_{k} \\binom{n}{k}') }],
  },
};

const safe = (s) => s.replace(/<\/script/gi, '<\\/script');
const gz = (data) => zlib.gzipSync(data, { level: 9 }).toString('base64');
const glue = (name, global) => { let s = fs.readFileSync(path.join(DIST, name), 'utf8'); const m = /export default (\w+);\s*$/.exec(s); if (!m) throw new Error(`${name}: no default export`); return s.replace(/export default (\w+);\s*$/, `globalThis.${global} = ${m[1]};\n`); };
let libText;
const lib = () => libText ??= execFileSync(path.join(REPO, 'node_modules/.bin/esbuild'), ['src/ts/index.ts', '--bundle', '--format=esm', '--target=es2022', '--platform=browser', '--external:node:fs', '--log-level=error'], { cwd: REPO, encoding: 'utf8', maxBuffer: 64 << 20 });
const fromBundle = (rel) => { for (const b of fs.readdirSync(BUNDLES)) { const p = path.join(BUNDLES, b, 'files', rel); if (fs.existsSync(p)) return p; } return null; };

async function recordAssets(warm, extras = true) {
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
  for (const dir of extras ? ['core/files/metapost/base', 'cm-tfm/files/fonts/tfm'] : []) {   // small, and they let the editor stray a little
    const d = path.join(BUNDLES, dir);
    for (const f of fs.readdirSync(d)) { const rel = dir.split('/files/')[1] + '/' + f; if (files[rel]) continue; const data = fs.readFileSync(path.join(d, f)); manifestFiles[rel] = { size: data.length }; files[rel] = gz(data); }
  }
  const total = Object.values(manifestFiles).reduce((a, f) => a + f.size, 0);
  console.log(`  assets: ${Object.keys(files).length} files, ${(total / 1048576).toFixed(2)} MB raw`);
  return { manifest: { name: 'inline', version: '2025.1', files: manifestFiles, eager: ['web2c/texmf.cnf'] }, files, wasm: { mplib: gz(fs.readFileSync(path.join(DIST, 'mplib.wasm'))), tex: gz(fs.readFileSync(path.join(DIST, 'tex.wasm'))), dvisvgm: gz(fs.readFileSync(path.join(DIST, 'dvisvgm.wasm'))) } };
}

const ENGINE_SETS = {
  // name -> MetaPost.create options; the live page keeps three instances so that a
  // TeX run (clock, plot) or a harmonograph redraw never delays a cube frame
  one: { enginePromise: {} },
  // double arithmetic: the default scaled system stops at 4096, which an animation clock or a fast harmonograph exceeds
  three: { enginePromise: { tex: 'none', numberSystem: 'double' }, cubeEnginePromise: { tex: 'none', numberSystem: 'double' }, pendulumEnginePromise: { tex: 'none', numberSystem: 'double' }, texEnginePromise: {} },
};
function remoteBoot(engines) {
  const set = ENGINE_SETS[engines];
  return `<script type="module">
import { MetaPost } from '../dist/index.js';
globalThis.ENGINE_MODE = 'workers';
globalThis.newMetaPostEngine = () => MetaPost.create({ tex: 'none', numberSystem: 'double' });   // for the animation cards' engine recycling
${Object.entries(set).map(([k, o]) => `globalThis.${k} = MetaPost.create(${JSON.stringify(k === 'texEnginePromise' || engines === 'one' ? { ...o, snapshot: 'auto' } : o)});`).join('\n')}
</script>`;
}
// The single-file boot. The Emscripten glue uses import.meta, so it must live in
// module scripts. The same script elements are read back as text to build a
// module Worker per engine (a Blob URL), so TeX runs never block the page; if
// the host forbids blob workers, the engines fall back to running in-process.
function inlineBoot(engines, assets) {
  const set = ENGINE_SETS[engines];
  return `<script type="application/json" id="mpw-assets">${safe(JSON.stringify(assets))}</script>
<script type="module" id="mpw-glue-mplib">${safe(glue('mplib.mjs', '__createMplib'))}</script>
<script type="module" id="mpw-glue-tex">${safe(glue('tex.mjs', '__createTex'))}</script>
<script type="module" id="mpw-glue-dvisvgm">${safe(glue('dvisvgm.mjs', '__createDvisvgm'))}</script>
<script type="module" id="mpw-lib">${safe(lib())}
globalThis.__MetaPost = MetaPost;</script>
<script type="module" id="mpw-engine-core">
// shared by the page and its workers: inflate the embedded files, build the module factories, create an engine
const b64 = (s) => { const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
const inflate = async (s) => new Uint8Array(await new Response(new Blob([b64(s)]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
globalThis.__mpwCreate = async (assetsText, options) => {
  if (typeof WebAssembly === 'undefined' || typeof DecompressionStream === 'undefined') throw new Error('WebAssembly or DecompressionStream is not available here');
  const ASSETS = JSON.parse(assetsText);
  const decoded = new Map();
  const names = Object.keys(ASSETS.files); const blobs = await Promise.all(names.map((n) => inflate(ASSETS.files[n]))); names.forEach((n, i) => decoded.set(n, blobs[i]));
  const [mplibWasm, texWasm, dvisvgmWasm] = await Promise.all([inflate(ASSETS.wasm.mplib), inflate(ASSETS.wasm.tex), inflate(ASSETS.wasm.dvisvgm)]);
  // locateFile keeps the glue from resolving 'x.wasm' against import.meta.url, which fails inside a blob: worker
  const modules = { mplib: (o = {}) => globalThis.__createMplib({ locateFile: (p) => p, ...o, wasmBinary: mplibWasm }), tex: (o = {}) => globalThis.__createTex({ locateFile: (p) => p, ...o, wasmBinary: texWasm }), dvisvgm: (o = {}) => globalThis.__createDvisvgm({ locateFile: (p) => p, ...o, wasmBinary: dvisvgmWasm }) };
  const file = (u) => { const d = decoded.get(u.replace(/^inline:\\/\\/inline\\/files\\//, '')); if (!d) throw new Error('not embedded: ' + u); return d; };
  const io = { fetch: async (u) => file(u), fetchSync: (u) => file(u), fetchJson: async () => ASSETS.manifest };
  return globalThis.__MetaPost.create({ worker: false, modules, bundleIO: io, bundleBaseUrl: 'inline://', bundles: ['inline'], log: () => {}, ...options });
};
</script>
<script type="module">
const assetsText = document.getElementById('mpw-assets').textContent;
const workerSource = ['mpw-glue-mplib', 'mpw-glue-tex', 'mpw-glue-dvisvgm', 'mpw-lib', 'mpw-engine-core'].map((id) => document.getElementById(id).textContent).join('\\n') + \`
let mp = null;
self.onmessage = async (e) => {
  const m = e.data;
  try {
    if (m.type === 'init') { mp = await globalThis.__mpwCreate(m.assets, m.options); self.postMessage({ id: m.id, ok: true, result: { version: mp.version } }); return; }
    const r = m.type === 'run' ? await mp.run(m.src, m.opts) : await mp.latex(m.src, m.opts);
    self.postMessage({ id: m.id, ok: true, result: r });
  } catch (err) { self.postMessage({ id: m.id, ok: false, error: String(err && err.message || err) }); }
};\`;
let workerUrl = null;
function inWorker(options) {
  return new Promise((resolve, reject) => {
    let w;
    try { workerUrl ??= URL.createObjectURL(new Blob([workerSource], { type: 'text/javascript' })); w = new Worker(workerUrl, { type: 'module' }); } catch (e) { reject(e); return; }
    const pending = new Map(); let seq = 0;
    const call = (type, src, opts) => new Promise((res, rej) => { const id = ++seq; pending.set(id, { res, rej }); w.postMessage(type === 'init' ? { type, id, assets: src, options: opts } : { type, id, src, opts }); });
    w.onmessage = (e) => { const p = pending.get(e.data.id); if (!p) return; pending.delete(e.data.id); e.data.ok ? p.res(e.data.result) : p.rej(new Error(e.data.error)); };
    w.onerror = (e) => { const err = new Error(e.message || 'the worker failed to start'); reject(err); for (const p of pending.values()) p.rej(err); pending.clear(); };
    const timer = setTimeout(() => { reject(new Error('the worker did not start')); w.terminate(); }, 90000);
    call('init', assetsText, options).then((r) => { clearTimeout(timer); resolve({ version: r.version, run: (s, o) => call('run', s, o), latex: (s, o) => call('latex', s, o), dispose: () => w.terminate() }); }, (e) => { clearTimeout(timer); reject(e); });
  });
}
let mode = null;
async function engine(options) {
  if (mode !== 'in-process') { try { const e = await inWorker(options); mode ??= 'workers'; globalThis.ENGINE_MODE = 'workers'; return e; } catch (e) { console.warn('mp-tikz-wasm: engines run in-process here (' + e.message + ')'); } }
  mode = 'in-process'; globalThis.ENGINE_MODE = 'in-process';
  return globalThis.__mpwCreate(assetsText, options);
}
globalThis.newMetaPostEngine = () => engine({ tex: 'none', numberSystem: 'double' });
${Object.entries(set).map(([k, o]) => `globalThis.${k} = engine(${JSON.stringify(o)});`).join('\n')}
</script>`;
}

for (const [name, page] of Object.entries(PAGES)) {
  if (only && only !== name) continue;
  console.log(`== ${name}`);
  const template = fs.readFileSync(path.join(SITE, `${name}.template.html`), 'utf8');
  const S = loadSources(page.sources);
  const assets = await recordAssets(page.warm(S), page.extras !== false);
  for (const mode of ['remote', 'inline']) {
    const html = template
      .replace('__CM_CSS__', () => cmCss)
      .replace('__SOURCES_SCRIPT__', () => mode === 'remote' ? `<script src="./${page.sources}"></script>` : `<script>${safe(fs.readFileSync(path.join(SITE, page.sources), 'utf8'))}</script>`)
      .replace('__COMMON_SCRIPT__', () => mode === 'remote' ? '<script src="./page-common.js"></script>' : `<script>${safe(fs.readFileSync(path.join(SITE, 'page-common.js'), 'utf8'))}</script>`)
      .replace('__BOOT__', () => mode === 'remote' ? remoteBoot(page.engines) : inlineBoot(page.engines, assets))
      .replace(/__GUIDE_URL__/g, mode === 'remote' ? './guide.html' : (process.env.GUIDE_URL ?? './guide.html'))
      .replace(/__REPO_URL__/g, REPO_URL);
    const out = mode === 'remote' ? path.join(SITE, `${name}.html`) : path.join(OUT, `${name}.single.html`);
    // the single-file copies are published as artifacts, whose viewer supplies the document skeleton itself
    const body = mode === 'inline' ? html.replace(/^<!doctype html>\s*<html lang="en">\s*<head>\s*<meta charset="utf-8">\s*<meta name="viewport"[^>]*>\s*/, '').replace('</head>\n<body>\n', '').replace(/<\/body>\s*<\/html>\s*$/, '') : html;
    fs.writeFileSync(out, body);
    console.log(`  ${path.relative(REPO, out)}: ${(html.length / 1048576).toFixed(2)} MB`);
  }
}
