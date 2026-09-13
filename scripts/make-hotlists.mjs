#!/usr/bin/env node
// make-hotlists.mjs — record which bundle files a first run of each kind
// touches and write dist/bundles/hot.json. MetaPost.create({ prefetch })
// and the drop-in tags fetch these in parallel before the first run, which
// on a high-latency host turns ~90 serial round trips into a few seconds.
// The lists are the union over the guide's examples of each kind, run in
// Node with the bundle loader instrumented; runs after build:ts.
import fs from 'node:fs';
import path from 'node:path';
import { BundleSet } from '../dist/vfs/bundle.js';
import { MetaPost } from '../dist/index.js';
import { GUIDE } from './guide-examples.mjs';

const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const seen = new Set();
for (const name of ['fetchAsync', 'fetchSyncFile']) {
  const orig = BundleSet.prototype[name];
  BundleSet.prototype[name] = function (f) { seen.add(f.path); return orig.call(this, f); };
}
const kinds = { metapost: [], latex: [], lualatex: [], plain: [] };
for (const ex of GUIDE) {
  if (ex.kind === 'mp') kinds.metapost.push(ex);
  else if (ex.plain) kinds.plain.push(ex);
  else if (ex.engine === 'lualatex' || ex.engine === 'luatex') kinds.lualatex.push(ex);
  else kinds.latex.push(ex);
}
// a MetaPost page that uses LaTeX labels also needs the latex set; keep the
// metapost list to what MetaPost itself and plain-TeX labels touch
const out = {};
for (const [kind, examples] of Object.entries(kinds)) {
  seen.clear();
  const mp = await MetaPost.create({ log: () => {}, snapshot: 'none' });
  for (const ex of examples) {
    if (kind === 'metapost' && /documentclass/.test(ex.src)) continue;
    const r = ex.kind === 'mp' ? await mp.run(ex.src, { format: 'svg' }) : await mp.latex(ex.src, { engine: ex.engine ?? (ex.plain ? 'plain' : 'latex'), snapshot: 'none' });
    if (r.status !== 'ok' && r.status !== 'warning') console.warn(`  ! ${ex.id}: ${r.status}`);
  }
  mp.dispose();
  out[kind] = [...seen].sort();
  console.log(`  ${kind.padEnd(9)} ${String(out[kind].length).padStart(4)} files from ${examples.length} examples`);
}
const file = path.join(REPO, 'dist/bundles/hot.json');
fs.writeFileSync(file, JSON.stringify({ generated: new Date().toISOString().slice(0, 10), kinds: out }));
console.log(`  ${path.relative(REPO, file)}: ${(fs.statSync(file).size / 1024).toFixed(0)} KB`);
