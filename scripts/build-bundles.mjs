// build-bundles.mjs — split build/texmf into bundles under dist/bundles/<name>/
// with a manifest.json each (docs/06 §3). Files are copied (not content-
// addressed) so any static host can serve them.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const TEXMF = path.resolve(process.argv[2] ?? path.join(REPO, 'build/texmf'));
const OUT = path.join(REPO, 'dist/bundles');
const VERSION = '2025.1';

// recipe: bundle name -> predicate on the relative path; first match wins.
// build-time only files (format building) never ship: unicode-data, *.ini, texfonts.map.
// The exception is the six Unicode tables luaotfload and lua-uni-algos read at
// *run* time (luaotfload-multiscript.lua opens Scripts.txt and ScriptExtensions.txt
// through kpse.find_file); without them fontspec dies before the first glyph.
// They ride in the `opentype` bundle and, like every bundle file, are fetched
// only when something actually reads them.
// All the .txt tables, not a hand-picked list: lua-uni-algos builds the name it
// asks for at run time (lua-uni-parse.lua), so which ones a document needs is not
// decidable here. The .tex loaders stay build-time only. Being bundle files they
// are fetched individually on demand -- 3.3 MB is the ceiling, not the cost.
const isUnicodeRuntime = (p) => p.startsWith('tex/generic/unicode-data/') && p.endsWith('.txt');
// \usepackage{fontspec} alone sets up TU-encoded Latin Modern, and the kernel's TU
// fd files (tulmr.fd and friends) name every one of the family's 72 faces by optical
// size and shape: a 12pt class asks for lmroman12-*, \small for lmroman9, \textsc
// for lmromancaps10, and NFSS fails the moment a face is selected that is not there.
// So the whole text family travels with the machinery (7.2 MB nominal, fetched one
// face at a time on demand, so a document costs only the faces it selects). An
// earlier cut shipped the twelve 10 pt faces alone and broke every non-10pt class.
const isDefaultFace = (p) => p.startsWith('fonts/opentype/public/lm/');
// luaotfload's font-name database, prebuilt by make-fontdb.mjs; core.ts seeds each
// engine's font cache from it so a fresh engine does not open every face to build it.
const isFontDb = (p) => p.startsWith('luaotfload/');

