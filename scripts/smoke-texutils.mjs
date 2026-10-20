// smoke-texutils.mjs — prove that dist/bibtex.wasm and dist/makeindex.wasm
// (scripts/build-texutils-wasm.sh) produce the same output as TeX Live 2025's
// own bibtex and makeindex. Each case runs the wasm module the way
// src/ts/texengine.ts runTex does (a fresh module, noInitialRun, thisProgram,
// TEXMFCNF=/texmf/web2c, callMain, ExitStatus caught) with a scratch texmf tree
// mounted at /texmf and the inputs in /work, then runs the native program in a
// directory of its own on the same inputs, and compares the output files byte
// for byte (.bbl/.blg, .ind/.ilg), the exit status and the terminal output.
//
// The texmf tree, build/texutils-smoke/texmf, is assembled here: web2c/texmf.cnf
// is bundles/texmf.cnf, the .bst and .ist files come from TeX Live (kpsewhich)
// into the same places under bibtex/bst/ and makeindex/, and ls-R lists it all
// (texmf.cnf marks TEXMFDIST !!, ls-R only). Inputs and both sets of outputs
// are kept under build/texutils-smoke/runs/<case>/{native,wasm}.
//
// Two differences are not the programs': makeindex writes the path of a style
// file it found in the tree into the .ilg, natively /usr/local/texlive/2025/
// texmf-dist/... and here /texmf/...; and kpathsea's refusals under
// openout_any=p name argv[0], natively `bibtex` and here /bin/bibtex. Output
// that differs only by those passes, and is reported line by line, not hidden.
//
// Usage: node scripts/smoke-texutils.mjs [case-name-substring ...]
// Environment: NATIVE_BIBTEX, NATIVE_MAKEINDEX override the native programs and
// NATIVE_TEXMFCNF sets their TEXMFCNF; e.g. the binaries scripts/native-texlive.sh
// builds from the pinned source, which have no texmf tree of their own:
//   NATIVE_BIBTEX=vendor/native-build/texk/web2c/bibtex \
//   NATIVE_MAKEINDEX=vendor/native-build/texk/makeindexk/makeindex \
//   NATIVE_TEXMFCNF=/usr/local/texlive/2025/texmf-dist/web2c \
//   TEXMFROOT=/usr/local/texlive/2025 node scripts/smoke-texutils.mjs
// Exits 1 on any mismatch.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const SMOKE = path.join(REPO, 'build/texutils-smoke');
const TEXMF = path.join(SMOKE, 'texmf');
const RUNS = path.join(SMOKE, 'runs');
const EPOCH = '1735689600';   // as src/ts/texengine.ts
const NATIVE = { bibtex: process.env.NATIVE_BIBTEX ?? 'bibtex', makeindex: process.env.NATIVE_MAKEINDEX ?? 'makeindex' };
for (const k of ['bibtex', 'makeindex']) if (NATIVE[k].includes('/')) NATIVE[k] = path.resolve(NATIVE[k]);
// the native programs' environment: TeX Live's own configuration, nothing from
// the caller's shell that would change a search path
const NATIVE_ENV = { ...process.env, SOURCE_DATE_EPOCH: EPOCH, FORCE_SOURCE_DATE: '1' };
for (const v of ['TEXMFCNF', 'BIBINPUTS', 'BSTINPUTS', 'INDEXSTYLE', 'TEXMFDOTDIR', 'openout_any', 'openin_any']) delete NATIVE_ENV[v];
if (process.env.NATIVE_TEXMFCNF) NATIVE_ENV.TEXMFCNF = process.env.NATIVE_TEXMFCNF;

