// golden-pdf.mjs — golden tests for PDF output (mp.latex(..., { output: 'pdf' })):
// every test/golden/pdf/*.tex is typeset by tex.wasm in PDF mode and by the oracle
// (TeX Live's latex or etex with -output-format=pdf), and the PDFs are compared byte
// for byte after masking the pdfTeX version (the engines here are built from TeX Live
// 2025's March source, 1.40.27; an updated TeX Live 2025 says 1.40.28). The same
// fixed date (SOURCE_DATE_EPOCH, FORCE_SOURCE_DATE) makes both sides reproducible.
// *.png / *.jpg next to the cases are handed to both as files.
//
//   node scripts/golden-pdf.mjs            compare against the oracle (and update expectations)
//   node scripts/golden-pdf.mjs --update   only regenerate test/golden/pdf-expected
//   node scripts/golden-pdf.mjs --check    compare against the committed expectations
//
// pdfTeX only: LuaTeX's PDF output is covered by test/e2e (no native LuaTeX of the
// same version to compare with here).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { MetaPost } from '../dist/index.js';

const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const CASES = path.join(REPO, 'test/golden/pdf');
const EXPECTED = path.join(REPO, 'test/golden/pdf-expected');
const OUT = path.join(REPO, 'test/golden/_out/pdf');
const argv = process.argv.slice(2);
const mode = argv.find((a) => a.startsWith('--')) ?? '';
const only = argv.filter((a) => !a.startsWith('--'));

// the version appears as /Producer (pdfTeX-1.40.NN) and in /PTEX.Fullbanner; same length either way
const mask = (buf) => Buffer.from(buf.toString('latin1').replace(/(pdfTeX-1\.40\.)\d\d/g, '$1xx').replace(/(-2\.6-1\.40\.)\d\d/g, '$1xx'), 'latin1');
const images = fs.readdirSync(CASES).filter((f) => /\.(png|jpe?g)$/i.test(f));
const plainCase = (src) => /\\bye\b/.test(src);
const DRIVER = '\\def\\pgfsysdriver{pgfsys-pdftex.def}';   // what the library prepends for pdfTeX PDF output

function oracle(file) {
  fs.mkdirSync(OUT, { recursive: true });
  const dir = fs.mkdtempSync(path.join(OUT, 'oracle-'));
  const src = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(path.join(dir, 'doc.tex'), DRIVER + src);
  for (const i of images) fs.copyFileSync(path.join(CASES, i), path.join(dir, i));
  const env = { ...process.env, SOURCE_DATE_EPOCH: '1735689600', FORCE_SOURCE_DATE: '1' };
  try { execFileSync(plainCase(src) ? 'etex' : 'latex', ['-interaction=nonstopmode', '-output-format=pdf', 'doc.tex'], { cwd: dir, stdio: 'ignore', env }); } catch { /* errors are part of some cases */ }
  const f = path.join(dir, 'doc.pdf');
  const pdf = fs.existsSync(f) ? fs.readFileSync(f) : null;
  fs.rmSync(dir, { recursive: true, force: true });
  return pdf;
}

const mp = mode === '--update' ? null : await MetaPost.create({ logLevel: 'silent' });
const files = Object.fromEntries(images.map((i) => [i, fs.readFileSync(path.join(CASES, i))]));
fs.mkdirSync(EXPECTED, { recursive: true });
let passed = 0, failed = 0;
for (const f of fs.readdirSync(CASES).filter((f) => f.endsWith('.tex')).sort()) {
  const name = f.replace(/\.tex$/, '');
  if (only.length && !only.some((o) => name.includes(o))) continue;
  const src = fs.readFileSync(path.join(CASES, f), 'utf8');
  let expected;
  if (mode === '--check') expected = fs.readFileSync(path.join(EXPECTED, name + '.pdf'));
  else {
    expected = oracle(path.join(CASES, f));
    if (!expected) { console.log(`FAIL ${name}: the oracle wrote no PDF`); failed++; continue; }
    fs.writeFileSync(path.join(EXPECTED, name + '.pdf'), expected);
    if (mode === '--update') { console.log(`wrote ${name}.pdf (${expected.length} bytes)`); continue; }
  }
  const t0 = performance.now();
  const r = await mp.latex(src, { engine: plainCase(src) ? 'plain' : 'latex', output: 'pdf', files });
  const ms = Math.round(performance.now() - t0);
  const got = r.pdf ? Buffer.from(r.pdf) : null;
  if (got && Buffer.compare(mask(got), mask(expected)) === 0) { console.log(`ok   ${name} (${got.length} bytes, ${r.status}, ${ms} ms)`); passed++; }
  else {
    failed++;
    fs.mkdirSync(OUT, { recursive: true });
    if (got) fs.writeFileSync(path.join(OUT, name + '.wasm.pdf'), got);
    fs.writeFileSync(path.join(OUT, name + '.expected.pdf'), expected);
    console.log(`FAIL ${name}: ${got ? `${got.length} bytes vs ${expected.length}, first difference at byte ${[...mask(got)].findIndex((b, i) => b !== mask(expected)[i])}` : `no PDF (${r.status}: ${r.diagnostics.map((d) => d.message).join(' | ').slice(0, 200)})`}; see ${path.relative(REPO, OUT)}`);
  }
}
mp?.dispose();
if (mode !== '--update') console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
