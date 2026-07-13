import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { Hono } from 'hono';

export interface ServeOptions {
  maxBodyBytes: number;
}

export function serve(app: Hono, port: number, options: ServeOptions): Server {
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    try {
      const url = new URL(req.url ?? '/', `http://localhost:${port}`);
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (Array.isArray(value)) value.forEach((item) => headers.append(key, item));
        else if (value) headers.set(key, value);
      }
      headers.set('x-rpr-peer-ip', req.socket.remoteAddress ?? 'unknown');

      const declared = Number(headers.get('content-length') ?? 0);
      if (Number.isFinite(declared) && declared > options.maxBodyBytes) {
        respondJson(res, 413, { error: 'Request body too large' });
        return;
      }
      let body: Uint8Array | undefined;
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        const chunks: Buffer[] = [];
        let size = 0;
        for await (const chunk of req) {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
          size += buffer.byteLength;
          if (size > options.maxBodyBytes) {
            respondJson(res, 413, { error: 'Request body too large' });
            req.destroy();
            return;
          }
          chunks.push(buffer);
        }
        body = Buffer.concat(chunks);
      }
      const request = new Request(url, { method: req.method, headers, body });
      const response = await app.fetch(request);
      const buffer = Buffer.from(await response.arrayBuffer());
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => { responseHeaders[key] = value; });
      res.writeHead(response.status, responseHeaders);
      res.end(buffer);
    } catch (error) {
      console.error(JSON.stringify({ level: 'error', event: 'request_failed', message: error instanceof Error ? error.message : 'unknown' }));
      if (!res.headersSent) respondJson(res, 500, { error: 'Internal server error' });
      else res.end();
    }
  });
  server.listen(port);
  return server;
}

function respondJson(res: ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(payload));
}
