// smoke-tex.mjs — build plain.fmt and latex.fmt with tex.wasm itself, then
// typeset a document to DVI. Node only; mounts build/texmf via NODEFS.
import createTex from '../dist/tex.mjs';
import fs from 'node:fs';
import path from 'node:path';

const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const TEXMF = path.join(REPO, 'build/texmf');
const WORK = path.join(REPO, 'build/tex/work');
fs.mkdirSync(WORK, { recursive: true });

async function runTex(args, { quiet = true } = {}) {
  const out = [];
  const t0 = performance.now();
  let exitCode = -1;
  const M = await createTex({
    print: (s) => out.push(s), printErr: (s) => out.push(s),
    noInitialRun: true, thisProgram: '/bin/pdftex',
    preRun: [(M) => { M.ENV.TEXMFCNF = '/texmf/web2c'; M.ENV.SOURCE_DATE_EPOCH = '1735689600'; M.ENV.FORCE_SOURCE_DATE = '1'; }],
    onExit: (code) => { exitCode = code; },
  });
  try { M.FS.mkdir('/bin'); } catch {}
  M.FS.writeFile('/bin/pdftex', '');   // kpathsea wants dirname(argv[0]) to exist
  M.FS.mkdir('/texmf'); M.FS.mount(M.NODEFS, { root: TEXMF }, '/texmf');
  M.FS.mkdir('/work'); M.FS.mount(M.NODEFS, { root: WORK }, '/work');
  M.FS.chdir('/work');
  try { const r = M.callMain(args); if (typeof r === 'number') exitCode = r; }
  catch (e) { if (e && e.name === 'ExitStatus') exitCode = e.status; else throw e; }
  const ms = performance.now() - t0;
  if (!quiet || exitCode !== 0) console.log(out.join('\n'));
  console.log(`tex ${args.join(' ')} -> exit ${exitCode} in ${ms.toFixed(0)} ms`);
  return { exitCode, out: out.join('\n') };
}

console.log('== building plain.fmt');
await runTex(['-ini', '-jobname=plain', '-progname=tex', '-interaction=nonstopmode', 'tex.ini']);
console.log('== building latex.fmt (with -etex)');
await runTex(['-ini', '-etex', '-jobname=latex', '-progname=latex', '-interaction=nonstopmode', 'latex.ini']);
for (const f of ['plain.fmt', 'latex.fmt']) {
  const p = path.join(WORK, f);
  if (fs.existsSync(p)) { console.log(`   ${f}: ${fs.statSync(p).size} bytes`); fs.copyFileSync(p, path.join(TEXMF, 'web2c', f)); }
  else console.log(`   ${f}: MISSING`);
}
console.log('== typesetting the reference mpx sample with latex.fmt');
fs.copyFileSync(path.join(REPO, 'test/contract/_work/latex-math.tex'), path.join(WORK, 'latex-math.tex'));
const r = await runTex(['-fmt=latex', '-progname=latex', '-interaction=nonstopmode', 'latex-math.tex']);
const dvi = path.join(WORK, 'latex-math.dvi');
console.log(`   dvi: ${fs.existsSync(dvi) ? fs.statSync(dvi).size + ' bytes' : 'MISSING'}`);
const oracle = path.join(REPO, 'test/contract/_work/latex-math.dvi');
if (fs.existsSync(dvi) && fs.existsSync(oracle)) {
  const a = fs.readFileSync(dvi), b = fs.readFileSync(oracle);
  console.log(`   oracle dvi: ${b.length} bytes; identical: ${a.equals(b)}`);
}
