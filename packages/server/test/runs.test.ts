import { describe, expect, it } from 'vitest';
import { type Deps, getRun, issueSeed, leaderboard, submitRun } from '../src/runs';
import { deps, playToEnd } from './helpers';

const body = (o: object) => JSON.stringify(o);

/** An endless run on a seed the server issued, ready to submit. */
async function endless(d: Deps, bot: 'idle' | 'sloppy' = 'idle') {
  const t = (await issueSeed(d, '7.7.7.7')).body as { seed: string; token: string };
  return { ...playToEnd(t.seed, 'endless', bot), token: t.token };
}

describe('submitRun', () => {
  it('accepts an honest endless run and ranks it', async () => {
    const d = deps();
    const { replay, score, token } = await endless(d);
    const r = await submitRun(d, '1.1.1.1', body({ replay, score, token, name: 'ada' }));
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ score, rank: 1, board: 'endless' });
    const stored = d.repo.runs[0]!;
    expect(stored.name).toBe('ada');
    expect(stored.actions).toEqual(replay.actions);
  });

  it('rejects a tampered score', async () => {
    const d = deps();
    const { replay, score, token } = await endless(d);
    const r = await submitRun(d, '1.1.1.1', body({ replay, score: score + 50, token }));
    expect(r.status).toBe(422);
  });

  it('rejects a replay with an illegal action', async () => {
    const d = deps();
    const { replay, score, token } = await endless(d);
    replay.actions.unshift({ tick: 0, a: { type: 'quarantine', node: 0 } });
    expect((await submitRun(d, '1.1.1.1', body({ replay, score, token }))).status).toBe(422);
  });

  it('only takes today\'s daily, with a short grace for yesterday', async () => {
    const today = playToEnd('daily-2026-10-15', 'daily');
    expect((await submitRun(deps(), '1.1.1.1', body(today))).status).toBe(200);
    const yesterday = playToEnd('daily-2026-10-14', 'daily');
    expect((await submitRun(deps(), '1.1.1.1', body(yesterday))).status).toBe(422);
    const grace = deps(Date.parse('2026-10-15T00:40:00Z'));
    expect((await submitRun(grace, '1.1.1.1', body(yesterday))).status).toBe(200);
  });

  it('refuses agent-mode replays on the human endpoint', async () => {
    const { replay, score } = playToEnd('a-1', 'agent');
    expect((await submitRun(deps(), '1.1.1.1', body({ replay, score }))).status).toBe(400);
  });

  it('rejects oversized and malformed bodies', async () => {
    expect((await submitRun(deps(), '1.1.1.1', 'x'.repeat(300 * 1024))).status).toBe(413);
    expect((await submitRun(deps(), '1.1.1.1', '{nope')).status).toBe(400);
    expect((await submitRun(deps(), '1.1.1.1', body({ replay: 7, score: 1 }))).status).toBe(400);
  });

  it('rate-limits a single caller', async () => {
    const d = deps();
    let last = 0;
    for (let i = 0; i < 31; i++) last = (await submitRun(d, '9.9.9.9', '{nope')).status;
    expect(last).toBe(429);
    expect((await submitRun(d, '8.8.8.8', '{nope')).status).toBe(400);
  });
});

describe('leaderboard', () => {
  it('orders by score, ranks ties by time, and finds a caller outside the top', async () => {
    const d = deps();
    const ids: string[] = [];
    for (let i = 0; i < 4; i++) {
      const { replay, score, token } = await endless(d, i % 2 ? 'sloppy' : 'idle');
      const r = await submitRun(d, `10.0.0.${i}`, body({ replay, score, token, name: `p${i}xx` }));
      ids.push((r.body as { id: string }).id);
    }
    const res = await leaderboard(d, new URLSearchParams({ board: 'endless', limit: '2', around: ids[0]! }));
    expect(res.status).toBe(200);
    const b = res.body as { rows: Array<{ score: number; rank: number }>; me: { rank: number } | null };
    expect(b.rows).toHaveLength(2);
    expect(b.rows[0]!.score).toBeGreaterThanOrEqual(b.rows[1]!.score);
    expect(b.rows[0]!.rank).toBe(1);
    expect(b.me).not.toBeNull();
  });

  it('validates its query', async () => {
    expect((await leaderboard(deps(), new URLSearchParams({ board: 'nope' }))).status).toBe(400);
    expect((await leaderboard(deps(), new URLSearchParams({ board: 'daily', day: '14-10-2026' }))).status).toBe(400);
  });
});

describe('getRun', () => {
  it('returns a stored replay, 404s unknown ids and 400s junk', async () => {
    const d = deps();
    const { replay, score, token } = await endless(d);
    const id = ((await submitRun(d, '1.1.1.1', body({ replay, score, token }))).body as { id: string }).id;
    const ok = await getRun(d, id);
    expect(ok.status).toBe(200);
    expect((ok.body as { replay: { seed: string } }).replay.seed).toBe(replay.seed);
    expect((await getRun(d, '00000000-0000-4000-8000-000000000000')).status).toBe(404);
    expect((await getRun(d, 'drop table')).status).toBe(400);
  });
});

describe('malformed action entries', () => {
  it('get a 4xx, never a crash', async () => {
    const d = deps();
    const replay = { v: 1, mode: 'daily', seed: 'daily-2026-10-15', actions: [null, { tick: 1 }] };
    const r = await submitRun(d, '1.1.1.1', body({ replay, score: 0 }));
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(r.status).toBeLessThan(500);
  });
});
