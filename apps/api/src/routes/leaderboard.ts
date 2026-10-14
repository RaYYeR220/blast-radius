import { leaderboard } from '@blast/server';
import { deps, offline, reply, wrongMethod } from '../http';

export default async function board(req: Request): Promise<Response> {
  if (req.method !== 'GET') return wrongMethod('GET');
  const d = deps();
  if (!d) return offline();
  const q = new URL(req.url).searchParams;
  const cache = q.has('around') ? 'no-store' : 'public, s-maxage=15, stale-while-revalidate=60';
  return reply(await leaderboard(d, q), { 'cache-control': cache });
}
