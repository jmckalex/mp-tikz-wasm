#!/usr/bin/env node
// make-fontdb.mjs — prebuild luaotfload's font-name database against the
// assembled tree and write it to build/texmf/luaotfload/luaotfload-names.lua.gz,
// where build-bundles.mjs puts it in the `opentype` bundle. Every engine
// instance seeds its font cache (/texmf-var) from it (core.ts), so a fresh
// engine's first OpenType run no longer opens every face on OPENTYPEFONTS to
// build the database itself (72 Latin Modern faces, 7.2 MB).
//
// The database is built by the wasm LuaTeX with build/texmf mounted at /texmf,
// so the paths inside it are the /texmf/fonts/... ones every instance sees,
// whether its tree comes from bundles or from a mounted texmfDir. It indexes
// every face in the tree -- the `opentype` family and `otf-fonts`'s maths
// font; an entry for a face whose bundle is not loaded is never opened unless
// a document asks for that face by name, and then it would fail anyway.
//
// luaotfload stamps the database with the clock (meta.created, meta.modified)
// and every face with its file's mtime; those are set to 0 here so the bytes
// depend only on the tree. It checks nothing but the index version on load;
// the timestamps only decide which faces a rescan re-reads, and in a fresh
// in-memory filesystem that is all of them either way. Only the .lua.gz is
// written: luaotfload falls back to it when there is no .luc, and bytecode
// would have to be regenerated after the rewrite.
//
// Runs after build:formats and build:ts (it uses dist/index.js), before
// build:bundles.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { MetaPost } from '../dist/index.js';
import { MetaPostCore } from '../dist/core.js';

const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const TEXMF = path.resolve(process.argv[2] ?? path.join(REPO, 'build/texmf'));
const OUT = path.join(TEXMF, 'luaotfload', 'luaotfload-names.lua.gz');
const NAMES = '/texmf-var/luatex-cache/generic/names/luaotfload-names.lua.gz';

if (!fs.existsSync(path.join(TEXMF, 'tex/luatex/luaotfload/luaotfload.sty'))) {
  console.log(`  fontdb: no luaotfload in ${TEXMF}, skipped`);
  process.exit(0);
}
// a stale database would be seeded instead of scanned
fs.rmSync(path.dirname(OUT), { recursive: true, force: true });

// the font cache lives in a private field of MetaPostCore; catch it on its way out
let written;
const collect = MetaPostCore.prototype.collectTexmfVar;
if (typeof collect !== 'function') throw new Error('make-fontdb: MetaPostCore.collectTexmfVar has gone; update this script');
MetaPostCore.prototype.collectTexmfVar = function (FS) { collect.call(this, FS); written = this.texmfVar.get(NAMES); };

const mp = await MetaPost.create({ texmfDir: TEXMF, logLevel: 'silent' });
const doc = String.raw`\documentclass{article}\usepackage{fontspec}\begin{document}x\end{document}`;
const r = await mp.latex(doc, { engine: 'lualatex' });
mp.dispose();
if (r.status !== 'ok') {
  // the diagnostics parser can come back empty-handed (no DVI, no recognised error): show the log's end
  const tail = (r.texLog || r.log || '').trim().split('\n').slice(-40).join('\n');
  throw new Error(`make-fontdb: the LuaLaTeX run failed:\n${r.diagnostics.map((d) => d.message).join('\n')}\n--- end of the TeX log ---\n${tail}`);
}
if (!written) throw new Error(`make-fontdb: luaotfload wrote no ${path.basename(NAMES)}`);

let lua = zlib.gunzipSync(written).toString('utf8');
const before = lua;
lua = lua
  .replace(/(\["(?:created|modified)"\]=)"[^"]*"/g, '$1"1970-01-01 00:00:00"')
  .replace(/(\["timestamp"\]=)\d+/g, '$10');
const version = /\["meta"\]=\{[^]*?\["version"\]=(\d+)/.exec(lua)?.[1];
const faces = new Set(lua.match(/"\/texmf\/fonts\/[^"]+\.(?:otf|ttf|ttc)"/g) ?? []).size;
if (lua === before || !version || !faces) throw new Error('make-fontdb: the database does not look like luaotfload index version 6 any more; check the rewrite');

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, zlib.gzipSync(lua, { level: 9 }));
console.log(`  fontdb: ${faces} faces, index version ${version}, ${fs.statSync(OUT).size} bytes -> ${path.relative(REPO, OUT)}`);
