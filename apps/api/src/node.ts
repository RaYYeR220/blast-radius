import type { IncomingMessage, ServerResponse } from 'node:http';

const MAX_BODY = 300 * 1024;

type WebHandler = (req: Request) => Promise<Response>;

async function readBody(req: IncomingMessage): Promise<Buffer | 'too-large'> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) return 'too-large';
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

/** Runs a Web-standard handler on Node's http server (what Vercel's Node runtime hands us). */
export function toNode(handler: WebHandler) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    try {
      const host = req.headers.host ?? 'localhost';
      const url = new URL(req.url ?? '/', `https://${host}`);
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) {
        if (Array.isArray(v)) for (const x of v) headers.append(k, x);
        else if (v !== undefined) headers.set(k, v);
      }
      const method = req.method ?? 'GET';
      let body: Buffer | undefined;
      if (method !== 'GET' && method !== 'HEAD') {
        const read = await readBody(req);
        if (read === 'too-large') {
          res.writeHead(413, { 'content-type': 'application/json' }).end('{"error":"request too large"}');
          return;
        }
        body = read;
      }
      const response = await handler(new Request(url, { method, headers, body }));
      const out: Record<string, string | string[]> = {};
      response.headers.forEach((v, k) => {
        out[k] = k === 'set-cookie' ? response.headers.getSetCookie() : v;
      });
      res.writeHead(response.status, out);
      if (response.body) {
        for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) res.write(chunk);
      }
      res.end();
    } catch (err) {
      console.error(err);
      if (!res.headersSent) res.writeHead(500, { 'content-type': 'application/json' });
      res.end('{"error":"something went wrong"}');
    }
  };
}