// ---- test inputs ------------------------------------------------------------
const BIB = String.raw`A test database: every common entry type, string macros and a preamble,
a crossref, accents in TeX notation and in raw UTF-8, and missing fields.
(BibTeX reads everything outside entries as a comment, but an at sign here
would start one.)
@string{jphil = "The Journal of Philosophy"}
@string{oup = "Oxford University Press"}
@preamble{ "\providecommand{\noopsort}[1]{}" }

@article{skyrms1990,
  author = {Brian Skyrms},
  title = {The Dynamics of Rational Deliberation},
  journal = jphil,
  volume = 87,
  number = 3,
  pages = {123--145},
  year = 1990,
}

@article{goedel1931,
  author = {Kurt G{\"o}del},
  title = {{\"U}ber formal unentscheidbare S{\"a}tze der {Principia Mathematica} und verwandter {Systeme I}},
  journal = {Monatshefte f{\"u}r Mathematik und Physik},
  volume = 38,
  pages = {173--198},
  year = 1931,
}

@book{lewis1969,
  author = {David K. Lewis},
  title = {Convention: A Philosophical Study},
  publisher = {Harvard University Press},
  address = {Cambridge, MA},
  year = 1969,
}

@book{maynardsmith1982,
  author = {John {Maynard Smith}},
  title = {Evolution and the Theory of Games},
  publisher = {Cambridge University Press},
  edition = {Second},
  year = 1982,
}

@incollection{alexander2007,
  author = {J. McKenzie Alexander},
  title = {The Structural Evolution of Morality},
  booktitle = {Handbook of Evolutionary Ethics},
  editor = {Jane Doe and John Roe},
  publisher = oup,
  address = {Oxford},
  pages = {1--20},
  year = 2007,
}

@inproceedings{nash2001,
  author = {John F. Nash and Harold W. Kuhn},
  title = {Equilibrium Points in $n$-Person Games},
  pages = {48--49},
  crossref = {procgt2001},
}

@inproceedings{turing2001,
  author = {Alan M. Turing},
  title = {Another Paper in the Same Volume},
  pages = {50--59},
  crossref = {procgt2001},
}

% a crossref'd entry must come after the entries that refer to it
@proceedings{procgt2001,
  title = {Proceedings of the Workshop on Game Theory},
  booktitle = {Proceedings of the Workshop on Game Theory},
  editor = {Ada Lovelace},
  publisher = {Springer},
  address = {Berlin},
  year = 2001,
}

@phdthesis{zollman2007,
  author = {Kevin J. S. Zollman},
  title = {Network Epistemology},
  school = {University of California, Irvine},
  year = 2007,
}

@mastersthesis{smith2010,
  author = {Anna Smith},
  title = {A Master's Thesis},
  school = {London School of Economics},
  type = {{MSc} dissertation},
  year = 2010,
}

@misc{wikipedia2024,
  author = {{Wikipedia contributors}},
  title = {Evolutionary game theory},
  howpublished = {\url{https://en.wikipedia.org/wiki/Evolutionary_game_theory}},
  url = {https://en.wikipedia.org/wiki/Evolutionary_game_theory},
  note = {Accessed 1 May 2024},
  year = 2024,
}

@techreport{axelrod1980,
  author = {Robert Axelrod},
  title = {Effective Choice in the Prisoner's Dilemma},
  institution = {University of Michigan},
  number = {TR-80-1},
  year = 1980,
}

@article{alund2015,
  author = {Øystein Ålund and Jürgen Müller and Jiří Šmíd},
  title = {Über die Sortierung von UTF-8-Namen},
  journal = {Nordisk Tidsskrift},
  volume = 12,
  pages = {1--9},
  year = 2015,
}

@book{angstrom1850,
  author = {Ångström, Émile and Ødegaard, Åse},
  title = {Spectra},
  publisher = {Uppsala Universitet},
  year = 1850,
}

@article{zander2015,
  author = {Zoë Zander},
  title = {Zebras},
  journal = {Zoology},
  year = 2015,
}

@article{arzt2015,
  author = {Ärzte Arzt and others},
  title = {Ärztliche Ästhetik},
  journal = {Medizin},
  year = 2015,
}

@article{noyear,
  author = {Nora Year},
  title = {An Article With Neither Journal Nor Year},
}

@unpublished{roe2020,
  author = {Rachel Roe},
  title = {A Draft},
  note = {Unpublished manuscript},
  year = 2020,
}

@inbook{knuth1984,
  author = {Donald E. Knuth},
  title = {The {\TeX}book},
  chapter = 3,
  publisher = {Addison-Wesley},
  year = 1984,
}

@manual{acme2019,
  title = {The ACME Manual},
  organization = {ACME Corporation},
  year = 2019,
}

@booklet{oklet1999,
  author = {Bo Oklet},
  title = {A Booklet},
  howpublished = {Self-published},
  year = 1999,
}
`;

