#!/usr/bin/env node
// soak-memory.mjs [runs] [--tikz] — run one job per iteration on a single
// long-lived engine, the way an animation that renders a fresh MetaPost
// instance per frame exercises it, and report memory growth. Needs `npm run build`.
//
// For MetaPost jobs the number that matters is the wasm allocator's bytes in
// use (mpwasm_heap_in_use, dlmalloc's uordblks): it must come back to the same
// value after every job. HEAPU8.length only grows in large steps and is shown
// for context. --tikz runs a LaTeX/TikZ document per iteration instead and
// reports the Node process RSS, since TeX and dvisvgm run in their own modules.
import { MetaPost } from '../dist/index.js';

const runs = Number(process.argv.find((a) => /^\d+$/.test(a)) ?? 3000);
const tikz = process.argv.includes('--tikz');
const mp = await MetaPost.create({ log: () => {}, tex: tikz ? 'auto' : 'none' });
const M = mp.backend.core.M;
const inUse = () => (M._mpwasm_heap_in_use ? M._mpwasm_heap_in_use() : NaN);
const heapMB = () => M.HEAPU8.length / 1048576;
const rssMB = () => process.memoryUsage().rss / 1048576;
const mpSrc = 'beginfig(1); numeric a; a := 37; pair v[]; for i = 0 upto 7: v[i] := (10i, 5i); endfor for i = 1 upto 7: draw v[i-1] -- v[i] withpen pencircle scaled 1.1 withcolor (0.1,0.3,0.7); endfor fill fullcircle scaled 4 shifted v[3]; endfig; end.';
const texSrc = '\\documentclass{standalone}\\usepackage{tikz}\\begin{document}\\begin{tikzpicture}\\draw[thick,blue] (0,0) -- (1,1) circle (0.3);\\node at (0.5,0.5) {$x$};\\end{tikzpicture}\\end{document}';
const run = () => (tikz ? mp.latex(texSrc, { engine: 'latex' }) : mp.run(mpSrc, { format: 'svg' }));
const warm = tikz ? 5 : 50;
for (let i = 0; i < warm; i++) { const r = await run(); if (r.status !== 'ok') { console.error(r.log ?? r.texLog ?? r); process.exit(1); } }
const start = { inUse: inUse(), heap: heapMB(), rss: rssMB() }; const t0 = performance.now();
let errors = 0;
const every = Math.max(1, Math.floor(runs / 10));
for (let i = 0; i < runs; i++) {
  const r = await run();
  if (r.status !== 'ok') errors++;
  if ((i + 1) % every === 0) {
    if (tikz) console.log(`${String(i + 1).padStart(7)} runs  rss ${rssMB().toFixed(1)} MB  (${(rssMB() - start.rss >= 0 ? '+' : '')}${(rssMB() - start.rss).toFixed(1)} MB)`);
    else console.log(`${String(i + 1).padStart(7)} runs  in use ${inUse()} B  (${inUse() - start.inUse >= 0 ? '+' : ''}${inUse() - start.inUse} B)  heap ${heapMB().toFixed(0)} MB`);
  }
}
const ms = performance.now() - t0;
if (tikz) console.log(`\n${runs} TikZ runs after ${warm} warm-up runs: rss ${start.rss.toFixed(1)} -> ${rssMB().toFixed(1)} MB, ${errors} errors, ${(ms / runs).toFixed(0)} ms/run`);
else console.log(`\n${runs} runs after ${warm} warm-up runs: bytes in use ${start.inUse} -> ${inUse()} (${((inUse() - start.inUse) / runs).toFixed(2)} B/run), heap ${start.heap.toFixed(0)} -> ${heapMB().toFixed(0)} MB, ${errors} errors, ${(ms / runs).toFixed(1)} ms/run`);
mp.dispose();
