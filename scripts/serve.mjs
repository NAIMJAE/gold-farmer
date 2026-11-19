import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

export function serve() {
  const root = resolve(fileURLToPath(new URL('../dist', import.meta.url)));
  const port = Number(process.env.PORT || 5173);
  const types = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8'};
  const server = createServer(async (req,res) => {
    try {
      if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
      const url = new URL(req.url,'http://localhost');
      const path = resolve(root,'.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
      if (!path.startsWith(root + sep)) { res.writeHead(403); res.end(); return; }
      const body = await readFile(path);
      res.writeHead(200,{'Content-Type':types[extname(path)] || 'application/octet-stream','Cache-Control':'no-store'});
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch { res.writeHead(404); res.end('Not found'); }
  });
  server.listen(port,'127.0.0.1',() => console.log(`Local: http://127.0.0.1:${port}`));
  return server;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) serve();
