import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { documentKey, sha256, sha256Hex, snippetKey } from '../../src/ts/tex/cache-key.js';

describe('sha256', () => {
  it('matches the FIPS 180-4 test vectors', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    );
    expect(sha256Hex('a'.repeat(1_000_000))).toBe('cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0');
  });

  it('agrees with node:crypto across block boundaries and on binary input', () => {
    let seed = 7;
    const rnd = (): number => (seed = (seed * 1103515245 + 12345) & 0x7fffffff);
    for (const len of [0, 1, 54, 55, 56, 57, 63, 64, 65, 119, 120, 128, 1000, 4096, 100_003]) {
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) bytes[i] = rnd() & 0xff;
      expect(sha256Hex(bytes)).toBe(createHash('sha256').update(bytes).digest('hex'));
    }
  });

  it('encodes strings as UTF-8', () => {
    expect(sha256Hex('naïve 日本 — ok')).toBe(createHash('sha256').update('naïve 日本 — ok', 'utf8').digest('hex'));
    expect(sha256(new TextEncoder().encode('abc'))).toHaveLength(32);
  });
});

describe('snippetKey', () => {
  const base = { engineId: 'tex-1', formatId: 'latex-2', chain: ['\\usepackage{amsmath}'], body: '$x$' };

  it('is a 64-character lowercase hex string and deterministic', () => {
    const k = snippetKey(base);
    expect(k).toMatch(/^[0-9a-f]{64}$/);
    expect(snippetKey({ ...base })).toBe(k);
  });

  it('changes when any field changes', () => {
    const k = snippetKey(base);
    expect(snippetKey({ ...base, engineId: 'tex-2' })).not.toBe(k);
    expect(snippetKey({ ...base, formatId: 'plain' })).not.toBe(k);
    expect(snippetKey({ ...base, chain: [] })).not.toBe(k);
    expect(snippetKey({ ...base, body: '$y$' })).not.toBe(k);
    expect(snippetKey({ ...base, texscriptmode: 2 })).not.toBe(k);
  });

  it('defaults texscriptmode to 1, MetaPost\'s default', () => {
    expect(snippetKey({ ...base, texscriptmode: 1 })).toBe(snippetKey(base));
  });

  it('is immune to concatenation ambiguity', () => {
    expect(snippetKey({ ...base, chain: ['a', 'b'] })).not.toBe(snippetKey({ ...base, chain: ['ab'] }));
    expect(snippetKey({ ...base, chain: ['a'], body: 'b' })).not.toBe(snippetKey({ ...base, chain: [], body: 'ab' }));
    expect(snippetKey({ ...base, chain: ['ab'], body: '' })).not.toBe(snippetKey({ ...base, chain: ['a'], body: 'b' }));
    expect(snippetKey({ ...base, engineId: 'ab', formatId: '' })).not.toBe(snippetKey({ ...base, engineId: 'a', formatId: 'b' }));
    expect(snippetKey({ ...base, chain: [''] })).not.toBe(snippetKey({ ...base, chain: [] }));
    expect(snippetKey({ ...base, body: '1', texscriptmode: 1 })).not.toBe(snippetKey({ ...base, body: '', texscriptmode: 11 }));
  });

  it('is stable across releases (pinned value)', () => {
    // If this changes, every persisted cache entry is silently invalidated —
    // bump the encoding tag in cache-key.ts deliberately rather than by accident.
    expect(snippetKey({ engineId: 'e', formatId: 'f', chain: ['v'], body: 'b' })).toBe(
      sha256Hex(
        Buffer.concat([
          lp('metapost-wasm:snippet:1'), lp('e'), lp('f'), u32(1), lp('v'), lp('b'), lp('1'),
        ]),
      ),
    );
  });
});

describe('documentKey', () => {
  it('depends on the TeX source, engine and format, and never equals a snippet key', () => {
    const k = documentKey('\\end{document}\n', 'e', 'f');
    expect(k).toMatch(/^[0-9a-f]{64}$/);
    expect(documentKey('\\end{document}\n', 'e', 'f')).toBe(k);
    expect(documentKey('\\end{document}', 'e', 'f')).not.toBe(k);
    expect(documentKey('\\end{document}\n', 'e2', 'f')).not.toBe(k);
    expect(documentKey('\\end{document}\n', 'e', 'f2')).not.toBe(k);
    expect(documentKey('ab', 'c', '')).not.toBe(documentKey('a', 'bc', ''));
    expect(documentKey('b', 'e', 'f')).not.toBe(snippetKey({ engineId: 'e', formatId: 'f', chain: [], body: 'b' }));
  });
});

function u32(n: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n);
  return b;
}
function lp(s: string): Buffer {
  const bytes = Buffer.from(s, 'utf8');
  return Buffer.concat([u32(bytes.length), bytes]);
}
