/**
 * cache-key.ts — content-addressed keys for the two TeX-bridge caches
 * (docs/05 §6): L2 snippet keys and L1 document keys.
 *
 * Both are SHA-256 over a canonical, length-prefixed encoding, so no two
 * distinct inputs can collide by concatenation ("ab"+"c" vs "a"+"bc"), and a
 * snippet key can never equal a document key (each kind carries its own tag).
 *
 * The digest is computed by a small pure-TypeScript SHA-256 rather than
 * `crypto.subtle.digest`, because the `make_text` hook that consults the
 * snippet cache must answer synchronously and Web Crypto is Promise-only.
 * Dependency-free and browser-safe.
 */

export interface SnippetKeyParts {
  /** Build id of tex.wasm. */
  engineId: string;
  /** Hash of the format file (plain.fmt / latex.fmt). */
  formatId: string;
  /** The verbatimtex blocks that precede the snippet, in source order. */
  chain: readonly string[];
  /** The btex text as handed to make_text. */
  body: string;
  /** MetaPost's `texscriptmode` internal; defaults to 1 like MetaPost. */
  texscriptmode?: number;
}

/* ---- canonical encoding --------------------------------------------------- */

class Encoder {
  private parts: Uint8Array[] = [];
  private total = 0;
  private static readonly utf8 = new TextEncoder();

  private push(bytes: Uint8Array): void {
    this.parts.push(bytes);
    this.total += bytes.length;
  }

  u32(n: number): this {
    if (!Number.isInteger(n) || n < 0 || n > 0xffffffff) throw new RangeError(`u32 out of range: ${n}`);
    this.push(new Uint8Array([(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]));
    return this;
  }

  /** A string as `u32 byteLength` + UTF-8 bytes. */
  str(s: string): this {
    const b = Encoder.utf8.encode(s);
    this.u32(b.length);
    this.push(b);
    return this;
  }

  /** A list of strings as `u32 count` + each string. */
  list(items: readonly string[]): this {
    this.u32(items.length);
    for (const s of items) this.str(s);
    return this;
  }

  bytes(): Uint8Array {
    const out = new Uint8Array(this.total);
    let o = 0;
    for (const p of this.parts) {
      out.set(p, o);
      o += p.length;
    }
    return out;
  }
}

/** Version the encodings so a change in layout can never alias an old key. */
const SNIPPET_TAG = 'metapost-wasm:snippet:1';
const DOCUMENT_TAG = 'metapost-wasm:document:1';

/** L2 key: H(engineId, formatId, verbatimtex chain, body, texscriptmode). */
export function snippetKey(parts: SnippetKeyParts): string {
  const mode = parts.texscriptmode ?? 1;
  const enc = new Encoder()
    .str(SNIPPET_TAG)
    .str(parts.engineId)
    .str(parts.formatId)
    .list(parts.chain)
    .str(parts.body)
    .str(String(mode));
  return sha256Hex(enc.bytes());
}

/** L1 key: H(full generated .tex, engineId, formatId). */
export function documentKey(texSource: string, engineId: string, formatId: string): string {
  const enc = new Encoder().str(DOCUMENT_TAG).str(engineId).str(formatId).str(texSource);
  return sha256Hex(enc.bytes());
}

/* ---- SHA-256 (FIPS 180-4), synchronous ------------------------------------ */

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

/** SHA-256 of `data` (a string is UTF-8 encoded first) as lowercase hex. */
export function sha256Hex(data: Uint8Array | string): string {
  const d = sha256(typeof data === 'string' ? new TextEncoder().encode(data) : data);
  let hex = '';
  for (let i = 0; i < d.length; i++) hex += (d[i] < 16 ? '0' : '') + d[i].toString(16);
  return hex;
}

/** SHA-256 of `msg`, as 32 bytes. */
export function sha256(msg: Uint8Array): Uint8Array {
  const H = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const W = new Uint32Array(64);

  // Padding: 0x80, zeros, then the 64-bit big-endian bit length.
  const len = msg.length;
  const padded = new Uint8Array(((len + 9 + 63) >> 6) << 6);
  padded.set(msg);
  padded[len] = 0x80;
  const bitsHi = Math.floor(len / 0x20000000); // len * 8 / 2^32
  const bitsLo = (len << 3) >>> 0;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, bitsHi);
  view.setUint32(padded.length - 4, bitsLo);

  for (let off = 0; off < padded.length; off += 64) {
    for (let t = 0; t < 16; t++) W[t] = view.getUint32(off + t * 4);
    for (let t = 16; t < 64; t++) {
      const w15 = W[t - 15];
      const w2 = W[t - 2];
      const s0 = ((w15 >>> 7) | (w15 << 25)) ^ ((w15 >>> 18) | (w15 << 14)) ^ (w15 >>> 3);
      const s1 = ((w2 >>> 17) | (w2 << 15)) ^ ((w2 >>> 19) | (w2 << 13)) ^ (w2 >>> 10);
      W[t] = (W[t - 16] + s0 + W[t - 7] + s1) >>> 0;
    }
    let a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
    for (let t = 0; t < 64; t++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const T1 = (h + S1 + ch + K[t] + W[t]) >>> 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const T2 = (S0 + maj) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + T1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (T1 + T2) >>> 0;
    }
    H[0] = (H[0] + a) >>> 0;
    H[1] = (H[1] + b) >>> 0;
    H[2] = (H[2] + c) >>> 0;
    H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0;
    H[5] = (H[5] + f) >>> 0;
    H[6] = (H[6] + g) >>> 0;
    H[7] = (H[7] + h) >>> 0;
  }

  const out = new Uint8Array(32);
  const ov = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) ov.setUint32(i * 4, H[i]);
  return out;
}
