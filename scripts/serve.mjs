// dist/를 GitHub Pages 프로젝트 사이트처럼 하위 경로(/cof/)에서 미리 보는 로컬 서버.
// 사용법: npm run serve  →  http://localhost:4173/cof/
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const DIST = path.resolve(import.meta.dirname, '..', 'dist');
const BASE = '/cof/';
const PORT = Number(process.env.PORT) || 4173;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.woff2': 'font/woff2',
  '.ics': 'text/calendar; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/') {
    res.writeHead(302, { Location: BASE }).end();
    return;
  }
  let rel = url.pathname.startsWith(BASE) ? decodeURIComponent(url.pathname.slice(BASE.length)) : null;
  if (rel !== null && (rel === '' || rel.endsWith('/'))) rel += 'index.html';
  const file = rel !== null ? path.join(DIST, rel) : null;
  try {
    if (!file || !file.startsWith(DIST + path.sep) || !(await stat(file)).isFile()) throw new Error('not found');
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404, { 'Content-Type': TYPES['.html'] });
    res.end(await readFile(path.join(DIST, '404.html')).catch(() => 'Not found'));
  }
}).listen(PORT, () => console.log(`http://localhost:${PORT}${BASE}`));
