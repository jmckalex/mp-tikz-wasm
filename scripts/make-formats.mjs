// make-formats.mjs — build plain.fmt, etex.fmt and latex.fmt with tex.wasm
// itself (docs/03 §4.5), into build/texmf/web2c. Usage: node scripts/make-formats.mjs [texmfDir]
import createTex from '../dist/tex.mjs';
import fs from 'node:fs';
import path from 'node:path';

const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const TEXMF = path.resolve(process.argv[2] ?? path.join(REPO, 'build/texmf'));
const WORK = fs.mkdtempSync(path.join(REPO, 'build', 'fmt-'));

async function runTex(args) {
  const out = [];
  let exitCode = -1;
  const M = await createTex({
    print: (s) => out.push(s), printErr: (s) => out.push(s),
    noInitialRun: true, thisProgram: '/bin/pdftex',
    preRun: [(M) => { M.ENV.TEXMFCNF = '/texmf/web2c'; M.ENV.SOURCE_DATE_EPOCH = '1735689600'; M.ENV.FORCE_SOURCE_DATE = '1'; }],
    onExit: (code) => { exitCode = code; },
  });
  try { M.FS.mkdir('/bin'); } catch {}
  M.FS.writeFile('/bin/pdftex', '');
  M.FS.mkdir('/texmf'); M.FS.mount(M.NODEFS, { root: TEXMF }, '/texmf');
  M.FS.mkdir('/work'); M.FS.mount(M.NODEFS, { root: WORK }, '/work');
  M.FS.chdir('/work');
  try { const r = M.callMain(args); if (typeof r === 'number') exitCode = r; }
  catch (e) { if (e && e.name === 'ExitStatus') exitCode = e.status; else throw e; }
  return { exitCode, out: out.join('\n') };
}

const FORMATS = [
  { name: 'plain', args: ['-ini', '-jobname=plain', '-progname=tex', '-interaction=nonstopmode', 'tex.ini'] },
  { name: 'etex',  args: ['-ini', '-etex', '-jobname=etex', '-progname=etex', '-interaction=nonstopmode', 'etex.ini'] },
  { name: 'latex', args: ['-ini', '-etex', '-jobname=latex', '-progname=latex', '-interaction=nonstopmode', 'latex.ini'] },
  // the pre-warmed TikZ snapshot: latex.fmt plus pgf, its libraries and pgfplots (needs latex.fmt first)
  { name: 'tikz', args: ['-ini', '-etex', '-jobname=tikz', '-progname=latex', '-interaction=nonstopmode', 'tikz.ini'] },
];
let failed = 0;
for (const f of FORMATS) {
  const t0 = performance.now();
  if (f.after) fs.copyFileSync(path.join(TEXMF, 'web2c', `${f.after}.fmt`), path.join(WORK, `${f.after}.fmt`));   // &latex resolves via TEXFORMATS (. first)
  const r = await runTex(f.args);
  const fmt = path.join(WORK, `${f.name}.fmt`);
  const ok = r.exitCode === 0 && fs.existsSync(fmt);
  if (ok) {
    fs.copyFileSync(fmt, path.join(TEXMF, 'web2c', `${f.name}.fmt`));
    console.log(`  ${f.name}.fmt: ${fs.statSync(fmt).size} bytes (${(performance.now() - t0).toFixed(0)} ms)`);
  } else {
    failed++;
    console.log(`  ${f.name}.fmt FAILED (exit ${r.exitCode})`);
    console.log(r.out.split('\n').filter((l) => l.startsWith('!')).slice(0, 10).join('\n'));
  }
}
fs.rmSync(WORK, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
