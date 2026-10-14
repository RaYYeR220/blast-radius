import { submitRun } from '@blast/server';
import { clientIp, deps, offline, reply, wrongMethod } from '../http';

export default async function runs(req: Request): Promise<Response> {
  if (req.method !== 'POST') return wrongMethod('POST');
  const d = deps();
  if (!d) return offline();
  return reply(await submitRun(d, clientIp(req), await req.text()));
}
