// serve.mjs — a static server for the demo site (site/ + dist/). No special
// headers are needed: the worker uses synchronous XHR, not SharedArrayBuffer.
//   node scripts/serve.mjs [port]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const PORT = Number(process.argv[2] ?? 8080);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.wasm': 'application/wasm', '.json': 'application/json', '.svg': 'image/svg+xml', '.css': 'text/css', '.map': 'application/json', '.fmt': 'application/octet-stream', '.tfm': 'application/octet-stream', '.pfb': 'application/octet-stream', '.mp': 'text/plain; charset=utf-8', '.tex': 'text/plain; charset=utf-8' };
http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/') p = '/site/index.html';
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache', 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`demo: http://localhost:${PORT}/site/`));
