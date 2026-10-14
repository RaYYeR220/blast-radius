import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import { toNode } from '../src/node';

async function serve(handler: (req: Request) => Promise<Response>) {
  const server = createServer(toNode(handler));
  await new Promise<void>((r) => server.listen(0, r));
  const { port } = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}`, close: () => server.close() };
}

describe('toNode', () => {
  it('passes method, path, query, headers and body through, and writes the response back', async () => {
    const s = await serve(async (req) => {
      const u = new URL(req.url);
      return Response.json(
        { method: req.method, path: u.pathname, q: u.searchParams.get('x'), h: req.headers.get('x-test'), body: await req.text() },
        { status: 201, headers: { 'x-out': 'yes' } },
      );
    });
    const res = await fetch(`${s.url}/api/thing?x=1`, { method: 'POST', headers: { 'x-test': 'hi' }, body: '{"a":1}' });
    expect(res.status).toBe(201);
    expect(res.headers.get('x-out')).toBe('yes');
    expect(await res.json()).toEqual({ method: 'POST', path: '/api/thing', q: '1', h: 'hi', body: '{"a":1}' });
    s.close();
  });

  it('turns a thrown error into a 500 without leaking it', async () => {
    const s = await serve(async () => {
      throw new Error('secret stack');
    });
    const res = await fetch(`${s.url}/`);
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain('secret');
    s.close();
  });
});
