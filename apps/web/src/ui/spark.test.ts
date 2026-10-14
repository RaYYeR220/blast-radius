import { describe, expect, it } from 'vitest';
import type { Sample } from '../game/session';
import { sparkPaths } from './spark';

const pts = (d: string) => [...d.matchAll(/[ML]([\d.-]+),([\d.-]+)/g)].map((m) => [Number(m[1]), Number(m[2])] as const);

describe('sparkPaths', () => {
  const tl: Sample[] = [
    { tick: 60, backlog: 0, capacity: 20, infected: 0 },
    { tick: 120, backlog: 10, capacity: 20, infected: 1 },
    { tick: 180, backlog: 22, capacity: 20, infected: 4 },
  ];

  it('spans the full width, first sample to last', () => {
    const b = pts(sparkPaths(tl).backlog);
    expect(b.map((p) => p[0])).toEqual([0, 240, 480]);
  });

  it('puts backlog and capacity on one axis with headroom over the peak', () => {
    const { backlog, cap } = sparkPaths(tl, 480, 84);
    const b = pts(backlog);
    const c = pts(cap);
    expect(b[0]![1]).toBe(81); // zero sits 3px above the bottom
    const peak = 84 - 3 - (22 / (22 * 1.1)) * (84 - 10);
    expect(b[2]![1]).toBeCloseTo(peak, 1);
    expect(b[2]![1]).toBeGreaterThan(0);
    expect(c.every((p) => p[1] === c[0]![1])).toBe(true);
    expect(c[0]![1]).toBeLessThan(b[1]![1]);
  });

  it('fills infections up to half height at the worst moment', () => {
    const inf = pts(sparkPaths(tl, 480, 84).inf);
    expect(inf[0]).toEqual([0, 84]);
    expect(inf[3]![1]).toBeCloseTo(84 - 84 * 0.46, 1);
    expect(inf.at(-1)).toEqual([480, 84]);
  });

  it('draws a flat line for a run too short to chart', () => {
    const { backlog } = sparkPaths([]);
    const b = pts(backlog);
    expect(b).toHaveLength(2);
    expect(b[0]![1]).toBe(b[1]![1]);
  });
});
