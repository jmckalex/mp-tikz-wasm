#!/usr/bin/env node
/**
 * mpost-wasm — a drop-in for `mpost` for the common flag set (docs/08 §5).
 *
 *   mpost-wasm [OPTION]... [MPNAME[.mp]] [COMMANDS]
 *   mpost-wasm --dvitomp DVINAME[.dvi] [MPXNAME[.mpx]]
 *   mpost-wasm --prerender [--figures=DIR] [--force] [--dry-run] PAGE.html...
 */
import { MetaPost, LOG_LEVELS } from './index.js';
import { prerender } from './prerender.js';
import type { OutputFormat, NumberSystem, TexEngine, LogLevel, LogRecord } from './types.js';

const HELP = `Usage: mpost-wasm [OPTION]... [MPNAME[.mp]] [COMMANDS]
       mpost-wasm --latex [OPTION]... DOC.tex
       mpost-wasm --prerender [--figures=DIR] [--force] [--dry-run] PAGE.html...
  Run MetaPost (WebAssembly build) on MPNAME, writing output files to the
  current directory like mpost does; or, with --latex, typeset a complete
  LaTeX/TikZ (or plain TeX, with --plain) document with tex.wasm and convert
  every page to DOC-<page>.svg with dvisvgm.wasm.

  -interaction=MODE     batchmode|nonstopmode|scrollmode (default nonstopmode)
  -numbersystem=SYSTEM  scaled|double|decimal (binary/interval are not built)
  -jobname=STRING       output name (default: basename of MPNAME)
  -tex=PROGRAM          tex|etex|latex|auto (default auto)
  -s INTERNAL=VALUE     set an internal, e.g. -s prologues=3 -s outputformat="svg"
  -halt-on-error        stop at the first error
  -file-line-error      (accepted; diagnostics always carry file:line)
  -recorder             write a .fls file listing every file opened
  -T, -troff            accepted; troff mode is unsupported and warns
  --format=eps|svg|json output format (default eps; or set outputformat)
  --texmf=DIR           use a texmf directory (flattened layout) instead of bundles
  --bundles=DIR         directory containing the bundles (default: next to this package)
  --stdout              print the first figure to stdout instead of writing files
  --latex               DOC.tex -> DOC-1.svg, DOC-2.svg ... (LaTeX); --plain for plain TeX
  --engine=NAME         latex | lualatex | luatex | plain | tex | auto (default auto: lualatex when
                        the document uses graphdrawing or \directlua)
  --fonts=paths|woff2   how text is emitted in --latex mode (default paths)
  --prerender           typeset the <script type="text/tikz|metapost">, <tikz-diagram> and
                        <metapost-diagram> elements of each PAGE and save each as figure-HASH.svg in
                        the directory the page's auto.js loader names in data-figures (default
                        figures/, next to the page); the tags then load the files instead of running
                        the engines. Files that exist are kept: the name is the content.
  --figures=DIR         save every page's figures in DIR instead
  --force               re-render figures whose file exists
  --dry-run             list what would be rendered, render nothing
  -v, -vv, -vvv         more on stderr: timings; the engines' output as it runs; every file
  -q, --quiet           nothing on stderr (not even TeX errors)
  --log-level=LEVEL     silent|error|warn|info|debug|trace (default warn)
  -help, -version
`;

