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
    expect(records.length).toBeGreaterThanOrEqual(2);
    expect(records[0]).toMatch(/\d+ files/);
  }, 180_000);

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

  it('still reports a real luaotfload failure', async () => {
    // the blanket luaotfload filter used to swallow these
    const mp = await create(['opentype']);
    const r = await mp.latex(`${preamble}\\setmainfont{NoSuchFontExistsHere}${body}`, { engine: 'lualatex' });
    expect(r.status).not.toBe('ok');
    expect(r.diagnostics.length).toBeGreaterThan(0);
  }, 120_000);
});
