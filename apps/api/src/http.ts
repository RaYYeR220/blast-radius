import { type ApiResult, clientIp, type Deps, MemoryRepo, SupabaseRepo } from '@blast/server';

let cached: Deps | null | undefined;

/**
 * The store behind the boards. Production needs all three env vars; without them
 * the API answers 503 instead of quietly keeping scores in memory. Local
 * development can opt into an in-memory store with BLAST_MEMORY_STORE=1.
 */
export function deps(): Deps | null {
  if (cached !== undefined) return cached;
  const { SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key, IP_HASH_SALT: salt, BLAST_MEMORY_STORE: memory } = process.env;
  if (memory === '1') cached = { repo: new MemoryRepo(), now: () => Date.now(), salt: salt ?? 'local-dev-salt' };
  else if (url && key && salt) cached = { repo: new SupabaseRepo(url, key), now: () => Date.now(), salt };
  else cached = null;
  return cached;
}

export function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

export const reply = (r: ApiResult, headers: Record<string, string> = {}) =>
  json(r.status, r.body, r.status === 200 ? headers : {});

export const offline = () => json(503, { error: 'the boards are offline right now; the game itself still works' });
export const wrongMethod = (allowed: string) => json(405, { error: `use ${allowed}` }, { allow: allowed });

export { clientIp };