const SKIP = (p) => (p.startsWith('tex/generic/unicode-data/') && !isUnicodeRuntime(p)) || p === 'fonts/map/texfonts.map' || p.startsWith('tex/generic/config/');
const RECIPES = [
  ['core',       (p) => p.startsWith('web2c/texmf.cnf') || p.startsWith('metapost/') || p.startsWith('fonts/map/')],
  // the 35 standard PostScript fonts: psnfss metrics/virtual fonts (p??*), URW Type 1 (u??*), the 8r encoding
  ['ps-fonts',   (p) => /^fonts\/(tfm|vf)\/p[a-z]{2}[a-z0-9]*\.(tfm|vf)$/.test(p) || /^fonts\/type1\/u[a-z]{2}[a-z0-9]*\.pfb$/.test(p) || p === 'fonts/enc/8r.enc'],
  ['lm-fonts',   (p) => /^fonts\/(tfm|type1)\/([a-z0-9]+-)?lm/.test(p) || p.startsWith('fonts/enc/') || p.startsWith('tex/latex/lm/')],
  ['cm-tfm',     (p) => p.startsWith('fonts/tfm/') || p.startsWith('fonts/vf/')],
  ['cm-type1',   (p) => p.startsWith('fonts/type1/')],
  ['tikz-snapshot', (p) => p === 'web2c/tikz.fmt'],
  // OpenType support is its own bundle rather than part of `luatex`: it is 9 MB,
  // and a LuaTeX document that never asks for fontspec -- graph drawing, say --
  // should not pay for it. Must precede `luatex` and `latex-extra`, which would
  // otherwise claim tex/luatex/ and tex/latex/ wholesale.
  ['opentype',   (p) => /^tex\/luatex\/(luaotfload|lualibs|luatexbase)\//.test(p) || /^tex\/latex\/(fontspec|unicode-math)\//.test(p) || p.startsWith('tex/lualatex/') || isUnicodeRuntime(p) || isDefaultFace(p) || isFontDb(p)],
  // everything else with an outline: latinmodern-math (what unicode-math needs) and
  // whatever else lands under fonts/opentype or fonts/truetype. Kept apart because
  // luaotfload scans every face on OPENTYPEFONTS to build its name index the first
  // time a face is looked up BY NAME (\setmainfont{Latin Modern Roman}), so each one
  // shipped is paid for on that render whether or not the document uses it.
  ['otf-fonts',  (p) => p.startsWith('fonts/opentype/') || p.startsWith('fonts/truetype/')],
  // LuaTeX in DVI mode: its two formats (the Lua libraries it runs, e.g. graphdrawing, ship with pgf in latex-extra).
  // lua-uni-algos lands here, not in opentype: from the L3 programming layer of
  // 2026-01 on, expl3.lua requires lua-uni-stage-tables whenever LaTeX starts under
  // LuaTeX, so without it every LuaLaTeX run fails before \begin{document} --
  // found on CI, whose tree is TeX Live 2025's final packages.
  ['luatex',     (p) => p === 'web2c/dviluatex.fmt' || p === 'web2c/dvilualatex.fmt' || p.startsWith('tex/luatex/')],
  ['tex-plain',  (p) => (p.startsWith('tex/plain/') && !p.startsWith('tex/plain/pgf')) || (p.startsWith('tex/generic/') && !/^tex\/generic\/(pgf|tikz-cd)/.test(p)) || p === 'web2c/plain.fmt' || p === 'web2c/etex.fmt'],
  ['latex-core', (p) => /^tex\/latex\/(base|l3kernel|l3backend|latexconfig|tex-ini-files)\//.test(p) || p === 'web2c/latex.fmt'],
  ['latex-extra', (p) => p.startsWith('tex/latex/') || /^tex\/generic\/(pgf|tikz-cd)/.test(p) || p.startsWith('tex/plain/pgf')],
];
const EAGER = {
  core: ['web2c/texmf.cnf', 'metapost/base/plain.mp', 'metapost/base/mpost.mp', 'fonts/map/mpost.map'],
};

const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
if (fs.existsSync(path.join(TEXMF, 'tex/luatex/luaotfload')) && !fs.existsSync(path.join(TEXMF, 'luaotfload/luaotfload-names.lua.gz')))
  console.warn('  warning: no prebuilt luaotfload name database; run `npm run build:fontdb` (a fresh engine will scan every face)');
const all = walk(TEXMF).map((p) => path.relative(TEXMF, p).split(path.sep).join('/')).filter((p) => p !== 'ls-R').sort();

fs.rmSync(OUT, { recursive: true, force: true });
const summary = [];
const merged = new Map();
for (const [name, pred] of RECIPES) { if (!merged.has(name)) merged.set(name, []); merged.get(name).push(pred); }
for (const [name, preds] of merged) {
  const pred = (p) => preds.some((f) => f(p));
  const files = {};
  let total = 0;
  for (const rel of all) {
    if (SKIP(rel) || !pred(rel) || summary.some((s) => s.files.has(rel))) continue;
    const src = path.join(TEXMF, rel);
    const data = fs.readFileSync(src);
    const dst = path.join(OUT, name, 'files', rel);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
    files[rel] = { size: data.length, sha: crypto.createHash('sha256').update(data).digest('hex').slice(0, 16) };
    total += data.length;
  }
  const manifest = { name, version: VERSION, texlive: '2025', files, eager: EAGER[name] ?? [] };
  fs.mkdirSync(path.join(OUT, name), { recursive: true });
  fs.writeFileSync(path.join(OUT, name, 'manifest.json'), JSON.stringify(manifest));
  summary.push({ name, files: new Set(Object.keys(files)), total });
  console.log(`  ${name.padEnd(12)} ${Object.keys(files).length.toString().padStart(5)} files ${(total / 1024).toFixed(0).padStart(7)} KB`);
}
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify({ version: VERSION, bundles: summary.map((s) => ({ name: s.name, files: s.files.size, bytes: s.total })) }, null, 2));
