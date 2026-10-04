// Guards for the stale-HTTP-cache failure (session 12): a browser reused an old font
// map after a new font was bundled, dvisvgm dropped the glyphs without failing, and
// the empty figure was cached as a success.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { BundleSet, browserIO } from '../../src/ts/vfs/bundle.js';
import { danglingRefs } from '../../src/ts/core.js';

describe('bundle file URLs carry the file hash', () => {
  it('appends ?v=<sha> from the manifest, and nothing without one', async () => {
    const manifest = { name: 'b', version: '1', files: { 'fonts/map/ps2pk.map': { size: 3, sha: 'abc123def4567890' }, 'tex/x.sty': { size: 1 } } };
    const set = new BundleSet({ fetch: async () => new Uint8Array(), fetchJson: async () => manifest });
    await set.add({ name: 'b', manifestUrl: 'https://h/bundles/b/manifest.json' });
    expect(set.files.get('fonts/map/ps2pk.map')!.url).toBe('https://h/bundles/b/files/fonts/map/ps2pk.map?v=abc123def4567890');
    expect(set.files.get('tex/x.sty')!.url).toBe('https://h/bundles/b/files/tex/x.sty');
  });
});

describe('manifests are revalidated', () => {
  afterEach(() => vi.unstubAllGlobals());
  it("fetches JSON with cache: 'no-cache'", async () => {
    const calls: [string, RequestInit | undefined][] = [];
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => { calls.push([url, init]); return new Response('{"files":{}}'); });
    await browserIO().fetchJson('https://h/bundles/b/manifest.json');
    expect(calls[0][1]?.cache).toBe('no-cache');
  });
});

describe('danglingRefs', () => {
  it('finds glyph references with no definition, and none in a whole SVG', () => {
    expect(danglingRefs(`<svg><defs><path id='g1-65' d='M0 0'/></defs><use xlink:href='#g1-65'/><use xlink:href='#g1-66'/></svg>`)).toEqual(['g1-66']);
    expect(danglingRefs(`<svg><defs><path id="a"/></defs><use href="#a"/></svg>`)).toEqual([]);
  });
});
