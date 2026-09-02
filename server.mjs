import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(root, 'public');
export const port = Number(process.env.ATLAS_BROWSER_PORT || 48173);
export const origin = `http://localhost:${port}`;
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
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
      console.log(`ATLAS Browser running at ${origin}`);
      resolve(server);
    });
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startServer();
}