const ERRBIB = String.raw`@article{skyrms1990,
  author = {Someone Else},
  title = {A Duplicate Key},
  journal = {Nowhere},
  year = 2000,
}

@book{broken,
  author = {Broken Entry}
  title = {Missing Comma},
  year = 2001,
}

@misc{fine2002, title = {Still Read}, year = 2002}

@inproceedings{badxref,
  author = {Xavier Ref},
  title = {A Crossref to Nothing},
  crossref = {nosuchproc},
}
`;

const SUBAUX = String.raw`\relax
\citation{alexander2007}
\citation{alund2015}
`;

const aux = (style, cites, data = 'refs') => String.raw`\relax
\providecommand\hyper@newdestlabel[2]{}
` + cites.map((k) => `\\citation{${k}}\n`).join('') + String.raw`\@input{sub.aux}
\bibstyle{` + style + String.raw`}
\bibdata{` + data + String.raw`}
\gdef \@abspage@last{3}
`;

const MAINCITES = ['skyrms1990', 'goedel1931', 'nash2001', 'lewis1969', 'zander2015', '*'];

const IDX = String.raw`\indexentry{alpha|hyperpage}{3}
\indexentry{alpha|hyperpage}{4}
\indexentry{alpha|hyperpage}{5}
\indexentry{alpha|hyperpage}{7}
\indexentry{alpha|hyperpage}{iv}
\indexentry{Alpha|hyperpage}{2}
\indexentry{beta|hyperpage}{1}
\indexentry{beta!gamma|hyperpage}{2}
\indexentry{beta!delta|hyperpage}{9}
\indexentry{beta!delta!epsilon|hyperpage}{9}
\indexentry{beta!delta!epsilon|hyperpage}{10}
\indexentry{zeta@\textit{zeta}|hyperpage}{11}
\indexentry{range|(hyperpage}{12}
\indexentry{range|)hyperpage}{15}
\indexentry{range|(}{20}
\indexentry{range|)}{22}
\indexentry{eta|see{alpha}}{1}
\indexentry{theta|seealso{beta}}{1}
\indexentry{quoted "! bang|hyperpage}{6}
\indexentry{quoted "@ at|hyperpage}{6}
\indexentry{quoted "" quote|hyperpage}{8}
\indexentry{quoted "| bar|hyperpage}{8}
\indexentry{1990s|hyperpage}{5}
\indexentry{$\alpha$@alpha symbol|hyperpage}{14}
\indexentry{*star|hyperpage}{14}
\indexentry{Über|hyperpage}{10}
\indexentry{Ångström|hyperpage}{10}
\indexentry{Zürich|hyperpage}{13}
\indexentry{\textbf{bold}|textbf}{3}
\indexentry{pages|hyperpage}{1}
\indexentry{pages|hyperpage}{2}
\indexentry{pages|hyperpage}{3}
\indexentry{pages|hyperpage}{8}
\indexentry{pages|hyperpage}{9}
\indexentry{a b|hyperpage}{2}
\indexentry{ab|hyperpage}{2}
\indexentry{a  b  c|hyperpage}{2}
\indexentry{appendix|hyperpage}{A-1}
\indexentry{unmatched|)}{30}
\indexentry{badline}
\indexentry{gamma=g>sub|usage}{4}
\indexentry{gamma=g|main}{5}
`;

