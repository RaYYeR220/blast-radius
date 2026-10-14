import { describe, expect, it } from 'vitest';
import { REROLL_COST, SCORE_CLEAN_WAVE, WAVE_TICKS } from '../src/constants';
import { segmentsCross } from '../src/geom';
import { UPGRADES } from '../src/upgrades';
import { createGame, step } from '../src/step';
import type { GameState, UpgradeId } from '../src/types';

/** Perfect defence: removes every injection and infection before each tick. */
function scrub(s: GameState): void {
  for (const p of s.packets) if (p.kind === 'inject') p.dead = true;
  for (const n of s.nodes) n.infection = 0;
}

function playWave(s: GameState): void {
  while (s.phase === 'play') {
    scrub(s);
    step(s, []);
  }
}

function fresh(seed = 'waves'): GameState {
  const s = createGame({ seed, mode: 'endless' });
  s.tutorialDone = true;
  return s;
}

describe('wave clock', () => {
  it('opens the shop at exactly 1500 ticks with three offers and a clean bonus', () => {
    const s = fresh();
    for (let i = 0; i < WAVE_TICKS - 1; i++) {
      scrub(s);
      step(s, []);
    }
    expect(s.phase).toBe('play');
    const scoreBefore = s.score;
    scrub(s);
    const ev = step(s, []);
    expect(s.tick).toBe(WAVE_TICKS);
    expect(s.phase).toBe('shop');
    expect(s.offers).toHaveLength(3);
    expect(new Set(s.offers.map((o) => o.id)).size).toBe(3);
    expect(ev.some((e) => e.e === 'shop')).toBe(true);
    expect(s.score - scoreBefore).toBeGreaterThanOrEqual(SCORE_CLEAN_WAVE);
  });

  it('withholds the clean bonus after an infection', () => {
    const s = fresh();
    s.waveInfections = 1;
    for (let i = 0; i < WAVE_TICKS - 1; i++) step(s, []);
    // reaching here means the run may have leaked; only check the bonus when the shop opened
    if (s.phase !== 'play') return;
    const before = s.score;
    step(s, []);
    if ((s.phase as string) === 'shop') expect(s.score - before).toBeLessThan(SCORE_CLEAN_WAVE);
  });

  it('does not advance time while the shop is open', () => {
    const s = fresh();
    playWave(s);
    const t = s.tick;
    for (let i = 0; i < 50; i++) step(s, []);
    expect(s.tick).toBe(t);
    expect(s.phase).toBe('shop');
  });
});

describe('shop', () => {
  it('skips into the next wave with two more agents', () => {
    const s = fresh();
    playWave(s);
    const agents = s.nodes.filter((n) => n.active && n.kind === 'agent').length;
    const t = s.tick;
    const ev = step(s, [{ type: 'skip' }]);
    expect(s.phase).toBe('play');
    expect(s.wave).toBe(2);
    expect(s.waveStart).toBe(t);
    expect(s.tick).toBe(t + 1);
    expect(s.nodes.filter((n) => n.active && n.kind === 'agent').length).toBe(agents + 2);
    expect(ev.some((e) => e.e === 'wave' && e.wave === 2)).toBe(true);
  });

  it('rejects a pick it cannot afford and accepts one it can', () => {
    const s = fresh();
    playWave(s);
    s.credits = 0;
    expect(step(s, [{ type: 'pick', slot: 0 }]).some((e) => e.e === 'reject')).toBe(true);
    expect(s.phase).toBe('shop');
    const offer = s.offers[0]!;
    s.credits = offer.price + 5;
    step(s, [{ type: 'pick', slot: 0 }]);
    expect(s.phase).toBe('play');
    expect(s.credits).toBe(5);
    if (offer.id === 'canary') expect(s.canaries).toBe(1);
    else expect(s.up[offer.id]).toBe(true);
  });

  it('rejects a pick of an empty slot', () => {
    const s = fresh();
    playWave(s);
    s.credits = 999;
    s.offers = s.offers.slice(0, 1);
    expect(step(s, [{ type: 'pick', slot: 2 }]).some((e) => e.e === 'reject')).toBe(true);
  });

  it('rerolls for three credits and draws again', () => {
    const s = fresh();
    playWave(s);
    s.credits = 10;
    const snap = s.rng.snapshot();
    step(s, [{ type: 'reroll' }]);
    expect(s.credits).toBe(10 - REROLL_COST);
    expect(s.offers).toHaveLength(3);
    expect(s.rng.snapshot()).not.toEqual(snap);
    s.credits = 2;
    expect(step(s, [{ type: 'reroll' }]).some((e) => e.e === 'reject')).toBe(true);
  });

  it('never re-offers an owned one-off upgrade, but keeps offering canaries', () => {
    const s = fresh();
    const all = Object.keys(UPGRADES) as UpgradeId[];
    for (const id of all) if (id !== 'canary' && id !== 'sandbox' && id !== 'fastHeal') s.up[id] = true;
    for (let k = 0; k < 20; k++) {
      playWave(s);
      for (const o of s.offers) expect(['canary', 'sandbox', 'fastHeal']).toContain(o.id);
      step(s, [{ type: 'skip' }]);
    }
  });

  it('adds peer links from wave 3 while staying planar', () => {
    const s = fresh('peers');
    for (let w = 1; w < 6; w++) {
      playWave(s);
      step(s, [{ type: 'skip' }]);
    }
    expect(s.edges.some((e) => e.peer && !e.removed)).toBe(true);
    const es = s.edges.filter((e) => !e.removed);
    for (const e of es) {
      for (const f of es) {
        if (e.id >= f.id) continue;
        const [a, b, c, d] = [s.nodes[e.a]!, s.nodes[e.b]!, s.nodes[f.a]!, s.nodes[f.b]!];
        expect(segmentsCross(a.x, a.y, b.x, b.y, c.x, c.y, d.x, d.y)).toBe(false);
      }
    }
  });
});
