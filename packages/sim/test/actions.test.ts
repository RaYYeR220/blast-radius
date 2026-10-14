import { describe, expect, it } from 'vitest';
import { QUARANTINE_COST, SCORE_COMBO, SCORE_INTERCEPT, SCORE_LOST } from '../src/constants';
import { spawnInject } from '../src/infection';
import { posFromA } from '../src/packets';
import { createGame, step } from '../src/step';
import type { Action, GameState, Packet, SimEvent } from '../src/types';
import { testState } from './helpers';

/** web(0) — agent(1) — vault(2) — agent(3) — out(4), plus user(5) hanging off agent 1 */
function board(): GameState {
  const s = testState(
    [[0, 0, 'web'], [600, 0, 'agent'], [1200, 0, 'vault'], [1800, 0, 'agent'], [2400, 0, 'out'], [600, 600, 'user']],
    [[0, 1], [1, 2], [2, 3], [3, 4], [1, 5]],
  );
  s.spawnAcc = -1e9;
  s.tutorialDone = true;
  return s;
}

function until(s: GameState, pred: () => boolean, max = 2000): void {
  for (let i = 0; i < max && !pred(); i++) step(s, []);
  if (!pred()) throw new Error('condition never met');
}

function cutAt(s: GameState, p: Packet, offset = 0): Action {
  const e = s.edges[p.edge]!;
  const t = Math.round((posFromA(s, p) + offset / e.len) * 1000);
  return { type: 'cut', edge: p.edge, t: Math.max(0, Math.min(1000, t)) };
}

describe('cut', () => {
  it('kills an injected packet under the blade at once and scores it', () => {
    const s = board();
    const p = spawnInject(s, s.web, 'plain');
    until(s, () => p.edge === 0 && p.progress > 0.5);
    const ev = step(s, [cutAt(s, p)]);
    expect(p.dead).toBe(true);
    expect(s.intercepts).toBe(1);
    expect(s.score).toBe(SCORE_INTERCEPT);
    expect(ev.some((e) => e.e === 'intercept')).toBe(true);
    expect(ev.some((e) => e.e === 'cut' && e.edge === 0)).toBe(true);
    expect(s.edges[0]!.severedUntil).toBeGreaterThan(s.tick);
  });

  it('kills a packet that runs into a gap cut ahead of it', () => {
    const s = board();
    const p = spawnInject(s, s.web, 'plain');
    until(s, () => p.edge === 0 && p.progress > 0.2);
    step(s, [cutAt(s, p, 150)]);
    expect(p.dead).toBe(false);
    until(s, () => p.dead, 200);
    expect(s.intercepts).toBe(1);
  });

  it('lets a packet escape a gap cut behind it', () => {
    const s = board();
    const p = spawnInject(s, s.web, 'plain');
    until(s, () => p.edge === 0 && p.progress > 0.5);
    step(s, [cutAt(s, p, -150)]);
    until(s, () => p.node === 1, 400);
    expect(p.dead).toBe(false);
    expect(s.intercepts).toBe(0);
  });

  it('kills and requeues a task caught behind the gap, at a cost', () => {
    const s = board();
    s.queue = 1;
    s.spawned = 1;
    s.forceJob = 'compute';
    s.forceAgent = 1;
    until(s, () => s.packets.some((q) => !q.dead && q.edge === 4 && q.progress > 0.2));
    const task = s.packets.find((q) => !q.dead && q.edge === 4)!;
    const ahead = task.from === s.edges[4]!.a ? 150 : -150; // offsets are measured from endpoint a
    step(s, [cutAt(s, task, ahead)]);
    until(s, () => task.dead, 300);
    expect(s.lost).toBe(1);
    expect(s.queue).toBe(1);
    expect(s.score).toBe(SCORE_LOST);
  });

  it('treats a second cut on a severed edge as a no-op', () => {
    const s = board();
    step(s, [{ type: 'cut', edge: 0, t: 500 }]);
    const until1 = s.edges[0]!.severedUntil;
    const ev = step(s, [{ type: 'cut', edge: 0, t: 100 }]);
    expect(s.edges[0]!.severedUntil).toBe(until1);
    expect(s.edges[0]!.gapT).toBe(0.5);
    expect(ev.filter((e) => e.e === 'cut' || e.e === 'reject')).toHaveLength(0);
  });

  it('pays a combo bonus for three intercepts in one stroke', () => {
    const s = board();
    const a = spawnInject(s, s.web, 'plain');
    const b = spawnInject(s, 2, 'plain');
    b.secret = true;
    const c = spawnInject(s, 2, 'plain');
    c.secret = true;
    until(s, () => a.edge === 0 && a.progress > 0.3 && b.edge === 2 && b.progress > 0.3);
    // b and c travel together on edge 2; one cut takes both, another takes a
    const ev = step(s, [cutAt(s, a), cutAt(s, b)]);
    const n = ev.filter((e) => e.e === 'intercept').length;
    expect(n).toBe(3);
    expect(s.score).toBe(3 * SCORE_INTERCEPT + 2 * SCORE_COMBO);
    expect(ev.find((e) => e.e === 'combo')).toMatchObject({ n: 3 });
  });

  it('uses the wide blade when the upgrade is owned', () => {
    const near = (wide: boolean) => {
      const s = board();
      s.up.wideBlade = wide;
      const p = spawnInject(s, s.web, 'plain');
      until(s, () => p.edge === 0 && p.progress > 0.5);
      step(s, [cutAt(s, p, 30)]);
      return p.dead && s.intercepts === 1 && s.tick > 0;
    };
    expect(near(false)).toBe(false);
    expect(near(true)).toBe(true);
  });

  it('rejects malformed cuts', () => {
    const s = board();
    for (const a of [
      { type: 'cut', edge: 0, t: 1001 },
      { type: 'cut', edge: 0, t: 0.5 },
      { type: 'cut', edge: 99, t: 500 },
      { type: 'cut', edge: -1, t: 500 },
    ] as Action[]) {
      const ev = step(s, [a]);
      expect(ev.some((e) => e.e === 'reject')).toBe(true);
    }
    expect(s.edges.every((e) => e.severedUntil === 0)).toBe(true);
  });
});

