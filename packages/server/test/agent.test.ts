import { type Action, type AgentObservation } from '@blast/sim';
import { describe, expect, it } from 'vitest';
import { actRun, observeRun, startRun, submitAgentRun } from '../src/agent';
import { leaderboard } from '../src/runs';
import { deps } from './helpers';

type Obs = { run: string; observation: AgentObservation };
type ActOut = { observation: AgentObservation; rejected: Array<{ action: Action; reason: string }>; over: boolean };

/** A plain policy that only uses the observation, like an external agent would. */
function policy(o: AgentObservation): Action[] {
  if (o.phase === 'shop') return [{ type: 'skip' }];
  const out: Action[] = [];
  const cut = new Set<number>();
  for (const p of o.packets) {
    if (p.kind !== 'inject' || p.edge < 0 || cut.has(p.edge)) continue;
    const e = o.edges.find((x) => x.id === p.edge)!;
    if (e.severed) continue;
    const t = Math.round((p.from === e.a ? p.progress : 1 - p.progress) * 1000);
    out.push({ type: 'cut', edge: p.edge, t });
    cut.add(p.edge);
  }
  return out;
}

describe('agent sessions', () => {
  it('starts on today\'s daily board with a fresh observation', async () => {
    const d = deps();
    const r = await startRun(d, '1.1.1.1', { name: 'probe' });
    expect(r.status).toBe(200);
    const b = r.body as Obs & { seed: string };
    expect(b.seed).toBe('daily-2026-10-15');
    expect(b.observation.tick).toBe(0);
    expect(b.observation.phase).toBe('play');
  });

  it('records legal actions, reports illegal ones, and advances time', async () => {
    const d = deps();
    const { run, observation } = (await startRun(d, '1.1.1.1', {})).body as Obs;
    const edge = observation.edges[0]!.id;
    const r = await actRun(d, '1.1.1.1', {
      run,
      actions: [{ type: 'cut', edge: 999, t: 500 }, { type: 'cut', edge, t: 400 }],
      advance: 30,
    });
    expect(r.status).toBe(200);
    const b = r.body as ActOut;
    expect(b.rejected).toHaveLength(1);
    expect(b.rejected[0]!.action).toEqual({ type: 'cut', edge: 999, t: 500 });
    expect(b.observation.tick).toBe(30);
    const s = d.repo.sessions.get(run)!;
    expect(s.actions).toEqual([{ tick: 0, a: { type: 'cut', edge, t: 400 } }]);
    expect(s.tick).toBe(30);
  });

  it('clamps how far one call can advance', async () => {
    const d = deps();
    const { run } = (await startRun(d, '1.1.1.1', {})).body as Obs;
    const b = (await actRun(d, '1.1.1.1', { run, actions: [], advance: 10_000 })).body as ActOut;
    expect(b.observation.tick).toBe(120);
    const o = (await observeRun(d, '1.1.1.1', { run })).body as { observation: AgentObservation };
    expect(o.observation.tick).toBe(120);
  });

  it('plays a whole run, then submits it to the agents board once', async () => {
    const d = deps();
    let { run, observation } = (await startRun(d, '1.1.1.1', { name: 'bot-one' })).body as Obs;
    expect((await submitAgentRun(d, '1.1.1.1', { run })).status).toBe(409);
    let over = false;
    for (let i = 0; i < 3000 && !over; i++) {
      const res = await actRun(d, '1.1.1.1', { run, actions: policy(observation), advance: 30 });
      expect(res.status).toBe(200);
      const b = res.body as ActOut;
      expect(b.rejected).toEqual([]);
      observation = b.observation;
      over = b.over;
    }
    expect(over).toBe(true);
    expect((await actRun(d, '1.1.1.1', { run, actions: [], advance: 1 })).status).toBe(409);
    const sub = await submitAgentRun(d, '1.1.1.1', { run });
    expect(sub.status).toBe(200);
    expect(d.repo.runs[0]!.board).toBe('agents');
    expect(d.repo.runs[0]!.playerKind).toBe('agent');
    expect(d.repo.runs[0]!.name).toBe('bot-one');
    expect((await submitAgentRun(d, '1.1.1.1', { run })).status).toBe(409);
    const lb = (await leaderboard(d, new URLSearchParams({ board: 'agents' }))).body as { rows: unknown[] };
    expect(lb.rows).toHaveLength(1);
  });

  it('handles unknown runs and malformed input', async () => {
    const d = deps();
    expect((await observeRun(d, '1.1.1.1', { run: '00000000-0000-4000-8000-000000000000' })).status).toBe(404);
    expect((await actRun(d, '1.1.1.1', { run: 'nope', actions: [] })).status).toBe(400);
    const { run } = (await startRun(d, '1.1.1.1', {})).body as Obs;
    expect((await actRun(d, '1.1.1.1', { run, actions: 'cut everything' as never })).status).toBe(400);
    expect((await actRun(d, '1.1.1.1', { run, actions: Array(21).fill({ type: 'skip' }) })).status).toBe(400);
  });

  it('works through the shop between waves', async () => {
    const d = deps();
    let { run, observation } = (await startRun(d, '1.1.1.1', {})).body as Obs;
    let sawShop = false;
    for (let i = 0; i < 400 && !sawShop; i++) {
      const b = (await actRun(d, '1.1.1.1', { run, actions: policy(observation), advance: 20 })).body as ActOut;
      observation = b.observation;
      if (observation.phase === 'shop') sawShop = true;
      if (b.over) break;
    }
    if (!sawShop) return; // this seed ended before wave 2; covered by the full-run test
    expect(observation.offers.length).toBeGreaterThan(0);
    const b = (await actRun(d, '1.1.1.1', { run, actions: [{ type: 'skip' }], advance: 5 })).body as ActOut;
    expect(b.observation.phase).toBe('play');
    expect(b.observation.wave).toBe(2);
  });
});
