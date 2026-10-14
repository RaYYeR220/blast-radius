import { describe, expect, it } from 'vitest';
import { actRun, startRun, submitAgentRun } from '../src/agent';
import { submitRun } from '../src/runs';
import { deps, playToEnd } from './helpers';

const OWNER_A = 'device-aaaaaaaaaaaaaaaa';
const OWNER_B = 'device-bbbbbbbbbbbbbbbb';
const daily = () => playToEnd('daily-2026-10-15', 'daily');
const send = (d: ReturnType<typeof deps>, run: object, name: string, owner: string) =>
  submitRun(d, '1.1.1.1', JSON.stringify({ ...run, name, owner }));

describe('names belong to whoever claimed them first', () => {
  it('refuses a name another device already holds', async () => {
    const d = deps();
    expect((await send(d, daily(), 'ada', OWNER_A)).status).toBe(200);
    const r = await send(d, playToEnd('daily-2026-10-15', 'daily', 'sloppy'), 'ada', OWNER_B);
    expect(r.status).toBe(409);
    expect((r.body as { error: string }).error).toMatch(/name/);
  });

  it('lets two players with identical outcomes both rank', async () => {
    const d = deps();
    expect((await send(d, daily(), 'ada', OWNER_A)).status).toBe(200);
    expect((await send(d, daily(), 'bob', OWNER_B)).status).toBe(200);
  });

  it('still refuses the same player resubmitting the same outcome', async () => {
    const d = deps();
    expect((await send(d, daily(), 'ada', OWNER_A)).status).toBe(200);
    expect((await send(d, daily(), 'ada', OWNER_A)).status).toBe(409);
  });

  it('requires a device key from human clients', async () => {
    const r = await submitRun(deps(), '1.1.1.1', JSON.stringify({ ...daily(), name: 'x' }));
    expect(r.status).toBe(400);
  });

  it('lets an agent keep its name across runs with a key', async () => {
    const d = deps();
    const finish = async (key?: string) => {
      const { run } = (await startRun(d, '1.1.1.1', { name: 'probe', key })).body as { run: string };
      for (let i = 0; i < 400; i++) if (((await actRun(d, '1.1.1.1', { run, actions: [], advance: 120 })).body as { over: boolean }).over) break;
      return submitAgentRun(d, '1.1.1.1', { run });
    };
    expect((await finish('agent-key-123456789')).status).toBe(200);
    // same outcome from the same owner: a duplicate, not a new run
    expect((await finish('agent-key-123456789')).status).toBe(409);
    // someone else cannot take the name
    expect((await finish('other-key-987654321')).status).toBe(409);
  });
});

describe('copied replays', () => {
  it('refuses another device submitting a copy of a real run, padded or not', async () => {
    const { verifyReplay } = await import('@blast/sim');
    const d = deps();
    const run = playToEnd('daily-2026-10-15', 'daily', 'sloppy');
    expect(run.replay.actions.length).toBeGreaterThanOrEqual(3);
    expect((await send(d, run, 'ada', OWNER_A)).status).toBe(200);
    expect((await send(d, run, 'thief', OWNER_B)).status).toBe(409);
    const base = verifyReplay(run.replay, { score: run.score });
    if (!base.ok) throw new Error('honest run failed');
    const last = base.summary.durationTicks - 1;
    for (let edge = 0; edge < 80; edge++) {
      const padded = { ...run.replay, actions: [...run.replay.actions, { tick: last, a: { type: 'cut' as const, edge, t: 500 } }] };
      const v = verifyReplay(padded, { score: run.score });
      if (!v.ok || v.summary.shipped !== base.summary.shipped || v.summary.intercepts !== base.summary.intercepts) continue;
      expect((await send(d, { replay: padded, score: run.score }, 'thief2', OWNER_B)).status).toBe(409);
      return;
    }
    throw new Error('no padding variant found');
  });

  it('will not let a player pick an anonymous tag as a name', async () => {
    const { cleanName } = await import('../src/names');
    expect(cleanName('anon-abcd', 'zzzz')).toBe('anon-zzzz');
    expect(cleanName('ANON-abcd', 'zzzz')).toBe('anon-zzzz');
  });
});

describe('more ways to dodge the copy check', () => {
  it('stripping no-op cuts from a copied run does not make it "trivial"', async () => {
    const { runReplay } = await import('@blast/sim');
    const d = deps();
    // three real cuts early on, then nothing: the tutorial injection leaks in wave 1
    const real = [0, 1, 2].map((edge, i) => ({ tick: 10 * (i + 1), a: { type: 'cut' as const, edge, t: 500 } }));
    const idle = { v: 1, mode: 'daily' as const, seed: 'daily-2026-10-15', actions: real };
    const ended = runReplay(idle).state;
    expect(ended.end).toBe('leak');
    expect(ended.effective).toBe(3);
    const padded = { ...idle, actions: real.flatMap((e) => [e, { tick: e.tick, a: { ...e.a } }]) };
    expect((await send(d, { replay: padded, score: ended.score }, 'ada', OWNER_A)).status).toBe(200);
    // the thief drops the no-op repeats: three real actions remain, so it is still a copy
    expect((await send(d, { replay: idle, score: ended.score }, 'thief', OWNER_B)).status).toBe(409);
  });

  it('keeps human and agent names apart', async () => {
    const d = deps();
    const { run } = (await startRun(d, '1.1.1.1', { name: 'ada' })).body as { run: string };
    for (let i = 0; i < 400; i++) if (((await actRun(d, '1.1.1.1', { run, actions: [], advance: 120 })).body as { over: boolean }).over) break;
    expect((await submitAgentRun(d, '1.1.1.1', { run })).status).toBe(200);
    expect((await send(d, daily(), 'ada', OWNER_A)).status).toBe(200);
  });
});
