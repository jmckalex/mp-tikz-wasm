// OpenType fonts under LuaTeX (luaotfload + fontspec). End-to-end through the
// built library; run after `npm run build`. See docs/14 §15.
//
// The `opentype` bundle is opt-in, so every engine here asks for it explicitly.
// That is the feature working as designed, not a quirk of the test: LaTeX probes
// for luaotfload at start-up, so a default engine must not be able to find it.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const REPO = path.resolve(new URL('../..', import.meta.url).pathname);
const BUNDLES = path.join(REPO, 'dist/bundles');
const built = fs.existsSync(path.join(REPO, 'dist/index.js'))
  && fs.existsSync(path.join(BUNDLES, 'opentype/manifest.json'))
  && fs.existsSync(path.join(BUNDLES, 'otf-fonts/manifest.json'));

// A face the build itself produced, fed in as if the host had supplied it (an
// Electron app handing over a system font). Using a bundled file rather than an
// OS font keeps this identical on macOS and on the CI runner.
const FACE = path.join(BUNDLES, 'opentype/files/fonts/opentype/public/lm/lmroman10-regular.otf');

// A collection (.ttc) assembled from single-face files: the 'ttcf' header, one
// table directory per face, then each face's tables, unshared and 4-byte aligned.
// That is all FreeType and luaotfload need, and it keeps a binary fixture out of
// the repository.
function makeCollection(faces: Buffer[]): Buffer {
  let pos = 12 + 4 * faces.length;
  const dirAt = faces.map((f) => { const at = pos; pos += 12 + 16 * f.readUInt16BE(4); return at; });
  const head = Buffer.alloc(pos);
  head.write('ttcf', 0, 'latin1');
  head.writeUInt16BE(1, 4);   // version 1.0
  head.writeUInt32BE(faces.length, 8);
  const tables: Buffer[] = [];
  faces.forEach((f, i) => {
    head.writeUInt32BE(dirAt[i], 12 + 4 * i);
    f.copy(head, dirAt[i], 0, 12);   // sfnt version and the binary-search fields
    for (let t = 0; t < f.readUInt16BE(4); t++) {
      const rec = 12 + 16 * t, at = dirAt[i] + rec;
      const offset = f.readUInt32BE(rec + 8), length = f.readUInt32BE(rec + 12);
      f.copy(head, at, rec, rec + 8);   // tag and checksum
      head.writeUInt32BE(pos, at + 8);
      head.writeUInt32BE(length, at + 12);
      const table = Buffer.alloc((length + 3) & ~3);
      f.copy(table, 0, offset, offset + length);
      tables.push(table);
      pos += table.length;
    }
  });
  return Buffer.concat([head, ...tables]);
}

// A face renamed in place, so that it is a family the prebuilt name index does not
// know: equal-length replacements, as Mac Roman and as UTF-16BE, inside the name
// and CFF tables only (their checksums go stale, which no reader here checks).
function renameFace(face: Buffer, pairs: [string, string][]): Buffer {
  const f = Buffer.from(face);
  for (let t = 0; t < f.readUInt16BE(4); t++) {
    const rec = 12 + 16 * t;
    if (!['name', 'CFF '].includes(f.toString('latin1', rec, rec + 4))) continue;
    const start = f.readUInt32BE(rec + 8), end = start + f.readUInt32BE(rec + 12);
    for (const [from, to] of pairs) {
      for (const [a, b] of [[Buffer.from(from, 'latin1'), Buffer.from(to, 'latin1')], [Buffer.from(from, 'utf16le').swap16(), Buffer.from(to, 'utf16le').swap16()]]) {
        for (let i = f.indexOf(a, start); i >= 0 && i + a.length <= end; i = f.indexOf(a, i + 1)) b.copy(f, i);
      }
    }
  }
  return f;
}

const preamble = String.raw`\documentclass{article}\pagestyle{empty}\usepackage{fontspec}`;
const body = String.raw`\begin{document}\noindent Quick brown fox, fi ffl, AVATAR.\end{document}`;

