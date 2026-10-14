import { getRun } from '@blast/server';
import { INJECTIONS } from '@blast/sim';
import { deps, json, offline, wrongMethod } from '../http';

interface SharedRun {
  id: string;
  name: string;
  summary: { score: number; wave: number; infected: number; endedBy: string; rootPayload: number | null };
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** A tiny page whose preview tags describe the incident, then sends people to the replay. */
export function sharePage(run: SharedRun, origin: string): string {
  const s = run.summary;
  const score = s.score.toLocaleString('en-US');
  const how = s.endedBy === 'leak' ? `Leaked at wave ${s.wave}` : `Stalled at wave ${s.wave}`;
  const title = `${how} · ${score} · Blast Radius`;
  const cause =
    s.endedBy === 'leak' && s.rootPayload !== null
      ? `Root cause: “${INJECTIONS[s.rootPayload] ?? 'an injected instruction'}”`
      : 'The work backed up until the swarm stalled.';
  const desc = `${run.name} held a swarm of AI agents against a prompt-injection worm. ${cause}`;
  const replay = `${origin}/#/replay/${run.id}`;
  const image = `${origin}/api/og?id=${run.id}`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${esc(image)}">
<meta property="og:url" content="${esc(`${origin}/r/${run.id}`)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${esc(image)}">
<meta http-equiv="refresh" content="0; url=${esc(replay)}">
</head><body><p><a href="${esc(replay)}">Watch the replay</a></p></body></html>`;
}

export default async function share(req: Request): Promise<Response> {
  if (req.method !== 'GET') return wrongMethod('GET');
  const d = deps();
  if (!d) return offline();
  const url = new URL(req.url);
  const r = await getRun(d, url.searchParams.get('id') ?? '');
  if (r.status !== 200) return json(r.status, r.body);
  return new Response(sharePage(r.body as SharedRun, url.origin), {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=3600' },
  });
}
