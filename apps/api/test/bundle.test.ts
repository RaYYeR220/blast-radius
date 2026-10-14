import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createServer, type RequestListener } from 'node:http';
import type { AddressInfo } from 'node:net';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

const OUT = resolve(__dirname, '../../../.vercel/output');
const fn = (name: string) => resolve(OUT, `functions/api/${name}.func`);

async function serve(name: string) {
  const mod = (await import(pathToFileURL(resolve(fn(name), 'index.mjs')).href)) as { default: RequestListener };
  const server = createServer(mod.default);
  await new Promise<void>((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { base, close: () => server.close() };
}

describe('Vercel build output', () => {
  beforeAll(() => {
    process.env.BLAST_MEMORY_STORE = '1';
    process.env.IP_HASH_SALT = 'bundle-test-salt';
    execFileSync(process.execPath, ['build.mjs', '--skip-web'], { cwd: resolve(__dirname, '..'), stdio: 'pipe' });
  }, 120_000);

  it('writes a v3 config and one function per route', () => {
    const config = JSON.parse(readFileSync(resolve(OUT, 'config.json'), 'utf8'));
    expect(config.version).toBe(3);
    for (const name of ['runs', 'seed', 'leaderboard', 'run', 'agent', 'mcp']) {
      expect(existsSync(resolve(fn(name), 'index.mjs'))).toBe(true);
      const vc = JSON.parse(readFileSync(resolve(fn(name), '.vc-config.json'), 'utf8'));
      expect(vc.launcherType).toBe('Nodejs');
    }
  });

  it('serves seeds and refuses a bad run from the bundled functions', async () => {
    const seed = await serve('seed');
    const s = await (await fetch(`${seed.base}/api/seed`, { method: 'POST' })).json();
    expect(s.seed).toMatch(/^e-/);
    seed.close();
    const runs = await serve('runs');
    const bad = await fetch(`${runs.base}/api/runs`, { method: 'POST', body: '{"nope":1}' });
    expect(bad.status).toBe(400);
    expect((await fetch(`${runs.base}/api/runs`)).status).toBe(405);
    runs.close();
  });

  it('plays an agent turn and lists MCP tools', async () => {
    const agent = await serve('agent');
    const start = await (await fetch(`${agent.base}/api/agent?op=start`, { method: 'POST', body: '{"name":"smoke"}' })).json();
    expect(start.observation.tick).toBe(0);
    const act = await (
      await fetch(`${agent.base}/api/agent?op=act`, { method: 'POST', body: JSON.stringify({ run: start.run, advance: 60 }) })
    ).json();
    expect(act.observation.tick).toBe(60);
    agent.close();
    const mcp = await serve('mcp');
    const res = await fetch(`${mcp.base}/api/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-06-18' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('start_run');
    mcp.close();
  });

  it('answers 503, not a fake board, when the store is not configured', async () => {
    const lb = resolve(fn('leaderboard'), 'index.mjs');
    const out = execFileSync(
      process.execPath,
      ['-e', `import(${JSON.stringify(pathToFileURL(lb).href)}).then(async (m) => { const http = await import('node:http'); const s = http.createServer(m.default).listen(0, async () => { const r = await fetch('http://127.0.0.1:' + s.address().port + '/api/leaderboard'); console.log(r.status); s.close(); }); })`],
      { env: { ...process.env, BLAST_MEMORY_STORE: '', SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '' } },
    ).toString();
    expect(out.trim()).toBe('503');
  });
});
