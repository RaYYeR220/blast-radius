import { getRun } from '@blast/server';
import type { Replay } from '@blast/sim';
import { deps, json, offline, wrongMethod } from '../http';
import { renderCard } from '../og/card';

/** The share card for a ranked run, as a PNG. */
export default async function og(req: Request): Promise<Response> {
  if (req.method !== 'GET') return wrongMethod('GET');
  const d = deps();
  if (!d) return offline();
  const r = await getRun(d, new URL(req.url).searchParams.get('id') ?? '');
  if (r.status !== 200) return json(r.status, r.body);
  const run = r.body as { name: string; replay: Replay };
  const png = await renderCard(run);
  return new Response(Buffer.from(png), { headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=31536000, immutable' } });
}