function parseArgs(argv: string[]) {
  const o = {
    interaction: 'nonstop' as 'batch' | 'nonstop' | 'scroll',
    numbersystem: 'scaled' as NumberSystem,
    jobname: '' , tex: 'auto' as TexEngine, internals: {} as Record<string, string | number>,
    halt: false, recorder: false, troff: false, format: '' as '' | OutputFormat, texmf: '', bundles: '',
    stdout: false, file: '', commands: '', help: false, version: false, dvitomp: false,
    latex: false, plain: false, engine: 'auto' as 'auto' | 'latex' | 'lualatex' | 'luatex' | 'plain' | 'tex', fonts: 'paths' as 'paths' | 'woff2',
    verbose: 0, quiet: false, logLevel: '' as '' | LogLevel,
    prerender: false, figures: '', force: false, dryRun: false, args: [] as string[],
  };
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    const kv = (a.startsWith('--') ? a.slice(2) : a.slice(1));
    const [k, v] = kv.includes('=') ? [kv.slice(0, kv.indexOf('=')), kv.slice(kv.indexOf('=') + 1)] : [kv, undefined];
    if (!a.startsWith('-') || a === '-') { rest.push(a); continue; }
    switch (k) {
      case 'interaction': o.interaction = (v ?? next()).replace('mode', '') as any; break;
      case 'numbersystem': o.numbersystem = (v ?? next()) as NumberSystem; break;
      case 'jobname': o.jobname = v ?? next(); break;
      case 'tex': { const t = v ?? next(); o.tex = t === 'tex' ? 'plain' : (t as TexEngine); break; }
      case 's': { const s = v ?? next(); const eq = s.indexOf('='); const name = s.slice(0, eq); let val: string | number = s.slice(eq + 1);
        if (/^".*"$/.test(val)) val = val.slice(1, -1); else if (!isNaN(Number(val))) val = Number(val); o.internals[name] = val; break; }
      case 'halt-on-error': o.halt = true; break;
      case 'file-line-error': case 'file-line-error-style': break;
      case 'no-file-line-error': break;
      case 'recorder': o.recorder = true; break;
      case 'T': case 'troff': o.troff = true; break;
      case 'format': o.format = (v ?? next()) as OutputFormat; break;
      case 'texmf': o.texmf = v ?? next(); break;
      case 'bundles': o.bundles = v ?? next(); break;
      case 'stdout': o.stdout = true; break;
      case 'help': o.help = true; break;
      case 'version': o.version = true; break;
      case 'dvitomp': o.dvitomp = true; break;
      case 'latex': o.latex = true; break;
      case 'plain': o.plain = true; o.latex = true; o.engine = 'plain'; break;
      case 'engine': o.engine = (v ?? next()) as typeof o.engine; o.latex = true; break;
      case 'fonts': o.fonts = (v ?? next()) as 'paths' | 'woff2'; break;
      case 'prerender': o.prerender = true; break;
      case 'figures': o.figures = v ?? next(); break;
      case 'force': o.force = true; break;
      case 'dry-run': o.dryRun = true; break;
      case 'v': case 'verbose': o.verbose++; break;
      case 'vv': o.verbose += 2; break;
      case 'vvv': o.verbose += 3; break;
      case 'q': case 'quiet': o.quiet = true; break;
      case 'log-level': o.logLevel = (v ?? next()) as LogLevel; break;
      case 'ini': case 'mem': case 'progname': case 'kpathsea-debug': case 'restricted': case 'debug': case 'translate-file': case '8bit':
        console.error(`mpost-wasm: warning: option -${k} is accepted and ignored`); if (v === undefined && ['mem', 'progname', 'kpathsea-debug', 'translate-file'].includes(k)) next(); break;
      default: console.error(`mpost-wasm: unknown option ${a}`); process.exit(1);
    }
  }
  o.args = [...rest];
  if (rest.length) { const first = rest[0]; if (first.startsWith('&')) { rest.shift(); } }
  if (rest.length) { o.file = rest.shift()!; }
  o.commands = rest.join(' ');
  return o;
}

