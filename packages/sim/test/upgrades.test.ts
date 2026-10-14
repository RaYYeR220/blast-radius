import { describe, expect, it } from 'vitest';
import {
  INJECT_SPEED_MULT,
  PACKET_SPEED,
  RATE_LIMIT_MULT,
  ROLLBACK_COOLDOWN,
  ROLLBACK_DELAY,
  SEVER_TICKS_FAST,
} from '../src/constants';
import { growWave } from '../src/graph';
import { spawnInject } from '../src/infection';
import { applyUpgrade, UPGRADES } from '../src/upgrades';
import { createGame, step } from '../src/step';
import type { GameState, SimEvent } from '../src/types';
import { testState } from './helpers';

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

describe('upgrade table', () => {
  it('has ten upgrades with prices, names and short blurbs', () => {
    const ids = Object.keys(UPGRADES);
    expect(ids).toHaveLength(10);
    for (const u of Object.values(UPGRADES)) {
      expect(u.price).toBeGreaterThan(0);
      expect(u.name.length).toBeGreaterThan(2);
      expect(u.blurb.length).toBeLessThanOrEqual(60);
    }
  });
});

describe('upgrade effects', () => {
  it('canary stacks', () => {
    const s = chain();
    applyUpgrade(s, 'canary');
    applyUpgrade(s, 'canary');
    expect(s.canaries).toBe(2);
  });

  it('hitl and sandbox and wide blade set their flags', () => {
    const s = chain();
    applyUpgrade(s, 'hitl');
    applyUpgrade(s, 'sandbox');
    applyUpgrade(s, 'wideBlade');
    expect(s.up.hitl && s.up.sandbox && s.up.wideBlade).toBe(true);
  });

  it('rate limit slows traffic on vault links', () => {
    const s = chain();
    applyUpgrade(s, 'rateLimit');
    const p = spawnInject(s, 3, 'plain');
    step(s, []);
    step(s, []);
    const before = p.progress;
    step(s, []);
    expect(p.progress - before).toBeCloseTo((PACKET_SPEED * INJECT_SPEED_MULT * RATE_LIMIT_MULT) / 300, 10);
  });

  it('fast heal shortens a cut', () => {
    const s = chain();
    applyUpgrade(s, 'fastHeal');
    step(s, [{ type: 'cut', edge: 0, t: 500 }]);
    expect(s.edges[0]!.severedUntil).toBe(SEVER_TICKS_FAST);
  });

  it('circuit breaker trips a link carrying two injections', () => {
    const s = chain();
    applyUpgrade(s, 'breaker');
    spawnInject(s, s.web, 'plain');
    spawnInject(s, s.web, 'plain');
    const ev: SimEvent[] = [];
    for (let i = 0; i < 5; i++) ev.push(...step(s, []));
    expect(ev.filter((e) => e.e === 'intercept')).toHaveLength(2);
    expect(s.intercepts).toBe(2);
    expect(s.edges[2]!.severedUntil).toBeGreaterThan(s.tick);
  });

  it('rollback restores an infected agent after a delay, then cools down', () => {
    const s = chain();
    applyUpgrade(s, 'rollback');
    for (const id of [1, 3]) {
      const n = s.nodes[id]!;
      n.infection = 2;
      n.infectedAt = 0;
      n.nextEmitAt = 1e9;
    }
    const ev: SimEvent[] = [];
    for (let i = 0; i <= ROLLBACK_DELAY + ROLLBACK_COOLDOWN + 5; i++) ev.push(...step(s, []));
    const autos = ev.filter((e) => e.e === 'quarantine' && e.auto);
    expect(autos).toHaveLength(2);
    expect(autos[0]!.tick).toBe(ROLLBACK_DELAY);
    expect(autos[1]!.tick).toBe(ROLLBACK_DELAY + ROLLBACK_COOLDOWN);
  });

  it('allowlist leaves outbound with a single link and keeps it that way', () => {
    const s = createGame({ seed: 'allow', mode: 'endless' });
    s.tutorialDone = true;
    for (let i = 0; i < 6; i++) growWave(s);
    applyUpgrade(s, 'allowlist');
    const outLinks = () => s.edges.filter((e) => !e.removed && (e.a === s.out || e.b === s.out));
    expect(outLinks()).toHaveLength(1);
    for (let i = 0; i < 8; i++) growWave(s);
    expect(outLinks()).toHaveLength(1);
    for (const n of s.nodes) {
      const d = s.edges.filter((e) => !e.removed && (e.a === n.id || e.b === n.id)).length;
      expect(n.degree).toBe(d);
      if (n.active) expect(d).toBeGreaterThan(0);
    }
  });

  it('least privilege caps the vault at two links', () => {
    const s = createGame({ seed: 'lp', mode: 'endless' });
    for (let i = 0; i < 10; i++) growWave(s);
    applyUpgrade(s, 'leastPriv');
    const vaultLinks = () => s.edges.filter((e) => !e.removed && (e.a === s.vault || e.b === s.vault));
    expect(vaultLinks().length).toBeLessThanOrEqual(2);
    for (let i = 0; i < 5; i++) growWave(s);
    expect(vaultLinks().length).toBeLessThanOrEqual(2);
  });
});
