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
// build-time only files (format building) never ship: unicode-data, *.ini, texfonts.map
const SKIP = (p) => p.startsWith('tex/generic/unicode-data/') || p === 'fonts/map/texfonts.map' || p.startsWith('tex/generic/config/');
const RECIPES = [
  ['core',       (p) => p.startsWith('web2c/texmf.cnf') || p.startsWith('metapost/') || p.startsWith('fonts/map/')],
  // the 35 standard PostScript fonts: psnfss metrics/virtual fonts (p??*), URW Type 1 (u??*), the 8r encoding
  ['ps-fonts',   (p) => /^fonts\/(tfm|vf)\/p[a-z]{2}[a-z0-9]*\.(tfm|vf)$/.test(p) || /^fonts\/type1\/u[a-z]{2}[a-z0-9]*\.pfb$/.test(p) || p === 'fonts/enc/8r.enc'],
  ['lm-fonts',   (p) => /^fonts\/(tfm|type1)\/([a-z0-9]+-)?lm/.test(p) || p.startsWith('fonts/enc/') || p.startsWith('tex/latex/lm/')],
  ['cm-tfm',     (p) => p.startsWith('fonts/tfm/') || p.startsWith('fonts/vf/')],
  ['cm-type1',   (p) => p.startsWith('fonts/type1/')],
  ['tikz-snapshot', (p) => p === 'web2c/tikz.fmt'],
  ['tex-plain',  (p) => (p.startsWith('tex/plain/') && !p.startsWith('tex/plain/pgf')) || (p.startsWith('tex/generic/') && !/^tex\/generic\/(pgf|tikz-cd)/.test(p)) || p === 'web2c/plain.fmt' || p === 'web2c/etex.fmt'],
  ['latex-core', (p) => /^tex\/latex\/(base|l3kernel|l3backend|latexconfig|tex-ini-files)\//.test(p) || p === 'web2c/latex.fmt'],
  ['latex-extra', (p) => p.startsWith('tex/latex/') || /^tex\/generic\/(pgf|tikz-cd)/.test(p) || p.startsWith('tex/plain/pgf')],
];
const EAGER = {
  core: ['web2c/texmf.cnf', 'metapost/base/plain.mp', 'metapost/base/mpost.mp', 'fonts/map/mpost.map'],
};

const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
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
