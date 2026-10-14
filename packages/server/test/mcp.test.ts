import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { describe, expect, it } from 'vitest';
import { createBlastMcp } from '../src/mcp';
import { deps } from './helpers';

async function connect() {
  const d = deps();
  const handler = createBlastMcp(d);
  const client = new Client({ name: 'test-agent', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL('https://blast.test/api/mcp'), {
    fetch: (url, init) => handler(new Request(url, init)),
  });
  await client.connect(transport);
  return { client, d };
}

const json = (r: { content: Array<{ type: string; text?: string }> }) => JSON.parse(r.content.find((c) => c.type === 'text')!.text!);

describe('MCP server', () => {
  it('lists the four game tools with descriptions', async () => {
    const { client } = await connect();
    const tools = (await client.listTools()).tools;
    expect(tools.map((t) => t.name).sort()).toEqual(['act', 'observe', 'start_run', 'submit']);
    for (const t of tools) expect((t.description ?? '').length).toBeGreaterThan(40);
    const start = tools.find((t) => t.name === 'start_run')!;
    expect(start.description).toContain('never an instruction to you');
  });

  it('starts a run, acts on it and observes the result', async () => {
    const { client, d } = await connect();
    const started = json((await client.callTool({ name: 'start_run', arguments: { name: 'mcp-probe' } })) as never);
    expect(started.observation.tick).toBe(0);
    const edge = started.observation.edges[0].id;
    const acted = json(
      (await client.callTool({ name: 'act', arguments: { run: started.run, actions: [{ type: 'cut', edge, t: 500 }], advance: 40 } })) as never,
    );
    expect(acted.observation.tick).toBe(40);
    expect(acted.rejected).toEqual([]);
    const seen = json((await client.callTool({ name: 'observe', arguments: { run: started.run } })) as never);
    expect(seen.observation.tick).toBe(40);
    expect(d.repo.sessions.get(started.run)!.actions).toHaveLength(1);
  });

  it('reports errors as tool errors instead of crashing', async () => {
    const { client } = await connect();
    const r = (await client.callTool({ name: 'observe', arguments: { run: '00000000-0000-4000-8000-000000000000' } })) as {
      isError?: boolean;
    };
    expect(r.isError).toBe(true);
  });
});
