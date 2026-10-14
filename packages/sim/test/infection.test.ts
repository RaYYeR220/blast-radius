import { describe, expect, it } from 'vitest';
import { EMIT_TICKS, INCUBATION_TICKS, SLEEPER_INCUBATION_TICKS, TUTORIAL_INJECT_TICK } from '../src/constants';
import { spawnInject } from '../src/infection';
import { INJECTIONS, TASKS } from '../src/payloads';
import { createGame, step } from '../src/step';
import type { GameState, SimEvent } from '../src/types';
import { testState } from './helpers';

/** user — a1 — web — a2 — vault — a3 — out, 300 apart */
function chain(): GameState {
  const s = testState(
    [
      [0, 0, 'user'], [300, 0, 'agent'], [600, 0, 'web'], [900, 0, 'agent'],
      [1200, 0, 'vault'], [1500, 0, 'agent'], [1800, 0, 'out'],
    ],
    [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6]],
  );
  s.spawnAcc = -1e9;
  s.tutorialDone = true;
  return s;
}

function run(s: GameState, ticks: number): SimEvent[] {
  const out: SimEvent[] = [];
  for (let i = 0; i < ticks && s.phase === 'play'; i++) out.push(...step(s, []));
  return out;
}

describe('payload text', () => {
  it('has at least forty injections and forty tasks, all distinct', () => {
    expect(INJECTIONS.length).toBeGreaterThanOrEqual(40);
    expect(TASKS.length).toBeGreaterThanOrEqual(40);
    expect(new Set(INJECTIONS).size).toBe(INJECTIONS.length);
    expect(new Set(TASKS).size).toBe(TASKS.length);
  });
});