// German word order (-g) needs a quote character other than '"', which -g
// takes for umlauts ("a, "s): a style sets it to '+'.
const GERMAN_IDX = String.raw`\indexentry{M"uller|hyperpage}{1}
\indexentry{Mueller|hyperpage}{2}
\indexentry{Muller|hyperpage}{3}
\indexentry{M"oller|hyperpage}{3}
\indexentry{"Apfel|hyperpage}{4}
\indexentry{Apfel|hyperpage}{5}
\indexentry{Azur|hyperpage}{5}
\indexentry{Stra"se|hyperpage}{6}
\indexentry{Strasse|hyperpage}{7}
\indexentry{Stra"se!Haupt-|hyperpage}{8}
\indexentry{quoted +! bang|hyperpage}{8}
\indexentry{Übel|hyperpage}{9}
`;
const GERMAN_IST = "quote '+'\n";

const CUSTOM_IST = String.raw`% a small custom style: letter headings, dotted leaders, f./ff. suffixes
preamble "\\begin{theindex}\n\\providecommand*\\hyperpage[1]{#1}\n"
postamble "\n\n\\end{theindex}\n"
headings_flag 1
heading_prefix "\\textbf{"
heading_suffix "}\\nopagebreak\n"
symhead_positive "Symbols"
numhead_positive "Numbers"
delim_0 "\\dotfill "
delim_1 "\\dotfill "
delim_2 "\\dotfill "
delim_r "--"
suffix_2p "\\,f."
suffix_3p "\\,ff."
line_max 60
indent_space "\t\t"
`;

// ---- cases ------------------------------------------------------------------
const bibCase = (name, style, files, args, job = 'doc') => ({
  name, prog: 'bibtex', args, files, outputs: [`${job}.bbl`, `${job}.blg`], styles: [`${style}.bst`],
});
const CASES = [
  ...['plainnat', 'apalike', 'plain', 'unsrtnat'].map((s) => bibCase(`bibtex-${s}`, s,
    { 'refs.bib': BIB, 'sub.aux': SUBAUX, 'doc.aux': aux(s, MAINCITES) }, ['doc'])),
  bibCase('bibtex-crossref-min1', 'plainnat',
    { 'refs.bib': BIB, 'sub.aux': '\\relax \n', 'doc.aux': aux('plainnat', ['nash2001']) }, ['-min-crossrefs=1', 'doc']),
  bibCase('bibtex-errors', 'plain',
    { 'refs.bib': BIB, 'errs.bib': ERRBIB, 'sub.aux': SUBAUX, 'doc.aux': aux('plain', ['skyrms1990', 'nokey', 'broken', 'fine2002', 'turing2001', 'nash2001', 'badxref'], 'refs,errs') }, ['doc.aux']),
  bibCase('bibtex-missing-bst', 'plain',
    { 'refs.bib': BIB, 'sub.aux': SUBAUX, 'doc.aux': aux('nosuchstyle', ['skyrms1990']) }, ['doc']),
  bibCase('bibtex-missing-bib', 'plain',
    { 'sub.aux': SUBAUX, 'doc.aux': aux('plain', ['skyrms1990'], 'nosuchdb') }, ['doc']),
  // openout_any = p (bundles/texmf.cnf, as TeX Live): no writing to dot files
  { name: 'bibtex-openout-paranoid', prog: 'bibtex', args: ['.hidden'], files: { 'refs.bib': BIB, 'sub.aux': SUBAUX, '.hidden.aux': aux('plain', ['skyrms1990']) }, outputs: ['.hidden.bbl', '.hidden.blg'] },
  { name: 'makeindex-openout-paranoid', prog: 'makeindex', args: ['-o', '.hidden.ind', 'doc.idx'], files: { 'doc.idx': IDX }, outputs: ['.hidden.ind', 'doc.ilg'] },
  { name: 'makeindex-default', prog: 'makeindex', args: ['doc'], files: { 'doc.idx': IDX }, outputs: ['doc.ind', 'doc.ilg'] },
  { name: 'makeindex-custom-ist', prog: 'makeindex', args: ['-s', 'custom.ist', 'doc.idx'], files: { 'doc.idx': IDX, 'custom.ist': CUSTOM_IST }, outputs: ['doc.ind', 'doc.ilg'] },
  { name: 'makeindex-gind', prog: 'makeindex', args: ['-s', 'gind.ist', 'doc.idx'], files: { 'doc.idx': IDX }, outputs: ['doc.ind', 'doc.ilg'], styles: ['gind.ist'] },
  { name: 'makeindex-options', prog: 'makeindex', args: ['-l', '-r', '-c', '-o', 'other.ind', '-t', 'other.ilg', 'doc.idx'], files: { 'doc.idx': IDX }, outputs: ['other.ind', 'other.ilg'] },
  { name: 'makeindex-german', prog: 'makeindex', args: ['-g', '-s', 'german.ist', 'doc.idx'], files: { 'doc.idx': GERMAN_IDX, 'german.ist': GERMAN_IST }, outputs: ['doc.ind', 'doc.ilg'] },
  { name: 'makeindex-german-bad-quote', prog: 'makeindex', args: ['-g', 'doc.idx'], files: { 'doc.idx': IDX }, outputs: ['doc.ind', 'doc.ilg'] },
  { name: 'makeindex-missing-ist', prog: 'makeindex', args: ['-s', 'nosuch.ist', 'doc.idx'], files: { 'doc.idx': IDX }, outputs: ['doc.ind', 'doc.ilg'] },
];

