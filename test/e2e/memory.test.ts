// Memory regression: one MetaPost instance per run must not leak. Before
// patches 0010/0011 an instance leaked ~319 KB (mplib's mp_finish left the
// symbol table's contents) and an animation running an instance per frame
// died in minutes. Runs after `npm run build`.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const REPO = path.resolve(new URL('../..', import.meta.url).pathname);
const built = fs.existsSync(path.join(REPO, 'dist/index.js')) && fs.existsSync(path.join(REPO, 'dist/mplib.wasm')) && fs.existsSync(path.join(REPO, 'dist/bundles/core/manifest.json'));

describe.skipIf(!built)('memory: repeated runs', () => {
  it('300 runs grow the wasm heap by less than 4 MB', async () => {
    const { MetaPost } = await import(path.join(REPO, 'dist/index.js'));
    const mp: any = await MetaPost.create({ log: () => {}, tex: 'none' });
    const heap = () => (mp.backend.core.M.HEAPU8.length as number) / 1048576;
    const src = 'beginfig(1); numeric a; a := 37; pair v[]; for i = 0 upto 7: v[i] := (10i, 5i); endfor for i = 1 upto 7: draw v[i-1] -- v[i] withpen pencircle scaled 1.1 withcolor (0.1,0.3,0.7); endfor fill fullcircle scaled 4 shifted v[3]; endfig; end.';
    for (let i = 0; i < 20; i++) await mp.run(src, { format: 'svg' });   // settle allocator and caches
    const before = heap();
    for (let i = 0; i < 300; i++) { const r = await mp.run(src, { format: 'svg' }); if (i === 0) expect(r.status).toBe('ok'); }
    const growth = heap() - before;
    mp.dispose();
    // the old leak would show ~90 MB here; the residual 1.2 KB/run is ~0.4 MB
    expect(growth).toBeLessThan(4);
  }, 120_000);
});