describe('quarantine', () => {
  it('clears incubation, costs credits and takes the agent offline', () => {
    const s = board();
    s.credits = 10;
    const n = s.nodes[1]!;
    n.infection = 1;
    n.incubateUntil = 999;
    const ev = step(s, [{ type: 'quarantine', node: 1 }]);
    expect(n.infection).toBe(0);
    expect(s.credits).toBe(10 - QUARANTINE_COST);
    expect(n.quarantinedUntil).toBeGreaterThan(s.tick);
    expect(ev.some((e) => e.e === 'quarantine' && e.node === 1 && !e.auto)).toBe(true);
  });

  it('destroys packets sitting on the agent and requeues tasks', () => {
    const s = board();
    s.credits = 10;
    s.queue = 1;
    s.spawned = 1;
    s.forceJob = 'compute';
    s.forceAgent = 1;
    until(s, () => s.packets.some((q) => !q.dead && q.node === 1 && q.processing));
    step(s, [{ type: 'quarantine', node: 1 }]);
    expect(s.packets.filter((q) => !q.dead && q.kind === 'task')).toHaveLength(0);
    expect(s.queue).toBe(1);
    expect(s.lost).toBe(1);
  });

  it('rejects without enough credits, on non-agents, and twice in a row', () => {
    const s = board();
    s.credits = 3;
    expect(step(s, [{ type: 'quarantine', node: 1 }]).some((e) => e.e === 'reject')).toBe(true);
    s.credits = 20;
    expect(step(s, [{ type: 'quarantine', node: s.vault }]).some((e) => e.e === 'reject')).toBe(true);
    expect(step(s, [{ type: 'quarantine', node: 1 }]).some((e) => e.e === 'quarantine')).toBe(true);
    expect(step(s, [{ type: 'quarantine', node: 1 }]).some((e) => e.e === 'reject')).toBe(true);
  });

  it('uses the sandbox price and duration when owned', () => {
    const s = board();
    s.up.sandbox = true;
    s.credits = 2;
    step(s, [{ type: 'quarantine', node: 1 }]);
    expect(s.credits).toBe(0);
    expect(s.nodes[1]!.quarantinedUntil).toBe(180);
  });
});

describe('phase gating', () => {
  it('rejects shop actions during play', () => {
    const s = board();
    for (const a of [{ type: 'pick', slot: 0 }, { type: 'reroll' }, { type: 'skip' }] as Action[]) {
      expect(step(s, [a]).some((e) => e.e === 'reject')).toBe(true);
    }
  });
});

describe('deny-all through real cuts', () => {
  it('dies by stall', () => {
    const s = createGame({ seed: 'deny', mode: 'endless' });
    const ev: SimEvent[] = [];
    for (let i = 0; i < 8000 && s.phase === 'play'; i++) {
      const cuts: Action[] = s.edges
        .filter((e) => !e.removed && e.severedUntil <= s.tick)
        .filter((e) => e.a === s.user || e.b === s.user || e.a === s.web || e.b === s.web)
        .map((e) => ({ type: 'cut', edge: e.id, t: 500 }));
      ev.push(...step(s, cuts));
    }
    expect(s.end).toBe('stall');
    expect(ev.some((e) => e.e === 'reject')).toBe(false);
  });
});
