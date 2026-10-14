import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SIM_VERSION } from '../src/constants';
import { stateHash } from '../src/hash';
import { spawnInject } from '../src/infection';
import { observe } from '../src/observe';
import { Recorder, type Replay, runReplay, verifyReplay } from '../src/replay';
import { Rng } from '../src/rng';
import { createGame } from '../src/step';
import type { Action, GameState } from '../src/types';
import { randomPolicy, sniper } from './policy';

function play(seed: string, ticks: number, policySeed = seed): { rec: Recorder; s: GameState } {
  const s = createGame({ seed, mode: 'endless' });
  const rec = new Recorder(s);
  const pol = new Rng(`policy-${policySeed}`);
  for (let i = 0; i < ticks && s.phase !== 'over'; i++) rec.step(randomPolicy(s, pol));
  return { rec, s };
}

/** Plays until the game ends; the policy only issues valid actions. */
function playToEnd(seed: string): { replay: Replay; s: GameState } {
  const s = createGame({ seed, mode: 'endless' });
  const rec = new Recorder(s);
  const pol = new Rng(`end-${seed}`);
  for (let i = 0; i < 200_000 && s.phase !== 'over'; i++) rec.step(randomPolicy(s, pol, true));
  return { replay: rec.replay(), s };
}

describe('determinism', () => {
  it('re-simulates every recorded run to the identical state (1,000 seeds)', () => {
    for (let i = 0; i < 1000; i++) {
      const { rec, s } = play(`det-${i}`, 1800);
      const r = runReplay(rec.replay(), { untilTick: s.tick });
      expect(stateHash(r.state)).toBe(stateHash(s));
    }
  });

  it('distinguishes different states', () => {
    const a = play('h1', 600).s;
    const b = play('h2', 600).s;
    expect(stateHash(a)).not.toBe(stateHash(b));
  });

  it('matches the frozen golden replays', () => {
    const golden = JSON.parse(readFileSync(new URL('./fixtures/golden.json', import.meta.url), 'utf8')) as Array<{
      replay: Replay;
      hash: string;
      score: number;
    }>;
    expect(golden.length).toBeGreaterThanOrEqual(5);
    for (const g of golden) {
      const r = runReplay(g.replay);
      expect(stateHash(r.state)).toBe(g.hash);
      expect(r.state.score).toBe(g.score);
    }
  });
});

describe('verification', () => {
  const honest = playToEnd('verify-1');

  it('accepts an honest finished run', () => {
    const v = verifyReplay(honest.replay, { score: honest.s.score });
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.summary.score).toBe(honest.s.score);
      expect(['leak', 'stall']).toContain(v.summary.endedBy);
      expect(v.summary.durationTicks).toBe(honest.s.tick);
    }
  });

  it('rejects an inflated score', () => {
    expect(verifyReplay(honest.replay, { score: honest.s.score + 1 }).ok).toBe(false);
  });

  it('rejects an injected illegal action', () => {
    const r: Replay = { ...honest.replay, actions: [{ tick: 5, a: { type: 'quarantine', node: 0 } }, ...honest.replay.actions] };
    r.actions.sort((x, y) => x.tick - y.tick);
    const v = verifyReplay(r, { score: honest.s.score });
    expect(v.ok).toBe(false);
  });

  it('rejects a swapped seed', () => {
    const v = verifyReplay({ ...honest.replay, seed: 'someone-else' }, { score: honest.s.score });
    expect(v.ok).toBe(false);
  });

  it('rejects the wrong sim version', () => {
    expect(verifyReplay({ ...honest.replay, v: SIM_VERSION + 1 }, { score: honest.s.score }).ok).toBe(false);
  });

  it('rejects ticks that run backwards', () => {
    const acts = [
      { tick: 10, a: { type: 'cut', edge: 0, t: 500 } as Action },
      { tick: 5, a: { type: 'cut', edge: 1, t: 500 } as Action },
    ];
    const v = verifyReplay({ v: SIM_VERSION, mode: 'endless', seed: 'x', actions: acts }, { score: 0 });
    expect(v.ok).toBe(false);
  });

  it('rejects a run abandoned in the shop', () => {
    const s = createGame({ seed: 'abandon', mode: 'endless' });
    const rec = new Recorder(s);
    for (let i = 0; i < 5000 && s.phase === 'play'; i++) rec.step(sniper(s));
    expect(s.phase).toBe('shop');
    const r = runReplay(rec.replay());
    expect(r.state.end).toBe('abandoned');
    expect(verifyReplay(rec.replay(), { score: r.state.score }).ok).toBe(false);
  });

  it('rejects oversized logs', () => {
    const acts = Array.from({ length: 20_001 }, (_, i) => ({ tick: i, a: { type: 'skip' } as Action }));
    expect(verifyReplay({ v: SIM_VERSION, mode: 'endless', seed: 'x', actions: acts }, { score: 0 }).ok).toBe(false);
  });

  it('rejects malformed actions without throwing', () => {
    const bad = { v: SIM_VERSION, mode: 'endless', seed: 'x', actions: [{ tick: 1, a: { type: 'nuke' } }] } as unknown as Replay;
    expect(verifyReplay(bad, { score: 0 }).ok).toBe(false);
  });
});

describe('observe', () => {
  it('hides an unrevealed stealth packet', () => {
    const s = createGame({ seed: 'obs', mode: 'agent' });
    s.tutorialDone = true;
    const p = spawnInject(s, s.web, 'stealth');
    const o = observe(s);
    const seen = o.packets.find((q) => q.id === p.id)!;
    expect(seen.kind).toBe('task');
    expect(seen.variant).toBeNull();
    expect(JSON.stringify(o)).not.toContain('stealth');
  });

  it('is plain JSON with the board, the economy and packet text', () => {
    const s = createGame({ seed: 'obs2', mode: 'agent' });
    for (let i = 0; i < 400; i++) new Recorder(s).step([]);
    const o = observe(s);
    expect(JSON.parse(JSON.stringify(o))).toEqual(o);
    expect(o.nodes.length).toBe(s.nodes.filter((n) => n.active).length);
    expect(o.capacity).toBeGreaterThan(0);
    for (const p of o.packets) expect(typeof p.text).toBe('string');
  });
});
