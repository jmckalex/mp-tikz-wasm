// smoke-wasm.mjs — instantiate dist/mplib.mjs under Node, mount the local TeX
// Live texmf tree, compile a figure, and print the SVG. A quick end-to-end
// check of the Emscripten build; the real API lives in src/ts.
import createMplib from '../dist/mplib.mjs';
import { execSync } from 'node:child_process';
import path from 'node:path';

const texmf = execSync('kpsewhich -var-value TEXMFDIST').toString().trim();
const texmfvar = execSync('kpsewhich -var-value TEXMFSYSVAR').toString().trim();
const t0 = performance.now();
const M = await createMplib({ print: (s) => console.log('[out]', s), printErr: (s) => console.log('[err]', s) });
const t1 = performance.now();
M.FS.mkdir('/texmf'); M.FS.mount(M.NODEFS, { root: texmf }, '/texmf');
M.FS.mkdir('/texmfvar'); M.FS.mount(M.NODEFS, { root: texmfvar }, '/texmfvar');
M.FS.mkdir('/work'); M.FS.chdir('/work');
M.mpwasmHooks = {
  findFile: (name, ftype, mode) => { console.log('[hook findFile]', name, ftype, mode); return null; },
  makeText: (text, mode) => { console.log('[hook makeText]', JSON.stringify(text), mode); return mode ? '' : 'image(draw unitsquare scaled 10;)'; },
};
const c = M.ccall('mpwasm_new', 'number', [], []);
const addPath = M.cwrap('mpwasm_add_path', null, ['number', 'number', 'string']);
addPath(c, 2, '/texmf/metapost/base');
addPath(c, 7, '/texmf/fonts/tfm/public/cm');
addPath(c, 9, '/texmf/fonts/type1/public/amsfonts/cm');
addPath(c, 8, '/texmfvar/fonts/map/dvips/updmap');
M.FS.writeFile('/work/job.mp', `prologues:=3;
beginfig(1);
  draw fullcircle scaled 100 withcolor (0.2,0.4,1);
  label.top("MetaPost", (0,50));
  label.bot(btex $x^2$ etex, (0,-50));
endfig;
end.
`);
const t2 = performance.now();
const h = M.ccall('mpwasm_run', 'number', ['number', 'string'], [c, 'year:=2026; month:=1; day:=1; time:=0; input job']);
const t3 = performance.now();
console.log('history', h, 'figures', M.ccall('mpwasm_figure_count', 'number', ['number'], [c]));
console.log('--- term_out ---\n' + M.ccall('mpwasm_term_out', 'string', ['number'], [c]));
const svg = M.ccall('mpwasm_figure_svg', 'string', ['number', 'number', 'number'], [c, 0, 3]);
const t4 = performance.now();
console.log('svg bytes', svg.length, 'glyph defs', (svg.match(/id="GLYPH/g) || []).length);
const json = M.ccall('mpwasm_figure_json', 'string', ['number', 'number'], [c, 0]);
console.log('json objects', JSON.parse(json).objects.length);
M.ccall('mpwasm_free', null, ['number'], [c]);
console.log(`timings: instantiate ${(t1 - t0).toFixed(1)} ms, run ${(t3 - t2).toFixed(1)} ms, svg ${(t4 - t3).toFixed(1)} ms`);
