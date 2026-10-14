import { describe, expect, it } from 'vitest';
import { hashSeed, Rng } from '../src/rng';

describe('rng', () => {
  it('is deterministic per seed', () => {
    const a = new Rng('daily-2026-10-14');
    const b = new Rng('daily-2026-10-14');
    for (let i = 0; i < 1000; i++) expect(a.next()).toBe(b.next());
  });

  it('differs across seeds', () => {
    expect(new Rng('x').next()).not.toBe(new Rng('y').next());
  });

  it('stays in [0,1) and is roughly uniform', () => {
    const r = new Rng('u');
    const bins = new Array<number>(10).fill(0);
    for (let i = 0; i < 100_000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      bins[Math.floor(v * 10)]!++;
    }
    for (const c of bins) expect(Math.abs(c - 10_000)).toBeLessThan(600);
  });

  it('int, pick and chance obey their bounds', () => {
    const r = new Rng('b');
    for (let i = 0; i < 1000; i++) {
      const n = r.int(7);
      expect(Number.isInteger(n) && n >= 0 && n < 7).toBe(true);
    }
    expect(r.pick(['a'])).toBe('a');
    expect(r.chance(0)).toBe(false);
    expect(r.chance(1)).toBe(true);
  });

  it('consumes exactly one draw per call regardless of probability', () => {
    const a = new Rng('draws');
    const b = new Rng('draws');
    a.chance(1);
    b.chance(0.3);
    expect(a.snapshot()).toEqual(b.snapshot());
  });

  it('hashSeed yields four uint32 words', () => {
    const words = hashSeed('abc');
    expect(words).toHaveLength(4);
    for (const v of words) expect(v >>> 0).toBe(v);
  });
});
