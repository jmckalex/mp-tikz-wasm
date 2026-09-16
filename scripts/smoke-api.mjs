// smoke-api.mjs — end-to-end through the public API in Node (in-process,
// bundles read from dist/bundles).
import { MetaPost } from '../dist/index.js';

const t0 = performance.now();
const mp = await MetaPost.create({ logLevel: 'silent' });
console.log(`create: ${(performance.now() - t0).toFixed(0)} ms; version`, mp.version);

async function show(label, src, opts = {}) {
  const r = await mp.run(src, opts);
  const f = r.figures[0];
  console.log(`\n== ${label}: status=${r.status} figures=${r.figures.length} stats=${JSON.stringify(r.stats)}`);
  if (r.diagnostics.length) console.log('   diagnostics:', r.diagnostics.map((d) => `[${d.source}/${d.severity}] ${d.message}${d.line ? ' (line ' + d.line + ')' : ''}`).join('\n   '));
  if (f) console.log(`   fig ${f.charcode} bbox=${f.bbox.map((v) => v.toFixed(2)).join(',')} svg=${f.svg?.length ?? 0}B glyphs=${(f.svg?.match(/id="[^"]*GLYPH/g) || []).length} eps=${f.eps?.length ?? 0}B json=${f.json ? f.json.objects.length + ' objs' : '-'}`);
  return r;
}

await show('geometry', 'beginfig(1); draw fullcircle scaled 100; endfig; end.', { format: ['svg', 'eps', 'json'] });
await show('tier 0 label', 'prologues:=3; beginfig(1); draw fullcircle scaled 100; label.top("MetaPost", (0,50)); endfig; end.');
await show('plain TeX btex', 'beginfig(1); draw fullcircle scaled 100; label.top(btex $\\sqrt{x^2+y^2}$ etex, (0,50)); endfig; end.');
const latex = `verbatimtex
\\documentclass{article}
\\usepackage{amsmath}
\\begin{document}
etex
beginfig(1);
  draw fullcircle scaled 100;
  label.top(btex $\\displaystyle\\int_0^\\infty e^{-x^2}\\,dx=\\frac{\\sqrt\\pi}{2}$ etex, (0,50));
  label.bot(btex \\LaTeX\\ \\textit{in the browser} etex, (0,-50));
endfig;
end.`;
await show('LaTeX + amsmath', latex);
await show('LaTeX again (warm cache)', latex);
let forty = 'beginfig(1);\n';
for (let i = 0; i < 40; i++) forty += `label(btex $x_{${i}}$ etex, (${i * 10}, 0));\n`;
forty += 'endfig; end.';
await show('40 labels, cold', forty);
await show('40 labels, one edited', forty.replace('x_{7}', 'y_{7}'));
await show('scantokens-generated btex (fixpoint)', 'beginfig(1); scantokens("label(btex $\\alpha$ etex, origin);"); endfig; end.');
await show('error handling', 'beginfig(1); draw z1--z2; endfig; end.');
await show('input graph', 'input graph; beginfig(1); draw begingraph(3cm,2cm); gdraw "" ; endgraph; endfig; end.');
await show('boxes', 'input boxes; beginfig(1); boxit.a(btex $a$ etex); boxit.b("b"); b.w = a.e + (20,0); drawboxed(a,b); endfig; end.');
mp.dispose();
