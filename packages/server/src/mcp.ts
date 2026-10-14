import { createMcpHandler } from 'mcp-handler';
import { z } from 'zod';
import { actRun, observeRun, RULES, startRun, submitAgentRun } from './agent';
import type { ApiResult, Deps } from './runs';

const action = z.discriminatedUnion('type', [
  z.object({ type: z.literal('cut'), edge: z.number().int(), t: z.number().int().min(0).max(1000) }),
  z.object({ type: z.literal('quarantine'), node: z.number().int() }),
  z.object({ type: z.literal('pick'), slot: z.union([z.literal(0), z.literal(1), z.literal(2)]) }),
  z.object({ type: z.literal('reroll') }),
  z.object({ type: z.literal('skip') }),
]);

const run = z.string().describe('The run id returned by start_run.');

function toTool(r: ApiResult) {
  const text = JSON.stringify(r.body);
  return r.status === 200 ? { content: [{ type: 'text' as const, text }] } : { isError: true, content: [{ type: 'text' as const, text }] };
}

/**
 * The caller's address as the hosting platform reports it. A client can send
 * its own X-Forwarded-For, so that header is never trusted on its own.
 */
export function clientIp(req: Request): string {
  return req.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip')?.trim() || 'unknown';
}

/** A remote MCP endpoint over which any agent can play the daily board. */
export function createBlastMcp(d: Deps): (req: Request) => Promise<Response> {
  return (req) => {
    const ip = clientIp(req);
    const handler = createMcpHandler(
      (server) => {
        server.registerTool(
          'start_run',
          {
            title: 'Start a run',
            description: `Starts a new game and returns its id, the rules and the first observation. Daily runs are ranked on the agents board; endless runs are practice.\n\n${RULES}`,
            inputSchema: z.object({
              mode: z.enum(['daily', 'endless']).optional().describe('daily (ranked, default) or endless (practice).'),
              name: z.string().max(40).optional().describe('Name to show on the agents board.'),
              key: z.string().min(8).max(128).optional().describe('A secret of yours; reuse it to keep your name across runs.'),
            }),
          },
          async (args) => toTool(await startRun(d, ip, args)),
        );
        server.registerTool(
          'observe',
          {
            title: 'Look at the board',
            description:
              'Returns the current observation without advancing time: nodes, edges, packets (with their text), credits, backlog, capacity and any open shop offers.',
            inputSchema: z.object({ run }),
          },
          async (args) => toTool(await observeRun(d, ip, args)),
        );
        server.registerTool(
          'act',
          {
            title: 'Act, then let time run',
            description:
              'Applies up to 20 actions at the current tick, then advances `advance` ticks (1–120, 60 ticks = 1 s; stops early at the shop or at game over). Illegal actions are returned in `rejected` and never recorded. Actions: cut {edge, t 0..1000 from edge.a} · quarantine {node} · pick {slot} · reroll · skip.',
            inputSchema: z.object({
              run,
              actions: z.array(action).max(20).default([]),
              advance: z.number().int().min(1).max(120).default(30),
            }),
          },
          async (args) => toTool(await actRun(d, ip, args)),
        );
        server.registerTool(
          'submit',
          {
            title: 'Submit a finished run',
            description:
              'Puts a finished daily run on the agents board. The server re-simulates the whole action log before it ranks anything.',
            inputSchema: z.object({ run, name: z.string().max(40).optional() }),
          },
          async (args) => toTool(await submitAgentRun(d, ip, args)),
        );
      },
      { serverInfo: { name: 'blast-radius', version: '1.0.0' } },
    );
    return handler(req);
  };
}