async function main() {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const o = parseArgs(process.argv.slice(2));
  if (o.help) { process.stdout.write(HELP); return; }
  const logLevel: LogLevel = o.logLevel || (o.quiet ? 'silent' : o.verbose >= 3 ? 'trace' : o.verbose === 2 ? 'debug' : o.verbose === 1 ? 'info' : 'warn');
  if (!LOG_LEVELS.includes(logLevel)) { console.error(`mpost-wasm: unknown log level ${logLevel} (${LOG_LEVELS.join(', ')})`); process.exit(1); }
  // Everything the level admits goes to stderr, so stdout stays the transcript (and, with --stdout, the figure).
  // MetaPost's own errors and warnings are left out: the transcript on stdout carries them, as with mpost.
  const logger = (r: LogRecord) => {
    if (!o.prerender && r.source === 'metapost' && (r.level === 'error' || r.level === 'warn')) return;
    const raw = (r.level === 'debug' || r.level === 'trace') && r.source !== 'host';
    process.stderr.write(raw ? `${r.source}: ${r.message}\n` : `mpost-wasm: ${r.source === 'host' ? '' : r.source + ': '}${r.message}\n`);
  };
  if (o.prerender) {
    // the browser's defaults (deterministic, seed 42), so the files are the bytes the tags would produce
    const pages = o.args.filter((a) => !a.startsWith('&'));
    if (!pages.length) { console.error('mpost-wasm: --prerender needs one or more .html pages'); process.exit(1); }
    for (const p of pages) if (!fs.existsSync(p)) { console.error(`mpost-wasm: cannot open ${p}`); process.exit(1); }
    const mp = await MetaPost.create({
      texmfDir: o.texmf || undefined, bundleBaseUrl: o.bundles ? 'file://' + path.resolve(o.bundles) + '/' : undefined,
      logLevel, logger,
    });
    const r = await prerender(pages, { mp, figuresDir: o.figures ? path.resolve(o.figures) : undefined, force: o.force, dryRun: o.dryRun, report: (l) => process.stdout.write(l + '\n') });
    const pending = r.entries.filter((e) => e.status === 'pending').length;
    process.stdout.write(`mpost-wasm: ${r.rendered} rendered, ${r.existing} already saved, ${r.failed} failed${o.dryRun ? `, ${pending} to render` : ''}\n`);
    mp.dispose();
    process.exit(r.failed ? 1 : 0);
  }
  const mp = await MetaPost.create({
    numberSystem: o.numbersystem, tex: o.tex, interaction: o.interaction, haltOnError: o.halt,
    texmfDir: o.texmf || undefined, bundleBaseUrl: o.bundles ? 'file://' + path.resolve(o.bundles) + '/' : undefined,
    deterministic: false, logLevel, logger,
  });
  if (o.version) { console.log(`MetaPost ${mp.version.metapost} (mp-tikz-wasm) with ${mp.version.tex}`); mp.dispose(); return; }
  if (o.troff) console.error('mpost-wasm: warning: troff mode is not supported; continuing in TeX mode');
  if (o.latex) {
    if (!o.file) { console.error('mpost-wasm: --latex needs a .tex file'); process.exit(1); }
    const f = fs.existsSync(o.file) ? o.file : fs.existsSync(o.file + '.tex') ? o.file + '.tex' : null;
    if (!f) { console.error(`mpost-wasm: cannot open ${o.file}`); process.exit(1); }
    const job = o.jobname || path.basename(f).replace(/\.tex$/, '');
    const sib: Record<string, string | Uint8Array> = {};
    for (const e of fs.readdirSync(path.dirname(f))) if (e !== path.basename(f) && /\.(tex|sty|cls|def|clo|fd|eps|dat|csv|txt|bib)$/.test(e)) sib[e] = fs.readFileSync(path.join(path.dirname(f), e));
    const r = await mp.latex(fs.readFileSync(f, 'utf8'), { engine: o.engine, jobName: job, files: sib, fonts: o.fonts });
    process.stdout.write(r.log.endsWith('\n') ? r.log : r.log + '\n');
    if (o.stdout) { if (r.pages[0]) process.stdout.write(r.pages[0]); }
    else r.pages.forEach((svg, i) => fs.writeFileSync(`${job}-${i + 1}.svg`, svg));
    fs.writeFileSync(`${job}.log`, r.texLog);
    mp.dispose();
    process.exit(r.status === 'error' || r.status === 'fatal' ? 1 : 0);
  }
  let source: string;
  let jobname = o.jobname;
  let files: Record<string, string | Uint8Array> = {};
  if (o.file) {
    const f = fs.existsSync(o.file) ? o.file : fs.existsSync(o.file + '.mp') ? o.file + '.mp' : null;
    if (!f) { console.error(`mpost-wasm: cannot open ${o.file}`); process.exit(1); }
    source = fs.readFileSync(f, 'utf8');
    if (!jobname) jobname = path.basename(f).replace(/\.mp$/, '');
    // make sibling .mp files inputtable
    for (const e of fs.readdirSync(path.dirname(f))) if (/\.(mp|tex|dat|txt)$/.test(e) && e !== path.basename(f)) files[e] = fs.readFileSync(path.join(path.dirname(f), e));
    if (o.commands) source += '\n' + o.commands;
  } else if (o.commands) {
    source = o.commands;
    if (!jobname) jobname = 'mpout';
  } else {
    source = fs.readFileSync(0, 'utf8');
    if (!jobname) jobname = 'mpout';
  }
  const internals = { ...o.internals };
  let format: OutputFormat = o.format || 'eps';
  if (!o.format && typeof internals.outputformat === 'string') format = internals.outputformat === 'svg' ? 'svg' : 'eps';
  const prologues = typeof internals.prologues === 'number' ? (internals.prologues as 0 | 1 | 2 | 3) : format === 'svg' ? 3 : 0;
  const r = await mp.run(source, { jobName: jobname, files, internals, format, prologues, svg: { precision: false, idPrefix: false } });
  process.stdout.write(r.log.endsWith('\n') ? r.log : r.log + '\n');   // MetaPost's terminal transcript, like mpost
  // like mpost: the default outputtemplate is %j.%c whatever the format; %o expands to the format's extension
  const ext = format === 'svg' ? 'svg' : format === 'json' ? 'json' : 'eps';
  const template = typeof internals.outputtemplate === 'string' ? internals.outputtemplate : `%j.%c`;
  for (const fig of r.figures) {
    const name = template.replace('%j', jobname).replace('%c', String(fig.charcode)).replace('%o', ext);
    const body = format === 'svg' ? fig.svg! : format === 'json' ? JSON.stringify(fig.json) : fig.eps!;
    if (o.stdout) { process.stdout.write(body); break; }
    fs.writeFileSync(name, body);
  }
  for (const [name, data] of Object.entries(r.artifacts)) if (name !== `${jobname}.log` || true) fs.writeFileSync(name, data);
  if (o.recorder) fs.writeFileSync(`${jobname}.fls`, r.diagnostics.map(() => '').join(''));
  mp.dispose();
  process.exit(r.history >= 2 ? 1 : 0);
}

main().catch((e) => { console.error(e?.stack ?? String(e)); process.exit(2); });
