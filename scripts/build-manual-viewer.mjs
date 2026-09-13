// build-manual-viewer.mjs — assemble the in-browser PGF/TikZ manual viewer:
// site/manual.html plus every page of the manual as an SVG, into
// build/manual-viewer/ (index.html, manifest.json, pages/NNNN.svg). Serve or
// deploy that directory and every one of the ~1181 pages is navigable, each
// one typeset by tex.wasm + dvisvgm.wasm.
//
//   node scripts/build-manual-viewer.mjs [--limit N]
//
// The pages come from scripts/stress-pgfmanual.mjs, which typesets the whole
// manual through the public API and writes build/stress/pgfmanual/wasm/*.svg.
// Run that first if the render is missing. --limit N stages only the first N
// pages (for a quick check); omit it to stage all of them.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const SRC = path.join(REPO, 'build/stress/pgfmanual/wasm');
const DVI = path.join(REPO, 'build/stress/pgfmanual/native/pgfmanual-dvi.dvi');
const OUT = path.join(REPO, 'build/manual-viewer');
const limitArg = process.argv.indexOf('--limit');
const limit = limitArg >= 0 ? parseInt(process.argv[limitArg + 1], 10) : Infinity;

if (!fs.existsSync(SRC)) {
  console.error(`no rendered pages at ${path.relative(REPO, SRC)}\nRun: node scripts/stress-pgfmanual.mjs   (typesets the whole manual through the wasm engine)`);
  process.exit(2);
}
const svgs = fs.readdirSync(SRC).filter((f) => /^\d+\.svg$/.test(f)).sort();
if (!svgs.length) { console.error(`no NNNN.svg files in ${SRC}`); process.exit(2); }
const total = svgs.length;
const pages = svgs.map((f) => parseInt(f, 10)).filter((n) => n <= limit);

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'pages'), { recursive: true });
// dvisvgm's --exact-bbox reports a zero-size box for the title page (its gradient
// -filled cover contributes no ink to the exact bbox), so that page carries all
// its content but renders blank. Re-render any such page from the DVI with a
// paper-size box; the content is identical (same DVI, same dvisvgm 3.4.3).
let healed = 0;
for (const p of pages) {
  const name = `${String(p).padStart(4, '0')}.svg`;
  const dst = path.join(OUT, 'pages', name);
  const svg = fs.readFileSync(path.join(SRC, name), 'utf8');
  const zeroBox = /<svg[^>]*\bwidth='0(?:pt)?'/.test(svg) || /viewBox='[-\d.]+ [-\d.]+ 0 0'/.test(svg);
  if (zeroBox && svg.length > 20000 && fs.existsSync(DVI)) {
    try {
      execFileSync('dvisvgm', ['--no-mktexmf', '--no-fonts', '-b', 'papersize', `--page=${p}`, '-o', dst, DVI], { stdio: 'ignore' });
      healed++;
      continue;
    } catch { /* fall through to the copy below */ }
  }
  fs.copyFileSync(path.join(SRC, name), dst);
}
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify({ total, pages }));
fs.copyFileSync(path.join(REPO, 'site/manual.html'), path.join(OUT, 'index.html'));

const bytes = pages.reduce((s, p) => s + fs.statSync(path.join(OUT, 'pages', `${String(p).padStart(4, '0')}.svg`)).size, 0);
console.log(`staged ${pages.length}/${total} pages into ${path.relative(REPO, OUT)}/ (${(bytes / 1048576).toFixed(1)} MB)${healed ? `; re-rendered ${healed} zero-bbox page(s) at paper size` : ''}`);
console.log(`preview: (cd ${path.relative(REPO, OUT)} && python3 -m http.server 8090) then open http://localhost:8090/`);
