import { restore, runReplay, stateHash } from '@blast/sim';
import { describe, expect, it } from 'vitest';
import { actRun, startRun, submitAgentRun } from '../src/agent';
import { clientIp } from '../src/mcp';
import { MemoryRepo, type SessionRow } from '../src/repo';
import { deps } from './helpers';

/** Holds every getSession until `n` callers have read, so racing calls really overlap. */
class GatedRepo extends MemoryRepo {
  private waiting: Array<() => void> = [];
  gate = 0;
  override async getSession(id: string): Promise<SessionRow | null> {
    const row = await super.getSession(id);
    if (this.gate > 0) {
      await new Promise<void>((resolve) => {
        this.waiting.push(resolve);
        if (this.waiting.length >= this.gate) {
          for (const w of this.waiting.splice(0)) w();
          this.gate = 0;
        }
      });
    }
    return row;
  }
}

describe('concurrent agent calls', () => {
  it('lets one of two simultaneous acts win and keeps log and snapshot in step', async () => {
    const d = { ...deps(), repo: new GatedRepo() };
    const { run, observation } = (await startRun(d, '1.1.1.1', {})).body as { run: string; observation: { edges: Array<{ id: number }> } };
    d.repo.gate = 2;
    const [a, b] = await Promise.all([
      actRun(d, '1.1.1.1', { run, actions: [{ type: 'cut', edge: observation.edges[0]!.id, t: 300 }], advance: 20 }),
      actRun(d, '1.1.1.1', { run, actions: [{ type: 'cut', edge: observation.edges[1]!.id, t: 700 }], advance: 20 }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const s = d.repo.sessions.get(run)!;
    expect(s.actions).toHaveLength(1);
    const fromLog = runReplay({ v: 1, mode: 'agent', seed: s.seed, actions: s.actions }, { untilTick: s.tick }).state;
    expect(stateHash(fromLog)).toBe(stateHash(restore(s.snapshot)));
  });

  it('submits a finished run only once under a race', async () => {
    const d = { ...deps(), repo: new GatedRepo() };
    const { run } = (await startRun(d, '1.1.1.1', {})).body as { run: string };
    let over = false;
    for (let i = 0; i < 400 && !over; i++) over = ((await actRun(d, '1.1.1.1', { run, actions: [], advance: 120 })).body as { over: boolean }).over;
    expect(over).toBe(true);
    d.repo.gate = 2;
    const [x, y] = await Promise.all([submitAgentRun(d, '1.1.1.1', { run }), submitAgentRun(d, '1.1.1.1', { run })]);
    expect([x.status, y.status].sort()).toEqual([200, 409]);
    expect(d.repo.runs).toHaveLength(1);
  });
});

describe('clientIp', () => {
  it('trusts the platform header over a client-supplied forwarded-for', () => {
    const req = new Request('https://x.test', {
      headers: { 'x-forwarded-for': '6.6.6.6', 'x-vercel-forwarded-for': '1.2.3.4', 'x-real-ip': '1.2.3.4' },
    });
    expect(clientIp(req)).toBe('1.2.3.4');
  });

  it('never takes a bare forwarded-for header at face value', () => {
    expect(clientIp(new Request('https://x.test', { headers: { 'x-forwarded-for': '6.6.6.6' } }))).toBe('unknown');
  });
});

describe('racing human submissions', () => {
  it('ranks the same replay once even when both pass the early check', async () => {
    const { submitRun } = await import('../src/runs');
    const { playToEnd } = await import('./helpers');
    const d = deps();
    const seen = d.repo.seen.bind(d.repo);
    let calls = 0;
    // both requests see "not on the board yet", as they would under a real race
    d.repo.seen = async (...args) => (calls++ < 2 ? false : seen(...args));
    const { replay, score } = playToEnd('daily-2026-10-15', 'daily', 'sloppy');
    const body = JSON.stringify({ replay, score });
    const [a, b] = await Promise.all([submitRun(d, '1.1.1.1', body), submitRun(d, '2.2.2.2', body)]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(d.repo.runs).toHaveLength(1);
  });
});
