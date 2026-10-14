import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Board, Repo, RunRow, SessionRow } from './repo';

interface RunDb {
  id: string;
  board: Board;
  mode: string;
  seed: string;
  day: string | null;
  sim_version: number;
  player_kind: 'human' | 'agent';
  name: string;
  score: number;
  waves: number;
  shipped: number;
  intercepts: number;
  infected: number;
  ended_by: string;
  duration_ticks: number;
  root_payload: number | null;
  actions: RunRow['actions'];
  outcome_hash: string;
  owner_hash: string;
  created_at: string;
}

interface SessionDb {
  id: string;
  seed: string;
  mode: SessionRow['mode'];
  actions: SessionRow['actions'];
  tick: number;
  status: SessionRow['status'];
  agent_name: string | null;
  owner_hash: string;
  snapshot: string;
  version: number;
  created_at: string;
  updated_at: string;
}

const toRun = (r: RunDb): RunRow => ({
  id: r.id,
  board: r.board,
  mode: r.mode,
  seed: r.seed,
  day: r.day,
  simVersion: r.sim_version,
  playerKind: r.player_kind,
  name: r.name,
  score: r.score,
  waves: r.waves,
  shipped: r.shipped,
  intercepts: r.intercepts,
  infected: r.infected,
  endedBy: r.ended_by,
  durationTicks: r.duration_ticks,
  rootPayload: r.root_payload,
  actions: r.actions,
  outcomeHash: r.outcome_hash,
  ownerHash: r.owner_hash,
  createdAt: r.created_at,
});

const fromRun = (r: RunRow): RunDb => ({
  id: r.id,
  board: r.board,
  mode: r.mode,
  seed: r.seed,
  day: r.day,
  sim_version: r.simVersion,
  player_kind: r.playerKind,
  name: r.name,
  score: r.score,
  waves: r.waves,
  shipped: r.shipped,
  intercepts: r.intercepts,
  infected: r.infected,
  ended_by: r.endedBy,
  duration_ticks: r.durationTicks,
  root_payload: r.rootPayload,
  actions: r.actions,
  outcome_hash: r.outcomeHash,
  owner_hash: r.ownerHash,
  created_at: r.createdAt,
});

const toSession = (s: SessionDb): SessionRow => ({
  id: s.id,
  seed: s.seed,
  mode: s.mode,
  actions: s.actions,
  tick: s.tick,
  status: s.status,
  agentName: s.agent_name,
  ownerHash: s.owner_hash,
  snapshot: s.snapshot,
  version: s.version,
  createdAt: s.created_at,
  updatedAt: s.updated_at,
});

function sessionPatch(p: Partial<SessionRow>): Partial<SessionDb> {
  const out: Partial<SessionDb> = {};
  if (p.actions !== undefined) out.actions = p.actions;
  if (p.tick !== undefined) out.tick = p.tick;
  if (p.status !== undefined) out.status = p.status;
  if (p.snapshot !== undefined) out.snapshot = p.snapshot;
  if (p.updatedAt !== undefined) out.updated_at = p.updatedAt;
  if (p.agentName !== undefined) out.agent_name = p.agentName;
  return out;
}

const RUN_COLUMNS =
  'id,board,mode,seed,day,sim_version,player_kind,name,score,waves,shipped,intercepts,infected,ended_by,duration_ticks,root_payload,actions,outcome_hash,owner_hash,created_at';

/** Postgres via Supabase, used with the service-role key on the server only. */
export class SupabaseRepo implements Repo {
  private readonly db: SupabaseClient;

  constructor(url: string, serviceKey: string) {
    this.db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  }

  private check<T>(res: { data: T; error: { message: string; code?: string } | null }): T {
    if (res.error) throw new Error(`database: ${res.error.message}`);
    return res.data;
  }

  async insertRun(row: RunRow): Promise<'ok' | 'duplicate'> {
    const { error } = await this.db.from('runs').insert(fromRun(row));
    if (error?.code === '23505') return 'duplicate';
    if (error) throw new Error(`database: ${error.message}`);
    return 'ok';
  }

  async rankOf(board: Board, day: string | null, score: number, createdAt: string): Promise<number> {
    let q = this.db.from('runs').select('id', { count: 'exact', head: true }).eq('board', board);
    q = day === null ? q.is('day', null) : q.eq('day', day);
    const { count, error } = await q.or(`score.gt.${score},and(score.eq.${score},created_at.lt.${createdAt})`);
    if (error) throw new Error(`database: ${error.message}`);
    return 1 + (count ?? 0);
  }

  async top(board: Board, day: string | null, limit: number): Promise<RunRow[]> {
    let q = this.db.from('runs').select(RUN_COLUMNS).eq('board', board);
    q = day === null ? q.is('day', null) : q.eq('day', day);
    const rows = this.check(await q.order('score', { ascending: false }).order('created_at', { ascending: true }).limit(limit));
    return (rows as unknown as RunDb[]).map(toRun);
  }

  async getRun(id: string): Promise<RunRow | null> {
    const row = this.check(await this.db.from('runs').select(RUN_COLUMNS).eq('id', id).maybeSingle());
    return row ? toRun(row as unknown as RunDb) : null;
  }

  async seen(outcomeHash: string, endlessSeed: string | null): Promise<boolean> {
    const filter = endlessSeed
      ? `outcome_hash.eq.${outcomeHash},and(board.eq.endless,seed.eq.${endlessSeed})`
      : `outcome_hash.eq.${outcomeHash}`;
    const { count, error } = await this.db.from('runs').select('id', { count: 'exact', head: true }).or(filter);
    if (error) throw new Error(`database: ${error.message}`);
    return (count ?? 0) > 0;
  }

  async createSession(row: SessionRow): Promise<void> {
    this.check(
      await this.db.from('agent_sessions').insert({
        id: row.id,
        seed: row.seed,
        mode: row.mode,
        actions: row.actions,
        tick: row.tick,
        status: row.status,
        agent_name: row.agentName,
        owner_hash: row.ownerHash,
        snapshot: row.snapshot,
        version: row.version,
        created_at: row.createdAt,
        updated_at: row.updatedAt,
      }),
    );
  }

  async getSession(id: string): Promise<SessionRow | null> {
    const row = this.check(await this.db.from('agent_sessions').select('*').eq('id', id).maybeSingle());
    return row ? toSession(row as SessionDb) : null;
  }

  async updateSession(id: string, patch: Partial<SessionRow>, expectedVersion: number): Promise<boolean> {
    const rows = this.check(
      await this.db
        .from('agent_sessions')
        .update({ ...sessionPatch(patch), version: expectedVersion + 1 })
        .eq('id', id)
        .eq('version', expectedVersion)
        .select('id'),
    );
    return (rows as unknown[]).length === 1;
  }

  async claimName(name: string, ownerHash: string): Promise<'ok' | 'taken'> {
    const key = name.toLowerCase();
    const ins = await this.db.from('names').upsert({ name_key: key, owner_hash: ownerHash }, { onConflict: 'name_key', ignoreDuplicates: true });
    if (ins.error) throw new Error(`database: ${ins.error.message}`);
    const row = this.check(await this.db.from('names').select('owner_hash').eq('name_key', key).single());
    return (row as { owner_hash: string }).owner_hash === ownerHash ? 'ok' : 'taken';
  }

  async bumpRate(key: string, windowStart: number, limit: number): Promise<boolean> {
    const ok = this.check(
      await this.db.rpc('bump_rate', { p_key: key, p_window: new Date(windowStart).toISOString(), p_limit: limit }),
    );
    return ok === true;
  }
}
