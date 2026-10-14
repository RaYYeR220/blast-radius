import { createClient } from '@supabase/supabase-js';
import { afterAll, describe, expect, it } from 'vitest';
import { MemoryRepo, type Repo, type RunRow, type SessionRow } from '../src/repo';
import { SupabaseRepo } from '../src/supabase';

// The same contract runs against the in-memory store and, when credentials are in the
// environment, against a real Supabase project. Rows it writes are removed afterwards.
const { SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key } = process.env;
const tag = `contract-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const DAY = '1999-01-01';
const written = { runs: [] as string[], sessions: [] as string[], names: [] as string[], rates: [] as string[] };

const uuid = () => crypto.randomUUID();

function run(over: Partial<RunRow> = {}): RunRow {
  const id = uuid();
  written.runs.push(id);
  return {
    id,
    board: 'daily',
    mode: 'daily',
    seed: `${tag}-seed`,
    day: DAY,
    simVersion: 1,
    playerKind: 'human',
    name: 'Contract',
    score: 100,
    waves: 3,
    shipped: 12,
    intercepts: 4,
    infected: 1,
    endedBy: 'leak',
    durationTicks: 4200,
    rootPayload: 7,
    actions: [{ tick: 120, a: { type: 'cut', edge: 3, t: 400 } }],
    outcomeHash: `${tag}-${id}`,
    ownerHash: `${tag}-owner`,
    createdAt: '2026-10-15T12:00:00.000Z',
    ...over,
  };
}

function session(): SessionRow {
  const id = uuid();
  written.sessions.push(id);
  return {
    id,
    seed: `${tag}-seed`,
    mode: 'daily',
    actions: [],
    tick: 0,
    status: 'live',
    agentName: null,
    ownerHash: `${tag}-owner`,
    snapshot: '{"tick":0}',
    version: 0,
    createdAt: '2026-10-15T12:00:00.000Z',
    updatedAt: '2026-10-15T12:00:00.000Z',
  };
}

const stores: [string, () => Repo][] = [['memory', () => new MemoryRepo()]];
if (url && key) stores.push(['supabase', () => new SupabaseRepo(url, key)]);

afterAll(async () => {
  if (!url || !key) return;
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  await db.from('runs').delete().in('id', written.runs);
  await db.from('agent_sessions').delete().in('id', written.sessions);
  await db.from('names').delete().in('name_key', written.names);
  await db.from('rate_limits').delete().in('key', written.rates);
});

describe.each(stores)('repo contract: %s', (store, make) => {
  const repo = make();

  it('stores a run and reads every field back', async () => {
    const row = run();
    expect(await repo.insertRun(row)).toBe('ok');
    const back = await repo.getRun(row.id);
    expect(back).not.toBeNull();
    expect({ ...back!, createdAt: Date.parse(back!.createdAt) }).toEqual({ ...row, createdAt: Date.parse(row.createdAt) });
    expect(await repo.getRun(uuid())).toBeNull();
  });

  it('ranks an outcome only once', async () => {
    const first = run();
    expect(await repo.insertRun(first)).toBe('ok');
    expect(await repo.insertRun(run({ outcomeHash: first.outcomeHash }))).toBe('duplicate');
    expect(await repo.seen(first.outcomeHash, null)).toBe(true);
    expect(await repo.seen(`${tag}-never`, null)).toBe(false);
  });

  it('ranks an endless seed only once', async () => {
    const seed = `${tag}-endless-${uuid()}`;
    expect(await repo.insertRun(run({ board: 'endless', mode: 'endless', day: null, seed }))).toBe('ok');
    expect(await repo.insertRun(run({ board: 'endless', mode: 'endless', day: null, seed }))).toBe('duplicate');
    expect(await repo.seen(`${tag}-never`, seed)).toBe(true);
  });

  it('orders a board by score, earlier run first on a tie, and ranks against it', async () => {
    const day = '1999-02-0' + (stores.findIndex(([n]) => n === store) + 1);
    const a = run({ day, score: 500, createdAt: '2026-10-15T12:00:01.000Z' });
    const b = run({ day, score: 900, createdAt: '2026-10-15T12:00:02.000Z' });
    const c = run({ day, score: 500, createdAt: '2026-10-15T12:00:00.000Z' });
    for (const r of [a, b, c]) expect(await repo.insertRun(r)).toBe('ok');
    expect((await repo.top('daily', day, 10)).map((r) => r.id)).toEqual([b.id, c.id, a.id]);
    expect((await repo.top('daily', day, 2)).map((r) => r.id)).toEqual([b.id, c.id]);
    const stored = (await repo.getRun(a.id))!;
    expect(await repo.rankOf('daily', day, stored.score, stored.createdAt)).toBe(3);
    expect(await repo.rankOf('daily', day, 1000, '2026-10-15T13:00:00.000Z')).toBe(1);
    expect(await repo.top('daily', '1999-03-01', 10)).toEqual([]);
  });

  it('refuses a session write against a stale version', async () => {
    const s = session();
    await repo.createSession(s);
    const actions = [{ tick: 60, a: { type: 'skip' as const } }];
    expect(await repo.updateSession(s.id, { tick: 60, actions, snapshot: '{"tick":60}' }, 0)).toBe(true);
    expect(await repo.updateSession(s.id, { tick: 61 }, 0)).toBe(false);
    const back = (await repo.getSession(s.id))!;
    expect(back.version).toBe(1);
    expect(back.tick).toBe(60);
    expect(back.actions).toEqual(actions);
    expect(back.snapshot).toBe('{"tick":60}');
    expect(await repo.getSession(uuid())).toBeNull();
  });

  it('gives a name to its first owner, whatever the case', async () => {
    const name = `${tag}-Name`;
    written.names.push(name.toLowerCase());
    expect(await repo.claimName(name, 'owner-a')).toBe('ok');
    expect(await repo.claimName(name.toUpperCase(), 'owner-b')).toBe('taken');
    expect(await repo.claimName(name, 'owner-a')).toBe('ok');
  });

  it('counts hits per window and stops at the limit', async () => {
    const k = `${tag}-rate-${uuid()}`;
    written.rates.push(k);
    const w = Date.parse('2026-10-15T12:00:00Z');
    expect([await repo.bumpRate(k, w, 2), await repo.bumpRate(k, w, 2), await repo.bumpRate(k, w, 2)]).toEqual([true, true, false]);
    expect(await repo.bumpRate(k, w + 3_600_000, 2)).toBe(true);
  });
});
