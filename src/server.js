// HTTP surface: a small dashboard + an SSE stream of live alerts.
// No framework needed.

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = join(here, '..', 'public');

export function createServer(cfg, log, getStats, getHistory) {
  const clients = new Set();

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname === '/health') {
      return json(res, 200, { ok: true, ...getStats() });
    }

    if (url.pathname === '/api/stats') {
      return json(res, 200, getStats());
    }

    if (url.pathname === '/api/alerts') {
      return json(res, 200, getHistory());
    }

    if (url.pathname === '/events') {
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
        'access-control-allow-origin': '*',
      });
      res.write(`event: hello\ndata: ${JSON.stringify({ stats: getStats() })}\n\n`);
      for (const a of getHistory().slice(-20)) res.write(`event: alert\ndata: ${JSON.stringify(a)}\n\n`);
      clients.add(res);
      const ping = setInterval(() => res.write(': ping\n\n'), 15_000);
      req.on('close', () => { clearInterval(ping); clients.delete(res); });
      return;
    }

    // static
    let path = url.pathname === '/' ? '/index.html' : url.pathname;
    try {
      const file = await readFile(join(publicDir, path.replace(/\.\.+/g, '')));
      const type = path.endsWith('.html') ? 'text/html' : path.endsWith('.css') ? 'text/css' : 'application/octet-stream';
      res.writeHead(200, { 'content-type': `${type}; charset=utf-8` });
      res.end(file);
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('not found');
    }
  });

  return {
    server,
    async start() {
      await new Promise((r) => server.listen(cfg.httpPort, r));
      log.info(`dashboard on http://localhost:${cfg.httpPort}`);
    },
    broadcast(alert) {
      const payload = `event: alert\ndata: ${JSON.stringify(alert)}\n\n`;
      for (const c of clients) {
        try { c.write(payload); } catch { clients.delete(c); }
      }
    },
    stop() {
      for (const c of clients) c.end();
      clients.clear();
      server.close();
    },
  };
}

function json(res, code, body) {
  res.writeHead(code, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
  res.end(JSON.stringify(body));
}
