/**
 * node.ts — Node-specific glue: synchronous bundle I/O from the local
 * filesystem and module loading relative to this package.
 */
import type { BundleIO } from './vfs/bundle.js';

export async function nodeIO(): Promise<BundleIO> {
  const fs = await import('node:fs');
  // file:// URLs or plain paths; the ?v=<sha> on bundle file URLs is for HTTP caches, not the disk
  const strip = (u: string) => (u.startsWith('file://') ? decodeURIComponent(new URL(u).pathname) : u.replace(/\?v=[0-9a-f]+$/, ''));
  return {
    async fetch(url) { return new Uint8Array(fs.readFileSync(strip(url))); },
    fetchSync(url) { return new Uint8Array(fs.readFileSync(strip(url))); },
    async fetchJson(url) { return JSON.parse(fs.readFileSync(strip(url), 'utf8')); },
  };
}

export const isNode = typeof process !== 'undefined' && !!(process as any).versions?.node && typeof (globalThis as any).window === 'undefined';
