/**
 * Minimal Node.js HTTP adapter for Hono (avoids a @hono/node-server dependency).
 * Only used by `src/index.ts` for running the server; tests use `app.request()`
 * directly without a server.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { Hono } from 'hono';

export function serve(app: Hono, port: number): void {
  const server = createServer(
    async (req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url ?? '/', `http://localhost:${port}`);
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (Array.isArray(value)) value.forEach((v) => headers.append(key, v));
        else if (value) headers.set(key, value);
      }

      let body: ReadableStream<Uint8Array> | undefined;
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        body = new ReadableStream({
          start(controller) {
            req.on('data', (chunk) => controller.enqueue(new Uint8Array(chunk)));
            req.on('end', () => controller.close());
            req.on('error', (err) => controller.error(err));
          },
        });
      }

      const request = new Request(url, { method: req.method, headers, body, duplex: 'half' });

      try {
        const response = await app.fetch(request);
        const buf = Buffer.from(await response.arrayBuffer());
        const headerObj: Record<string, string> = {};
        response.headers.forEach((v, k) => { headerObj[k] = v; });
        res.writeHead(response.status, headerObj);
        res.end(buf);
      } catch {
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal server error' }));
      }
    },
  );

  server.listen(port);
}