describe.skipIf(!built)('OpenType fonts (luaotfload)', () => {
  let MetaPost: any, DEFAULT_BUNDLES: string[];
  const engines: any[] = [];
  const create = async (extra: string[]) => {
    const mp = await MetaPost.create({ bundles: [...DEFAULT_BUNDLES, ...extra], logLevel: 'silent' });
    engines.push(mp);
    return mp;
  };

  beforeAll(async () => {
    ({ MetaPost } = await import(path.join(REPO, 'dist/index.js')));
    ({ DEFAULT_BUNDLES } = await import(path.join(REPO, 'dist/bundles-config.js')));
  }, 60_000);
  afterAll(() => { for (const mp of engines) mp?.dispose(); });

  it('sets a bundled face by family name', async () => {
    const mp = await create(['opentype']);
    const r = await mp.latex(`${preamble}\\setmainfont{Latin Modern Roman}${body}`, { engine: 'lualatex' });
    expect(r.status).toBe('ok');
    expect(r.pages).toHaveLength(1);
    expect(r.pages[0]).toContain('<path');
  }, 120_000);

  it('serves every size and shape the TU fd files can ask for', async () => {
    // The kernel's tulm*.fd name all 72 Latin Modern faces by optical size, so a
    // 12pt class wants lmroman12-*, \small lmroman9, \textsc lmromancaps10 and
    // \LARGE lmroman17 -- none of them among the twelve 10pt faces the bundle
    // first shipped. The whole family rides in `opentype` now; `otf-fonts` is
    // not loaded here on purpose.
    const mp = await create(['opentype']);
    const r = await mp.latex(String.raw`\documentclass[12pt]{article}\pagestyle{empty}\usepackage{fontspec}
\begin{document}\noindent Twelve point, {\small small}, {\footnotesize footnote}, \textsc{Caps},
\textsl{slanted}, {\large large}, {\LARGE LARGE}, \textsf{\small sans}, \texttt{\large mono}.\end{document}`,
      { engine: 'lualatex' });
    expect(r.status).toBe('ok');
    expect(r.diagnostics).toHaveLength(0);
    // a fresh instance always builds luaotfload's name database once; what must not
    // happen is a face missing ("not loadable") or the rebuild a miss triggers
    expect(r.texLog).not.toMatch(/not loadable|Reload initiated/);
    expect(r.pages[0]).toContain('<path');
  }, 120_000);

  it('sets a face the host supplied at run time', async () => {
    const mp = await create(['opentype']);
    await mp.addFiles({ 'supplied.otf': fs.readFileSync(FACE) });
    // /work is the cwd and TEXMFDOTDIR leads OPENTYPEFONTS, so Path=./ finds it
    const r = await mp.latex(`${preamble}\\setmainfont{supplied.otf}[Path=./]${body}`, { engine: 'lualatex' });
    expect(r.status).toBe('ok');
    expect(r.pages[0]).toContain('<path');
  }, 120_000);

  it("embeds the face itself when fonts is 'woff2'", async () => {
    const mp = await create(['opentype']);
    await mp.addFiles({ 'supplied.otf': fs.readFileSync(FACE) });
    const doc = `${preamble}\\setmainfont{supplied.otf}[Path=./]${body}`;
    const [outlines, webfont] = await Promise.all([
      mp.latex(doc, { engine: 'lualatex', fonts: 'paths' }),
      mp.latex(doc, { engine: 'lualatex', fonts: 'woff2' }),
    ]);
    expect(outlines.status).toBe('ok');
    expect(webfont.status).toBe('ok');
    // outlines are self-contained paths; woff2 is real text against an embedded face
    expect(outlines.pages[0]).toContain('<path');
    expect(outlines.pages[0]).not.toContain('@font-face');
    expect(webfont.pages[0]).toContain('@font-face');
    expect(webfont.pages[0]).toContain('<text');
    expect(webfont.pages[0]).toMatch(/base64/);
  }, 180_000);

  it('draws each face of a collection (.ttc) as itself, in both font modes', async () => {
    const mp = await create(['opentype']);
    const bold = FACE.replace('regular', 'bold');
    await mp.addFiles({ 'pair.ttc': makeCollection([fs.readFileSync(FACE), fs.readFileSync(bold)]) });
    const doc = String.raw`${preamble}\setmainfont{pair.ttc}[Path=./, UprightFeatures={FontIndex=0},
      BoldFont=pair.ttc, BoldFeatures={FontIndex=1}]\begin{document}A \textbf{A}\end{document}`;
    const [outlines, webfont] = await Promise.all([
      mp.latex(doc, { engine: 'lualatex', fonts: 'paths' }),
      mp.latex(doc, { engine: 'lualatex', fonts: 'woff2' }),
    ]);
    expect(outlines.status).toBe('ok');
    expect(webfont.status).toBe('ok');
    // dvisvgm used to key a face by its file alone (patches/dvisvgm/0001): the bold
    // A became a <use> of the regular one's outline, and both shared one @font-face
    const glyphs = [...outlines.pages[0].matchAll(/<path id='g\d+-\d+' d='([^']*)'/g)].map((m) => m[1]);
    expect(glyphs).toHaveLength(2);
    expect(glyphs[0]).not.toBe(glyphs[1]);
    expect(outlines.pages[0]).not.toMatch(/<use id='g\d+-\d+'/);
    const families = [...webfont.pages[0].matchAll(/text\.f\d+ \{font-family:(\w+)/g)].map((m) => m[1]);
    expect(families).toHaveLength(2);
    expect(new Set(families).size).toBe(2);
    expect(webfont.pages[0].match(/@font-face/g)).toHaveLength(2);
  }, 180_000);

  it('finds every face of a supplied family by its name, not only a file of that name', async () => {
    // luaotfload leaves the working directory (where addFiles puts a face) out of
    // its name index unless scan-local is on, which the bundled luaotfload.conf
    // does: \setmainfont{Optima} used to load only Optima.ttc's first face, as a
    // file, and fontspec could not resolve Optima/B, so bold came out regular
    const mp = await create(['opentype']);
    const pairs: [string, string][] = [['Latin Modern', 'Quartz Model'], ['LM Roman', 'QZ Roman'], ['LMRoman', 'QZRoman']];
    const bold = FACE.replace('regular', 'bold');
    await mp.addFiles({ 'qz.ttc': makeCollection([renameFace(fs.readFileSync(FACE), pairs), renameFace(fs.readFileSync(bold), pairs)]) });
    const r = await mp.latex(String.raw`${preamble}\setmainfont{Quartz Model Roman}\begin{document}A \textbf{A}\end{document}`, { engine: 'lualatex', fonts: 'paths' });
    expect(r.status).toBe('ok');
    expect(r.texLog).not.toMatch(/Could not resolve font "Quartz Model Roman\/B"/);
    const glyphs = [...r.pages[0].matchAll(/<path id='g\d+-\d+' d='([^']*)'/g)].map((m) => m[1]);
    expect(glyphs).toHaveLength(2);
    expect(glyphs[0]).not.toBe(glyphs[1]);
  }, 180_000);

  it('carries luaotfload\'s font cache from one run to the next', async () => {
    const records: string[] = [];
    const mp = await MetaPost.create({
      bundles: [...DEFAULT_BUNDLES, 'opentype'], logLevel: 'trace',
      logger: (rec: any) => { if (/font cache/.test(rec.message)) records.push(rec.message); },
    });
    engines.push(mp);
    const doc = `${preamble}\\setmainfont{Latin Modern Roman}${body}`;
    const first = await mp.latex(doc, { engine: 'lualatex' });
    const second = await mp.latex(doc, { engine: 'lualatex' });
    expect(first.status).toBe('ok');
    expect(second.status).toBe('ok');
    // identical output, and the cache was captured after each run rather than rebuilt from nothing
    expect(second.pages[0]).toBe(first.pages[0]);
    const captured = records.filter((m) => /font cache: \d+ files/.test(m));
    expect(captured.length).toBeGreaterThanOrEqual(2);
  }, 180_000);

  it('starts a fresh engine from the prebuilt name database instead of opening every face', async () => {
    // Without the database scripts/make-fontdb.mjs ships in `opentype`, luaotfload
    // builds its own on a fresh engine's first font request by opening all 72
    // Latin Modern faces. Seeded, a 12pt article fetches only the faces it sets.
    if (!fs.existsSync(path.join(BUNDLES, 'opentype/files/luaotfload/luaotfload-names.lua.gz'))) throw new Error('no prebuilt font database in the opentype bundle; run npm run build:fontdb && npm run build:bundles');
    const faces = new Set<string>();
    const messages: string[] = [];
    const mp = await MetaPost.create({
      bundles: [...DEFAULT_BUNDLES, 'opentype'], logLevel: 'trace',
      logger: (rec: any) => {
        messages.push(rec.message);
        const m = /(?:fetched|loaded) (fonts\/opentype\/\S+)/.exec(rec.message);
        if (m) faces.add(m[1]);
      },
    });
    engines.push(mp);
    const r = await mp.latex(String.raw`\documentclass[12pt]{article}\pagestyle{empty}\usepackage{fontspec}
\begin{document}\noindent Twelve point, \textbf{bold}.\end{document}`, { engine: 'lualatex' });
    expect(r.status).toBe('ok');
    expect(messages.some((m) => /font cache: seeded/.test(m))).toBe(true);
    expect(messages.some((m) => /generating new one/.test(m))).toBe(false);
    expect(faces.size).toBeGreaterThan(0);
    expect(faces.size).toBeLessThan(10);
  }, 180_000);

  it('writes a PDF with the OpenType faces embedded', async () => {
    const mp = await create(['opentype']);
    const r = await mp.latex(`${preamble}${body}`, { engine: 'lualatex', output: 'pdf' });
    expect(r.status).toBe('ok');
    const zlib = await import('node:zlib');
    const raw = Buffer.from(r.pdf!).toString('latin1');
    let text = raw;
    for (const m of raw.matchAll(/stream\r?\n/g)) {
      const start = m.index! + m[0].length;
      try { text += zlib.inflateSync(Buffer.from(raw.slice(start, raw.indexOf('endstream', start)), 'latin1')).toString('latin1'); } catch { /* not Flate */ }
    }
    expect(text).toMatch(/\/BaseFont\s*\/[A-Z]{6}\+LMRoman10-Regular/);
    expect(text).toMatch(/\/FontFile3\b/);   // the face itself (CFF), not a reference
  }, 120_000);

  it('runs unicode-math with the wider font bundle', async () => {
    const mp = await create(['opentype', 'otf-fonts']);
    const r = await mp.latex(String.raw`\documentclass{article}\pagestyle{empty}
\usepackage{unicode-math}\setmathfont{Latin Modern Math}
\begin{document}\noindent $\sqrt{2}+\frac{a}{b}$\end{document}`, { engine: 'lualatex' });
    expect(r.status).toBe('ok');
    expect(r.pages[0]).toContain('<path');
  }, 180_000);

  it('leaves the default engine exactly as it was', async () => {
    // No `opentype`: LuaLaTeX probes for luaotfload, does not find it, reverts to
    // OT1 and the Type 1 fonts. That must stay silent, and fontspec must stay absent.
    const mp = await MetaPost.create({ logLevel: 'silent' });
    engines.push(mp);
    const r = await mp.latex(String.raw`\documentclass{article}\pagestyle{empty}
\begin{document}\noindent Default path. $\sqrt{2}$\end{document}`, { engine: 'lualatex' });
    expect(r.status).toBe('ok');
    expect(r.diagnostics).toHaveLength(0);
    expect(r.texLog).toMatch(/reverting to OT1/);
  }, 120_000);

  it('works under plain LuaTeX, headline included', async () => {
    // Stock TeX Live cannot do this: luaotfload's DVI module registers on
    // `pre_shipout_filter`, a callback only the LaTeX kernel creates and calls.
    // patches/texmf/0001 gives luaotfload.sty the same hook for plain TeX. The
    // headline matters: it is added by the output routine, after everything a
    // pre_output_filter would have seen, so it proves the hook runs at shipout.
    const mp = await create(['opentype']);
    const r = await mp.latex(String.raw`\input luaotfload.sty
\font\body="[lmroman10-regular.otf]:mode=node;+liga;+kern" at 10pt
\font\hd="[lmroman10-bold.otf]:mode=node" at 8pt
\headline={\hd Header in the bold face\hfil page \folio}
\body Quick brown fox, fi ffl ffi, AVATAR.\par
\vfill\eject
Page two.
\bye`, { engine: 'luatex' });
    expect(r.status).toBe('ok');
    expect(r.pages).toHaveLength(2);
    expect(r.pages[0]).toContain('<path');
    expect(r.pages[1]).toContain('<path');
    expect(r.texLog).not.toMatch(/Unable to register callback|not loadable/);
    expect(r.texLog).toMatch(/luaotfload\.dvi' in `pre_shipout_filter'/);
  }, 120_000);

  it('works under plain LuaTeX with an output routine that ships \\box255', async () => {
    // the other branch of the \shipout wrapper: a box that is already built
    const mp = await create(['opentype']);
    const r = await mp.latex(String.raw`\input luaotfload.sty
\font\body="[lmroman10-regular.otf]:mode=node;+liga;+kern" at 10pt
\output={\shipout\box255 \global\advance\pageno by 1 }
\body Custom output routine: fi ffl, AVATAR.\par
\vfill\eject
\body Page two.
\bye`, { engine: 'luatex' });
    expect(r.status).toBe('ok');
    expect(r.pages).toHaveLength(2);
    expect(r.pages[1]).toContain('<path');
  }, 120_000);

  it('still reports a real luaotfload failure', async () => {
    // the blanket luaotfload filter used to swallow these
    const mp = await create(['opentype']);
    const r = await mp.latex(`${preamble}\\setmainfont{NoSuchFontExistsHere}${body}`, { engine: 'lualatex' });
    expect(r.status).not.toBe('ok');
    expect(r.diagnostics.length).toBeGreaterThan(0);
  }, 120_000);
});
