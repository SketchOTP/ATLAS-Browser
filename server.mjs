import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(root, 'public');
const port = Number(process.env.ATLAS_BROWSER_PORT || 48173);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  if (url.pathname === '/api/embed-check') {
    try {
      const target = new URL(url.searchParams.get('url'));
      if (!['http:', 'https:'].includes(target.protocol)) throw new Error('Unsupported protocol');
      const upstream = await fetch(target, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(5000) });
      const frameOptions = (upstream.headers.get('x-frame-options') || '').toLowerCase();
      const csp = (upstream.headers.get('content-security-policy') || '').toLowerCase();
      const frameAncestors = csp.match(/frame-ancestors\s+([^;]+)/)?.[1] || '';
      const blocked = frameOptions.includes('deny') || frameOptions.includes('sameorigin') || (frameAncestors && !frameAncestors.includes('*') && !frameAncestors.includes('localhost'));
      response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify({ blocked: Boolean(blocked), finalUrl: upstream.url }));
    } catch (error) {
      response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify({ blocked: true, reason: error.message }));
    }
    return;
  }
  const requested = url.pathname === '/' ? '/index.html' : url.pathname;
  const filePath = path.resolve(publicDir, `.${requested}`);
  if (!filePath.startsWith(publicDir)) { response.writeHead(403); response.end('Forbidden'); return; }
  try {
    const content = await fs.readFile(filePath);
    response.writeHead(200, { 'Content-Type': types[path.extname(filePath)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    response.end(content);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  }
});

export function startServer() {
  if (server.listening) return Promise.resolve(server);
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, () => {
      server.off('error', reject);
      console.log(`ATLAS Browser running at http://localhost:${port}`);
      resolve(server);
    });
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startServer();
}
