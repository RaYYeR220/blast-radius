import { issueSeed } from '@blast/server';
import { clientIp, deps, offline, reply, wrongMethod } from '../http';

export default async function seed(req: Request): Promise<Response> {
  if (req.method !== 'POST') return wrongMethod('POST');
  const d = deps();
  if (!d) return offline();
  return reply(await issueSeed(d, clientIp(req)));
}