// ---- the texmf tree -------------------------------------------------------
// kpsewhich gives TeX Live's file; its path below the tree's root (bibtex/bst/...,
// makeindex/...) is where it goes here, and the native/wasm path pair is kept.
const STYLE_PATHS = new Map();   // name -> { native, wasm }
function assembleTexmf(names) {
  fs.rmSync(TEXMF, { recursive: true, force: true });
  fs.mkdirSync(path.join(TEXMF, 'web2c'), { recursive: true });
  fs.copyFileSync(path.join(REPO, 'bundles/texmf.cnf'), path.join(TEXMF, 'web2c/texmf.cnf'));
  for (const name of names) {
    const native = execFileSync('kpsewhich', [name], { encoding: 'utf8' }).trim();
    const m = native.match(/\/((?:bibtex\/bst|makeindex)\/.+)$/);
    if (!native || !m) throw new Error(`kpsewhich ${name}: ${native || 'not found'}`);
    fs.mkdirSync(path.dirname(path.join(TEXMF, m[1])), { recursive: true });
    fs.copyFileSync(native, path.join(TEXMF, m[1]));
    STYLE_PATHS.set(name, { native, wasm: `/texmf/${m[1]}` });
  }
  // ls-R in the format of scripts/build-texmf.sh
  const dirs = [];
  const walk = (rel) => { dirs.push(rel); for (const e of fs.readdirSync(path.join(TEXMF, rel), { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) if (e.isDirectory()) walk(rel + '/' + e.name); };
  walk('.');
  let lsR = '% ls-R -- filename database for kpathsea; do not change this line.\n';
  for (const d of dirs.sort()) lsR += `\n${d}:\n` + fs.readdirSync(path.join(TEXMF, d)).sort().map((n) => n + '\n').join('');
  fs.writeFileSync(path.join(TEXMF, 'ls-R'), lsR);
}

// ---- runners ------------------------------------------------------------------
const factories = {};
async function runWasm(c) {
  factories[c.prog] ??= (await import(path.join(REPO, `dist/${c.prog}.mjs`))).default;
  const stdout = [], stderr = [];
  let exitCode = -1;
  const t0 = performance.now();
  const M = await factories[c.prog]({
    print: (s) => stdout.push(s), printErr: (s) => stderr.push(s),
    noInitialRun: true, thisProgram: `/bin/${c.prog}`,
    preRun: [(m) => { m.ENV.TEXMFCNF = '/texmf/web2c'; m.ENV.SOURCE_DATE_EPOCH = EPOCH; m.ENV.FORCE_SOURCE_DATE = '1'; m.ENV.HOME = '/home'; }],
    onExit: (code) => { exitCode = code; },
  });
  const t1 = performance.now();
  try { M.FS.mkdir('/bin'); } catch { /* exists */ }
  M.FS.writeFile(`/bin/${c.prog}`, '');
  M.FS.mkdir('/texmf'); M.FS.mount(M.NODEFS, { root: TEXMF }, '/texmf');
  M.FS.mkdir('/work');
  for (const [n, s] of Object.entries(c.files)) M.FS.writeFile(`/work/${n}`, Buffer.from(s, 'utf8'));
  M.FS.chdir('/work');
  const saved = process.exitCode;
  const t2 = performance.now();
  try { const r = M.callMain([...c.args]); if (typeof r === 'number') exitCode = r; }   // callMain unshifts argv[0] into its argument
  catch (e) { if (e && e.name === 'ExitStatus') exitCode = e.status; else throw e; }
  finally { process.exitCode = saved; }
  const t3 = performance.now();
  const files = {};
  for (const n of c.outputs) { try { files[n] = Buffer.from(M.FS.readFile(`/work/${n}`)); } catch { files[n] = null; } }
  return { exitCode, stdout: stdout.join('\n'), stderr: stderr.join('\n'), files, ms: t3 - t0, instMs: t1 - t0, mainMs: t3 - t2 };
}

function runNative(c, dir) {
  fs.mkdirSync(dir, { recursive: true });
  for (const [n, s] of Object.entries(c.files)) fs.writeFileSync(path.join(dir, n), s);
  const t0 = performance.now();
  const r = spawnSync(NATIVE[c.prog], c.args, { cwd: dir, env: NATIVE_ENV });
  const ms = performance.now() - t0;
  if (r.error) throw r.error;
  const files = {};
  for (const n of c.outputs) { const p = path.join(dir, n); files[n] = fs.existsSync(p) ? fs.readFileSync(p) : null; }
  // as Emscripten's print/printErr deliver it: lines, without the last newline
  const term = (b) => b.toString('utf8').replace(/\n$/, '');
  return { exitCode: r.status, stdout: term(r.stdout), stderr: term(r.stderr), files, ms };
}

// ---- comparison ---------------------------------------------------------------
function lineDiff(a, b) {   // [lineNo, a, b] for each differing line
  const al = a.split('\n'), bl = b.split('\n'), d = [];
  for (let i = 0; i < Math.max(al.length, bl.length); i++) if (al[i] !== bl[i]) d.push([i + 1, al[i], bl[i]]);
  return d;
}
// compare WHAT: native vs wasm (Buffers or strings). Returns { ok, note }. KNOWN
// is a list of { from: RegExp, to, why } for differences that are not the
// program's: if the native output, rewritten by them, equals the wasm output,
// the file passes, and the note lists every line that differed and why.
function compare(what, nat, was, known) {
  if (nat === null && was === null) return { ok: true, note: `${what}: absent in both` };
  if (nat === null || was === null) return { ok: false, note: `${what}: ${nat === null ? 'only wasm' : 'only native'} wrote it` };
  const nb = Buffer.isBuffer(nat) ? nat : Buffer.from(nat, 'utf8'), wb = Buffer.isBuffer(was) ? was : Buffer.from(was, 'utf8');
  if (nb.equals(wb)) return { ok: true, note: `${what}: identical (${nb.length} bytes)` };
  const ns = nb.toString('latin1'), ws = wb.toString('latin1');
  let mapped = ns;
  const why = new Set();
  for (const k of known) { const m = mapped.replace(k.from, k.to); if (m !== mapped) why.add(k.why); mapped = m; }
  if (why.size && mapped === ws) {
    const d = lineDiff(ns, ws);
    return { ok: true, known: [...why], note: `${what}: identical except ${[...why].join(' and ')}, on ${d.length} line(s):\n` +
      d.map(([n, a, b]) => `        line ${n}\n          native: ${a}\n          wasm:   ${b}`).join('\n') };
  }
  const d = lineDiff(ns, ws);
  return { ok: false, note: `${what}: DIFFERENT (${nb.length} vs ${wb.length} bytes), ${d.length} line(s):\n` +
    d.slice(0, 8).map(([n, a, b]) => `        line ${n}\n          native: ${a}\n          wasm:   ${b}`).join('\n') };
}

// ---- main -----------------------------------------------------------------------
const filter = process.argv.slice(2);
const cases = CASES.filter((c) => !filter.length || filter.some((f) => c.name.includes(f)));
for (const p of ['bibtex', 'makeindex']) if (!fs.existsSync(path.join(REPO, `dist/${p}.wasm`))) { console.error(`error: dist/${p}.wasm missing; run scripts/build-texutils-wasm.sh`); process.exit(1); }
assembleTexmf([...new Set(CASES.flatMap((c) => c.styles ?? []))].filter((n) => !n.startsWith('nosuch')));
console.log(`texmf: ${TEXMF}`);
console.log(`native: ${NATIVE.bibtex}: ${execFileSync(NATIVE.bibtex, ['--version'], { encoding: 'utf8', env: NATIVE_ENV }).split('\n')[0]}; ${NATIVE.makeindex}: ${spawnSync(NATIVE.makeindex, [], { input: '', env: NATIVE_ENV }).stderr.toString().split('\n')[0]}`);
let failures = 0;
const knownNotes = [];
for (const c of cases) {
  const dir = path.join(RUNS, c.name);
  fs.rmSync(dir, { recursive: true, force: true });
  const nat = runNative(c, path.join(dir, 'native'));
  const was = await runWasm(c);
  fs.mkdirSync(path.join(dir, 'wasm'), { recursive: true });
  for (const [n, b] of Object.entries(was.files)) if (b) fs.writeFileSync(path.join(dir, 'wasm', n), b);
  fs.writeFileSync(path.join(dir, 'wasm', 'terminal.txt'), `exit ${was.exitCode}\n--- stdout\n${was.stdout}\n--- stderr\n${was.stderr}\n`);
  fs.writeFileSync(path.join(dir, 'native', 'terminal.txt'), `exit ${nat.exitCode}\n--- stdout\n${nat.stdout}\n--- stderr\n${nat.stderr}\n`);
  const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const known = [
    ...(c.styles ?? []).map((s) => STYLE_PATHS.get(s)).filter(Boolean)
      .map(({ native, wasm }) => ({ from: new RegExp(esc(native), 'g'), to: wasm, why: "the style file's path (TeX Live's tree natively, /texmf in wasm)" })),
    { from: new RegExp(`^${esc(NATIVE[c.prog])}: `, 'gm'), to: `/bin/${c.prog}: `, why: `argv[0] in kpathsea's messages (native runs as \`${NATIVE[c.prog]}\`, the module as /bin/${c.prog}, its thisProgram as in texengine.ts)` },
  ];
  const results = [
    { ok: nat.exitCode === was.exitCode, note: `exit status: native ${nat.exitCode}, wasm ${was.exitCode}` },
    ...c.outputs.map((n) => compare(n, nat.files[n], was.files[n], known)),
    compare('stdout', nat.stdout, was.stdout, known),
    compare('stderr', nat.stderr, was.stderr, known),
  ];
  const ok = results.every((r) => r.ok);
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${c.name}  (${c.prog} ${c.args.join(' ')})  wasm ${was.ms.toFixed(1)} ms [instantiate ${was.instMs.toFixed(1)}, main ${was.mainMs.toFixed(1)}], native ${nat.ms.toFixed(1)} ms`);
  for (const r of results) { console.log(`      ${r.note}`); if (r.known) knownNotes.push(`${c.name}: ${r.note.split(':')[0]}: ${r.known.join('; ')}`); }
}
if (knownNotes.length) console.log(`\nidentical except for differences that are not the program's (listed line by line above):\n  ${knownNotes.join('\n  ')}`);
console.log(`\n${cases.length - failures}/${cases.length} cases identical${failures ? `; ${failures} FAILED` : ''}`);
process.exit(failures ? 1 : 0);
