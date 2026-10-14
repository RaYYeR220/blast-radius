import { describe, expect, it } from 'vitest';
import { CAPACITY_BASE, CAPACITY_PER_AGENT, SCORE_LOST } from '../src/constants';
import { backlog, capacity } from '../src/packets';
import { Rng } from '../src/rng';
import { createGame, step } from '../src/step';
import type { GameState } from '../src/types';
import { testState } from './helpers';

/** user —300— agent —300— web —300— vault —300— out */
function line(): GameState {
  const s = testState(
    [[0, 0, 'user'], [300, 0, 'agent'], [600, 0, 'web'], [900, 0, 'vault'], [1200, 0, 'out']],
    [[0, 1], [1, 2], [2, 3], [3, 4]],
  );
  s.spawnAcc = -1e9; // no background traffic in unit tests
  s.tutorialDone = true;
  return s;
}

function sever(s: GameState, edgeId: number, ticks: number, gapT = -1): void {
  const e = s.edges[edgeId]!;
  e.severedUntil = s.tick + ticks;
  e.gapT = gapT;
}

function liveTasks(s: GameState): number {
  return s.packets.filter((p) => !p.dead && p.kind === 'task').length;
}

describe('task flow', () => {
  it('ships a compute task user → agent → user', () => {
    const s = line();
    s.queue = 1;
    s.spawned = 1;
    s.forceJob = 'compute';
    s.forceAgent = 1;
    let ship = null as null | { job: string; packet: number };
    for (let i = 0; i < 600 && !ship; i++) {
      for (const e of step(s, [])) if (e.e === 'ship') ship = e;
    }
    expect(ship).not.toBeNull();
    expect(ship!.job).toBe('compute');
    expect(s.shipped).toBe(1);
    expect(s.credits).toBe(1);
    expect(s.score).toBe(11); // round(10 * 1.1) in wave 1
  });

  it('routes a research task through web and back', () => {
    const s = line();
    s.queue = 1;
    s.spawned = 1;
    s.forceJob = 'research';
    s.forceAgent = 1;
    s.rng.chance = () => false; // this page is clean
    const visits: number[] = [];
    let last = -1;
    for (let i = 0; i < 2000 && s.shipped === 0; i++) {
      step(s, []);
      const p = s.packets.find((q) => !q.dead);
      if (p && p.node >= 0 && p.node !== last) {
        visits.push(p.node);
        last = p.node;
      }
    }
    expect(s.shipped).toBe(1);
    expect(s.credits).toBe(2);
    expect(visits).toEqual([1, 2, 1]); // leaves the user on the tick it is dispatched
  });

  it('keeps a task queued while no path exists, then ships it', () => {
    const s = line();
    s.queue = 1;
    s.spawned = 1;
    s.forceJob = 'compute';
    s.forceAgent = 1;
    sever(s, 0, 200);
    for (let i = 0; i < 150; i++) step(s, []);
    expect(s.queue).toBe(1);
    expect(s.lost).toBe(0);
    for (let i = 0; i < 600 && s.shipped === 0; i++) step(s, []);
    expect(s.shipped).toBe(1);
    expect(s.lost).toBe(0);
  });

  it('destroys a packet that reaches an open gap and requeues the work', () => {
    const s = line();
    s.queue = 1;
    s.spawned = 1;
    s.forceJob = 'compute';
    s.forceAgent = 1;
    while (!s.packets.some((p) => !p.dead && p.edge === 0 && p.progress > 0.2)) step(s, []);
    sever(s, 0, 180, 0.9);
    const events = [];
    for (let i = 0; i < 120; i++) events.push(...step(s, []));
    expect(events.some((e) => e.e === 'lost')).toBe(true);
    expect(s.lost).toBe(1);
    expect(s.score).toBe(SCORE_LOST);
    expect(liveTasks(s)).toBe(0);
    expect(s.queue).toBe(1);
  });

  it('lets a packet already past the gap continue', () => {
    const s = line();
    s.queue = 1;
    s.spawned = 1;
    s.forceJob = 'compute';
    s.forceAgent = 1;
    while (!s.packets.some((p) => !p.dead && p.edge === 0 && p.progress > 0.5)) step(s, []);
    sever(s, 0, 180, 0.1);
    for (let i = 0; i < 80; i++) step(s, []);
    expect(s.lost).toBe(0);
  });

  it('closes the gap when the edge heals', () => {
    const s = line();
    sever(s, 0, 30, 0.5);
    const events = [];
    for (let i = 0; i < 31; i++) events.push(...step(s, []));
    expect(events.some((e) => e.e === 'heal' && e.edge === 0)).toBe(true);
    expect(s.edges[0]!.gapT).toBe(-1);
  });
});

describe('backlog and stall', () => {
  it('measures capacity from the active agents', () => {
    const s = createGame({ seed: 'cap', mode: 'endless' });
    expect(capacity(s)).toBe(Math.floor(CAPACITY_BASE + CAPACITY_PER_AGENT * 4));
  });

  it('counts queued and live tasks as backlog', () => {
    const s = createGame({ seed: 'bl', mode: 'endless' });
    for (let i = 0; i < 400; i++) step(s, []);
    expect(backlog(s)).toBe(s.queue + liveTasks(s));
  });

  it('stalls once the backlog has stayed over capacity long enough', () => {
    const s = createGame({ seed: 'stall', mode: 'endless' });
    s.tutorialDone = true;
    const userEdges = s.edges.filter((e) => e.a === s.user || e.b === s.user);
    let overSince = -1;
    for (let i = 0; i < 6000 && s.phase === 'play'; i++) {
      for (const e of userEdges) if (e.severedUntil <= s.tick) sever(s, e.id, 180, 0.5);
      step(s, []);
      if (overSince < 0 && backlog(s) > capacity(s)) overSince = s.tick;
    }
    expect(s.end).toBe('stall');
    expect(s.tick - overSince).toBeGreaterThanOrEqual(299);
  });

  it('resets the stall timer when the backlog recovers', () => {
    const s = createGame({ seed: 'reset', mode: 'endless' });
    s.queue = 100;
    for (let i = 0; i < 100; i++) {
      for (const e of s.edges) if (e.a === s.user || e.b === s.user) sever(s, e.id, 180);
      step(s, []);
    }
    expect(s.stallTicks).toBeGreaterThan(90);
    s.queue = 0;
    step(s, []);
    expect(s.stallTicks).toBe(0);
  });

  it('accounts for every task every tick under random cuts', () => {
    const s = createGame({ seed: 'acct', mode: 'endless' });
    const pol = new Rng('policy');
    const live = s.edges.filter((e) => !e.removed);
    for (let i = 0; i < 3000 && s.phase === 'play'; i++) {
      if (i % 30 === 0) {
        const e = live[pol.int(live.length)]!;
        if (e.severedUntil <= s.tick) sever(s, e.id, 180, Math.floor(pol.next() * 1000) / 1000);
      }
      step(s, []);
      expect(s.shipped + liveTasks(s) + s.queue + s.converted).toBe(s.spawned);
      for (const p of s.packets) expect(Number.isFinite(p.progress)).toBe(true);
    }
  });
});
