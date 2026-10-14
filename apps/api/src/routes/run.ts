import { getRun } from '@blast/server';
import { deps, offline, reply, wrongMethod } from '../http';

export default async function run(req: Request): Promise<Response> {
  if (req.method !== 'GET') return wrongMethod('GET');
  const d = deps();
  if (!d) return offline();
  const id = new URL(req.url).searchParams.get('id') ?? '';
  return reply(await getRun(d, id), { 'cache-control': 'public, max-age=86400, immutable' });
}
