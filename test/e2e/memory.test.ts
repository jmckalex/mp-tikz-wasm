// Memory regression: one MetaPost instance per run must not leak. Before patch
// 0010 an instance leaked ~319 KB (mplib's mp_finish left the symbol table's
// contents) and an animation running an instance per frame died in minutes;
// before 0012 about 1.2 KB remained (TFM dimension nodes, a jump_buf, teardown
// order). The allocator's bytes in use (mpwasm_heap_in_use) must be identical
// before and after 300 runs. Runs after `npm run build`.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const REPO = path.resolve(new URL('../..', import.meta.url).pathname);
const built = fs.existsSync(path.join(REPO, 'dist/index.js')) && fs.existsSync(path.join(REPO, 'dist/mplib.wasm')) && fs.existsSync(path.join(REPO, 'dist/bundles/core/manifest.json'));

describe.skipIf(!built)('memory: repeated runs', () => {
  it("300 runs leave the allocator's bytes in use unchanged", async () => {
    const { MetaPost } = await import(path.join(REPO, 'dist/index.js'));
    const mp: any = await MetaPost.create({ log: () => {}, tex: 'none' });
    const M = mp.backend.core.M;
    const inUse = (): number => M._mpwasm_heap_in_use();
    const src = 'beginfig(1); numeric a; a := 37; pair v[]; for i = 0 upto 7: v[i] := (10i, 5i); endfor for i = 1 upto 7: draw v[i-1] -- v[i] withpen pencircle scaled 1.1 withcolor (0.1,0.3,0.7); endfor fill fullcircle scaled 4 shifted v[3]; endfig; end.';
    for (let i = 0; i < 20; i++) await mp.run(src, { format: 'svg' });   // settle allocator and caches
    const before = inUse();
    for (let i = 0; i < 300; i++) { const r = await mp.run(src, { format: 'svg' }); if (i === 0) expect(r.status).toBe('ok'); }
    const after = inUse();
    mp.dispose();
    expect(before).toBeGreaterThan(0);
    // 319 KB/run before patch 0010 would be ~90 MB here; 1.2 KB/run before 0012 ~360 KB
    expect(after - before).toBe(0);
  }, 120_000);
});
