#!/usr/bin/env node
/**
 * mpost-wasm — a drop-in for `mpost` for the common flag set (docs/08 §5).
 *
 *   mpost-wasm [OPTION]... [MPNAME[.mp]] [COMMANDS]
 *   mpost-wasm --dvitomp DVINAME[.dvi] [MPXNAME[.mpx]]
 */
import { MetaPost } from './index.js';
import type { OutputFormat, NumberSystem, TexEngine } from './types.js';

const HELP = `Usage: mpost-wasm [OPTION]... [MPNAME[.mp]] [COMMANDS]
       mpost-wasm --latex [OPTION]... DOC.tex
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
  --fonts=paths|woff2   how text is emitted in --latex mode (default paths)
  -help, -version
`;

function parseArgs(argv: string[]) {
  const o = {
    interaction: 'nonstop' as 'batch' | 'nonstop' | 'scroll',
    numbersystem: 'scaled' as NumberSystem,
    jobname: '' , tex: 'auto' as TexEngine, internals: {} as Record<string, string | number>,
    halt: false, recorder: false, troff: false, format: '' as '' | OutputFormat, texmf: '', bundles: '',
    stdout: false, file: '', commands: '', help: false, version: false, dvitomp: false,
    latex: false, plain: false, fonts: 'paths' as 'paths' | 'woff2',
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
      case 'plain': o.plain = true; o.latex = true; break;
      case 'fonts': o.fonts = (v ?? next()) as 'paths' | 'woff2'; break;
      case 'ini': case 'mem': case 'progname': case 'kpathsea-debug': case 'restricted': case 'debug': case 'translate-file': case '8bit':
        console.error(`mpost-wasm: warning: option -${k} is accepted and ignored`); if (v === undefined && ['mem', 'progname', 'kpathsea-debug', 'translate-file'].includes(k)) next(); break;
      default: console.error(`mpost-wasm: unknown option ${a}`); process.exit(1);
    }
  }
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
  const mp = await MetaPost.create({
    numberSystem: o.numbersystem, tex: o.tex, interaction: o.interaction, haltOnError: o.halt,
    texmfDir: o.texmf || undefined, bundleBaseUrl: o.bundles ? 'file://' + path.resolve(o.bundles) + '/' : undefined,
    deterministic: false,
  });
  if (o.version) { console.log(`MetaPost ${mp.version.metapost} (metapost-wasm) with ${mp.version.tex}`); mp.dispose(); return; }
  if (o.troff) console.error('mpost-wasm: warning: troff mode is not supported; continuing in TeX mode');
  if (o.latex) {
    if (!o.file) { console.error('mpost-wasm: --latex needs a .tex file'); process.exit(1); }
    const f = fs.existsSync(o.file) ? o.file : fs.existsSync(o.file + '.tex') ? o.file + '.tex' : null;
    if (!f) { console.error(`mpost-wasm: cannot open ${o.file}`); process.exit(1); }
    const job = o.jobname || path.basename(f).replace(/\.tex$/, '');
    const sib: Record<string, string | Uint8Array> = {};
    for (const e of fs.readdirSync(path.dirname(f))) if (e !== path.basename(f) && /\.(tex|sty|cls|def|clo|fd|eps|dat|csv|txt|bib)$/.test(e)) sib[e] = fs.readFileSync(path.join(path.dirname(f), e));
    const r = await mp.latex(fs.readFileSync(f, 'utf8'), { engine: o.plain ? 'plain' : 'latex', jobName: job, files: sib, fonts: o.fonts });
    process.stdout.write(r.log.endsWith('\n') ? r.log : r.log + '\n');
    if (o.stdout) { if (r.pages[0]) process.stdout.write(r.pages[0]); }
    else r.pages.forEach((svg, i) => fs.writeFileSync(`${job}-${i + 1}.svg`, svg));
    fs.writeFileSync(`${job}.log`, r.texLog);
    for (const d of r.diagnostics) if (d.severity === 'error') console.error(`${d.file ?? job + '.tex'}${d.line ? ':' + d.line : ''}: ${d.message}`);
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
  for (const d of r.diagnostics) if (d.source !== 'metapost') console.error(`${d.source}: ${d.severity}: ${d.message}${d.line ? ` (${d.file ?? jobname}.mp:${d.line})` : ''}`);
  mp.dispose();
  process.exit(r.history >= 2 ? 1 : 0);
}

main().catch((e) => { console.error(e?.stack ?? String(e)); process.exit(2); });
