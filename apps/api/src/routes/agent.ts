import { actRun, observeRun, startRun, submitAgentRun } from '@blast/server';
import { clientIp, deps, json, offline, reply, wrongMethod } from '../http';

const ops = { start: startRun, observe: observeRun, act: actRun, submit: submitAgentRun } as const;

/** POST /api/agent/{start|observe|act|submit} with a JSON body. */
export default async function agent(req: Request): Promise<Response> {
  if (req.method !== 'POST') return wrongMethod('POST');
  const op = new URL(req.url).searchParams.get('op') ?? '';
  if (!(op in ops)) return json(404, { error: 'use /api/agent/start, /observe, /act or /submit' });
  const d = deps();
  if (!d) return offline();
  let body: Record<string, unknown>;
  try {
    const raw = await req.text();
    body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    return json(400, { error: 'body must be JSON' });
  }
  if (!body || typeof body !== 'object') return json(400, { error: 'body must be a JSON object' });
  return reply(await ops[op as keyof typeof ops](d, clientIp(req), body as never));
}
