// Saved figures through the built library (dist/): the Node pre-renderer
// writes figure-HASH.svg for a page's diagram elements, keeps what exists,
// and the tag renderer serves a saved figure without starting an engine.
// Runs after `npm run build`.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const REPO = path.resolve(new URL('../..', import.meta.url).pathname);
const built = fs.existsSync(path.join(REPO, 'dist/index.js')) && fs.existsSync(path.join(REPO, 'dist/mplib.wasm')) && fs.existsSync(path.join(REPO, 'dist/bundles/core/manifest.json'));

const PAGE = `<!doctype html>
<html><head><script type="module" src="../dist/auto.js" data-figures="saved/"></script></head>
<body>
<script type="text/tikz" data-libraries="arrows.meta">
\\begin{tikzpicture}\\draw[->] (0,0) -- (1,1) node[right] {$x$};\\end{tikzpicture}
</script>
<metapost-diagram alt="a circle">
  draw fullcircle scaled 40 withpen pencircle scaled 1;
  label(btex $\\pi$ etex, origin);
</metapost-diagram>
<script type="text/tikz">\\begin{tikzpicture}\\draw (0,0) -- (1,1) node {\\undefinedmacro};\\end{tikzpicture}</script>
</body></html>`;

describe.skipIf(!built)('saved figures', () => {
  let dir: string, page: string, saved: string;
  let F: any, P: any;
  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mpw-prerender-'));
    page = path.join(dir, 'page.html');
    saved = path.join(dir, 'saved');
    fs.writeFileSync(page, PAGE);
    F = await import(path.join(REPO, 'dist/figures.js'));
    P = await import(path.join(REPO, 'dist/prerender.js'));
  });
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('plans the page: the loader\'s data-figures directory and one name per element', () => {
    const plan = P.planPage(page);
    expect(plan.dir).toBe(saved);
    expect(plan.figures.map((f: any) => f.kind)).toEqual(['tikz', 'metapost', 'tikz']);
    for (const f of plan.figures) expect(f.name).toMatch(/^figure-[0-9a-z]{6}\.svg$/);
    expect(P.planPage(page, '/elsewhere').dir).toBe('/elsewhere');
  });

  it('renders every element that compiles to figure-HASH.svg, reports the broken one, keeps what exists, re-renders with force', async () => {
    const lines: string[] = [];
    const r1 = await P.prerender([page], { report: (l: string) => lines.push(l), createOptions: { logLevel: 'silent' } });
    expect(r1.rendered).toBe(2);
    expect(r1.failed).toBe(1);
    expect(r1.existing).toBe(0);
    const files = fs.readdirSync(saved).sort();
    const expected = F.extractFigures(PAGE).map((f: any) => F.figureName(F.figureHash(f)));
    expect(files).toEqual(expected.slice(0, 2).sort());
    for (const f of files) {
      const svg = fs.readFileSync(path.join(saved, f), 'utf8');
      const hash = F.FIGURE_FILE.exec(f)[1];
      expect(F.isSvg(svg)).toBe(true);
      expect(svg).toMatch(new RegExp(`id=["']mpw${hash}-`));     // ids namespaced by the figure's own hash
    }
    const failed = r1.entries.find((e: any) => e.status === 'failed');
    expect(failed.diagnostics.some((d: any) => /undefinedmacro|Undefined control sequence/i.test(d.message))).toBe(true);
    expect(lines.some((l) => /failed/.test(l) && /Undefined control sequence/.test(l))).toBe(true);

    const r2 = await P.prerender([page], { createOptions: { logLevel: 'silent' } });
    expect(r2.existing).toBe(2);
    expect(r2.rendered).toBe(0);
    expect(r2.failed).toBe(1);   // nothing is saved for a figure that does not compile, so it is tried again

    const before = fs.statSync(path.join(saved, files[0])).mtimeMs;
    await new Promise((r) => setTimeout(r, 20));
    const r3 = await P.prerender([page], { force: true, createOptions: { logLevel: 'silent' } });
    expect(r3.rendered).toBe(2);
    expect(fs.statSync(path.join(saved, files[0])).mtimeMs).toBeGreaterThan(before);

    const dry = await P.prerender([page], { force: true, dryRun: true });
    expect(dry.rendered).toBe(0);
    expect(dry.entries.every((e: any) => e.status === 'pending')).toBe(true);
  }, 120_000);

  it('the tag renderer serves a saved figure without starting an engine', async () => {
    const { AutoRenderer } = await import(path.join(REPO, 'dist/auto.js'));
    const [req] = F.extractFigures(PAGE);
    const name = F.figureName(F.figureHash(req));
    const realFetch = globalThis.fetch;
    const urls: string[] = [];
    globalThis.fetch = (async (input: any) => {
      const url = String(input); urls.push(url);
      const file = path.join(saved, path.basename(new URL(url).pathname));
      return fs.existsSync(file) ? new Response(fs.readFileSync(file, 'utf8'), { status: 200 }) : new Response('<!DOCTYPE html><html>not here</html>', { status: 200 });
    }) as any;
    try {
      const ar = new AutoRenderer({ figuresBaseUrl: 'file://' + saved + '/', logLevel: 'silent' });
      const out = await ar.render({ kind: req.kind, source: req.source, attrs: req.attrs });
      expect(out.from).toBe('file');
      expect(out.cached).toBe(true);
      expect(out.name).toBe(name);
      expect(out.svg).toBe(fs.readFileSync(path.join(saved, name), 'utf8'));
      expect(urls).toEqual(['file://' + saved + '/' + name]);
      expect(ar.started).toBe(false);
      expect(ar.figures().map((f: any) => f.name)).toEqual([name]);
      // an element whose figure is not saved (here the server answers with its HTML page) goes to the engine
      const broken = F.extractFigures(PAGE)[2];
      const out2 = await ar.render({ kind: broken.kind, source: broken.source, attrs: broken.attrs });
      expect(out2.from).toBe('engine');
      expect(out2.ok).toBe(false);
      expect(ar.started).toBe(true);
      expect(ar.figures()).toHaveLength(1);   // failures are never kept for saving
      // data-cache="off" skips the saved file too
      urls.length = 0;
      const out3 = await ar.render({ kind: req.kind, source: req.source, attrs: { ...req.attrs, cache: 'off' } });
      expect(out3.from).toBe('engine');
      expect(urls).toEqual([]);
      expect(out3.svg).toBe(out.svg);          // the engine produces the saved bytes
    } finally {
      globalThis.fetch = realFetch;
    }
  }, 120_000);

  it('the CLI lists a dry run and exits 0', () => {
    const out = execFileSync('node', [path.join(REPO, 'dist/cli.js'), '--prerender', '--dry-run', '--force', page], { encoding: 'utf8', cwd: dir });
    expect(out.split('\n').filter((l) => /to render.*\(page\.html\)$/.test(l))).toHaveLength(3);
    expect(out).toMatch(/0 rendered, 0 already saved, 0 failed, 3 to render/);
  }, 60_000);
});
