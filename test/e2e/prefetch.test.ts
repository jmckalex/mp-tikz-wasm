// The hot lists (dist/bundles/hot.json) and MetaPost.create({ prefetch }):
// the files a first run needs are fetched in parallel before it, so a slow
// host does not pay one round trip per file. Runs after `npm run build`.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const REPO = path.resolve(new URL('../..', import.meta.url).pathname);
const hotFile = path.join(REPO, 'dist/bundles/hot.json');
const built = fs.existsSync(path.join(REPO, 'dist/index.js')) && fs.existsSync(hotFile);

describe.skipIf(!built)('prefetch: hot lists', () => {
  it('hot.json names the files of each kind of first run', () => {
    const hot = JSON.parse(fs.readFileSync(hotFile, 'utf8'));
    for (const kind of ['metapost', 'latex', 'lualatex', 'plain']) expect(hot.kinds[kind].length, kind).toBeGreaterThan(10);
    expect(hot.kinds.latex).toContain('tex/latex/base/article.cls');
    expect(hot.kinds.metapost).toContain('metapost/base/plain.mp');
  });
  it('create({ prefetch }) fetches them and the run still works', async () => {
    const { MetaPost } = await import(path.join(REPO, 'dist/index.js'));
    const mp: any = await MetaPost.create({ logLevel: 'silent', prefetch: ['latex'] });
    const again = await mp.prefetch(['latex']);
    expect(again).toBe(0);                        // everything was already in memory
    const more = await mp.prefetch(['plain']);
    expect(more).toBeGreaterThan(0);
    const r = await mp.latex('\\documentclass[tikz,border=2pt]{standalone}\\begin{document}\\tikz\\draw (0,0) circle (1);\\end{document}', { snapshot: 'none' });
    expect(r.status).toBe('ok');
    mp.dispose();
  }, 60_000);
});