describe('injection', () => {
  it('leaks through the vault when nobody acts', () => {
    const s = chain();
    spawnInject(s, s.web, 'plain', 7);
    const ev = run(s, 3000);
    expect(s.end).toBe('leak');
    expect(s.leakPath).not.toBeNull();
    const path = s.leakPath!;
    expect(path[0]).toBe(s.web);
    expect(path.indexOf(s.vault)).toBeGreaterThan(0);
    expect(path[path.length - 1]).toBe(s.out);
    expect(s.rootPayload).toBe(7);
    expect(ev.some((e) => e.e === 'secret')).toBe(true);
    expect(ev.some((e) => e.e === 'leak')).toBe(true);
  });

  it('turns incubation into infection after exactly 90 ticks', () => {
    const s = chain();
    spawnInject(s, s.web, 'plain');
    const ev = run(s, 400);
    const inc = ev.find((e) => e.e === 'incubate' && e.node === 3)!;
    const inf = ev.find((e) => e.e === 'infect' && e.node === 3)!;
    expect(inf.tick - inc.tick).toBe(INCUBATION_TICKS);
    expect(s.infectedTotal).toBeGreaterThanOrEqual(1);
  });

  it('lets a sleeper incubate for 360 ticks', () => {
    const s = chain();
    s.canaries = 99; // keep the run alive past the long incubation
    spawnInject(s, s.web, 'sleeper');
    const ev = run(s, 900);
    const inc = ev.find((e) => e.e === 'incubate' && e.node === 3)!;
    const inf = ev.find((e) => e.e === 'infect' && e.node === 3)!;
    expect(inf.tick - inc.tick).toBe(SLEEPER_INCUBATION_TICKS);
  });

  it('splits into two more packets when a splitter starts incubating', () => {
    const s = chain();
    spawnInject(s, s.web, 'splitter');
    let before = 0;
    for (let i = 0; i < 400; i++) {
      const injects = s.packets.filter((p) => !p.dead && p.kind === 'inject').length;
      const ev = step(s, []);
      if (ev.some((e) => e.e === 'incubate')) {
        before = injects;
        break;
      }
    }
    expect(before).toBe(1);
    expect(s.packets.filter((p) => !p.dead && p.kind === 'inject').length).toBe(3);
  });

  it('converts a task that reaches an infected agent and keeps its root payload', () => {
    const s = chain();
    const a1 = s.nodes[1]!;
    a1.infection = 2;
    a1.payload = 11;
    a1.nextEmitAt = 1e9;
    s.queue = 1;
    s.spawned = 1;
    s.forceJob = 'compute';
    s.forceAgent = 1;
    const ev = run(s, 400);
    const conv = ev.find((e) => e.e === 'convert');
    expect(conv).toBeDefined();
    expect(s.converted).toBe(1);
    const p = s.packets.find((q) => q.id === (conv as { packet: number }).packet);
    if (p) expect(p.payload).toBe(11);
  });

  it('emits a new injection from an infected agent every 240 ticks', () => {
    const s = chain();
    s.nodes[5]!.infection = 2;
    s.nodes[5]!.nextEmitAt = 10;
    const spawns: number[] = [];
    for (let i = 0; i < 10 + EMIT_TICKS * 2 + 5; i++) {
      for (const e of step(s, [])) {
        if (e.e === 'spawn') {
          const p = s.packets.find((q) => q.id === e.packet);
          if (p?.kind === 'inject' && p.trail[0] === 5) spawns.push(e.tick);
        }
      }
      if (s.phase !== 'play') break;
    }
    expect(spawns.slice(0, 2)).toEqual([10, 10 + EMIT_TICKS]);
  });

  it('lets a canary absorb one leak', () => {
    const s = chain();
    s.canaries = 1;
    spawnInject(s, s.vault, 'plain').secret = true; // already holding the secret
    const ev = run(s, 600);
    expect(ev.some((e) => e.e === 'canary')).toBe(true);
    expect(s.canaries).toBe(0);
    expect(s.phase).toBe('play');
  });

  it('sends a hunter to the busiest agent before the vault', () => {
    // web(0) links a hub agent (1) with three leaves, and links straight to the vault (5)
    const s = testState(
      [
        [0, 0, 'web'], [300, 0, 'agent'], [300, 300, 'agent'], [600, 0, 'agent'],
        [300, -300, 'agent'], [0, 400, 'vault'], [-300, 0, 'user'], [0, -400, 'out'],
      ],
      [[0, 1], [1, 2], [1, 3], [1, 4], [0, 5], [6, 0], [7, 4]],
    );
    s.spawnAcc = -1e9;
    s.tutorialDone = true;
    const p = spawnInject(s, s.web, 'hunter');
    run(s, 300);
    expect(p.trail[1]).toBe(1);
  });

  it('spawns the tutorial injection at web once, in wave 1 only', () => {
    const s = createGame({ seed: 'tut', mode: 'endless' });
    const ev: SimEvent[] = [];
    for (let i = 0; i <= TUTORIAL_INJECT_TICK; i++) ev.push(...step(s, []));
    const spawned = ev.filter((e) => e.e === 'spawn' && e.tick === TUTORIAL_INJECT_TICK);
    const injects = spawned
      .map((e) => s.packets.find((p) => p.id === (e as { packet: number }).packet))
      .filter((p) => p?.kind === 'inject');
    expect(injects.length).toBe(1);
    expect(injects[0]!.trail[0]).toBe(s.web);

    const s2 = createGame({ seed: 'tut', mode: 'endless' });
    s2.wave = 2;
    const ev2: SimEvent[] = [];
    for (let i = 0; i <= TUTORIAL_INJECT_TICK; i++) ev2.push(...step(s2, []));
    const inj2 = ev2
      .filter((e) => e.e === 'spawn' && e.tick === TUTORIAL_INJECT_TICK)
      .map((e) => s2.packets.find((p) => p.id === (e as { packet: number }).packet))
      .filter((p) => p?.kind === 'inject' && p.trail[0] === s2.web);
    expect(inj2.length).toBe(0);
  });

  it('draws the injection chance exactly once per research visit to web', () => {
    const s = chain();
    let chances = 0;
    const orig = s.rng.chance.bind(s.rng);
    s.rng.chance = (p: number) => {
      chances++;
      return orig(p);
    };
    s.queue = 1;
    s.spawned = 1;
    s.forceJob = 'research';
    s.forceAgent = 1;
    run(s, 1500);
    expect(chances).toBe(1);
  });

  it('hides a stealth packet until it is one hop from the vault', () => {
    const s = chain();
    const p = spawnInject(s, s.web, 'stealth');
    expect(p.revealed).toBe(false);
    let revealedOn = -1;
    for (let i = 0; i < 1500 && s.phase === 'play' && revealedOn < 0; i++) {
      step(s, []);
      if (p.revealed) revealedOn = p.edge >= 0 ? p.to : p.node;
    }
    expect(revealedOn).toBe(s.vault);
  });
});
