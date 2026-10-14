import { describe, expect, it } from 'vitest';
import {
  BOARD_H,
  BOARD_W,
  MARGIN,
  MAX_DEGREE,
  MIN_SPACING,
  SPECIAL_MIN_DIST,
} from '../src/constants';
import { segmentsCross } from '../src/geom';
import { growWave } from '../src/graph';
import { createGame } from '../src/step';
import type { GameState } from '../src/types';

const SEEDS = Array.from({ length: 300 }, (_, i) => `seed-${i}`);

function connected(s: GameState): boolean {
  const act = s.nodes.filter((n) => n.active).map((n) => n.id);
  const seen = new Set<number>([act[0]!]);
  const q = [act[0]!];
  while (q.length) {
    const n = q.pop()!;
    for (const e of s.edges) {
      if (e.removed || (e.a !== n && e.b !== n)) continue;
      const o = e.a === n ? e.b : e.a;
      if (!seen.has(o)) {
        seen.add(o);
        q.push(o);
      }
    }
  }
  return act.every((id) => seen.has(id));
}

function planar(s: GameState): boolean {
  const es = s.edges.filter((e) => !e.removed);
  for (const e of es) {
    for (const f of es) {
      if (e.id >= f.id) continue;
      const a = s.nodes[e.a]!;
      const b = s.nodes[e.b]!;
      const c = s.nodes[f.a]!;
      const d = s.nodes[f.b]!;
      if (segmentsCross(a.x, a.y, b.x, b.y, c.x, c.y, d.x, d.y)) return false;
    }
  }
  return true;
}

describe('geom', () => {
  it('detects a proper crossing', () => {
    expect(segmentsCross(0, 0, 10, 10, 0, 10, 10, 0)).toBe(true);
  });
  it('ignores segments that only share an endpoint', () => {
    expect(segmentsCross(0, 0, 10, 0, 10, 0, 20, 5)).toBe(false);
  });
  it('treats collinear overlap as crossing', () => {
    expect(segmentsCross(0, 0, 10, 0, 5, 0, 15, 0)).toBe(true);
  });
  it('ignores disjoint parallels', () => {
    expect(segmentsCross(0, 0, 10, 0, 0, 5, 10, 5)).toBe(false);
  });
});

describe('board', () => {
  it('places every candidate inside the margins with minimum spacing', () => {
    for (const seed of SEEDS) {
      const s = createGame({ seed, mode: 'endless' });
      for (const n of s.nodes) {
        expect(n.x).toBeGreaterThanOrEqual(MARGIN);
        expect(n.x).toBeLessThanOrEqual(BOARD_W - MARGIN);
        expect(n.y).toBeGreaterThanOrEqual(MARGIN);
        expect(n.y).toBeLessThanOrEqual(BOARD_H - MARGIN);
      }
      for (const a of s.nodes) {
        for (const b of s.nodes) {
          if (a.id < b.id) expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(MIN_SPACING - 1e-9);
        }
      }
    }
  });

  it('keeps web, vault and out far apart', () => {
    for (const seed of SEEDS) {
      const s = createGame({ seed, mode: 'endless' });
      const w = s.nodes[s.web]!;
      const v = s.nodes[s.vault]!;
      const o = s.nodes[s.out]!;
      for (const [p, q] of [
        [w, v],
        [w, o],
        [v, o],
      ] as const) {
        expect(Math.hypot(p.x - q.x, p.y - q.y)).toBeGreaterThanOrEqual(SPECIAL_MIN_DIST - 1e-9);
      }
    }
  });

  it('starts wave 1 with the four special nodes and four agents', () => {
    const s = createGame({ seed: 'w1', mode: 'endless' });
    const active = s.nodes.filter((n) => n.active);
    expect(active.length).toBe(8);
    expect(active.filter((n) => n.kind === 'agent').length).toBe(4);
    for (const id of [s.user, s.web, s.vault, s.out]) expect(s.nodes[id]!.active).toBe(true);
  });

  it('stays connected, planar and degree-capped through 14 growths', () => {
    for (const seed of SEEDS.slice(0, 100)) {
      const s = createGame({ seed, mode: 'endless' });
      for (let w = 0; w <= 14; w++) {
        expect(connected(s)).toBe(true);
        expect(planar(s)).toBe(true);
        for (const n of s.nodes) expect(n.degree).toBeLessThanOrEqual(MAX_DEGREE);
        growWave(s);
      }
    }
  });

  it('keeps degrees in sync with the edge list', () => {
    const s = createGame({ seed: 'deg', mode: 'endless' });
    for (let w = 0; w < 10; w++) growWave(s);
    for (const n of s.nodes) {
      const d = s.edges.filter((e) => !e.removed && (e.a === n.id || e.b === n.id)).length;
      expect(n.degree).toBe(d);
    }
  });

  it('is deterministic per seed', () => {
    const a = createGame({ seed: 'same', mode: 'endless' });
    const b = createGame({ seed: 'same', mode: 'endless' });
    expect(a.nodes.map((n) => [n.x, n.y])).toEqual(b.nodes.map((n) => [n.x, n.y]));
    expect(a.edges.map((e) => [e.a, e.b])).toEqual(b.edges.map((e) => [e.a, e.b]));
  });
});
