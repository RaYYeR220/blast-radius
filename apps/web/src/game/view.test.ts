import { describe, expect, it } from 'vitest';
import { boardTransform, fitView, toBoard, toScreen } from './view';

describe('view', () => {
  for (const [w, h] of [[1440, 900], [390, 844], [1024, 1366], [2560, 1080]] as const) {
    it(`round-trips board points at ${w}x${h}`, () => {
      const v = fitView(w, h, 2);
      expect(v.rotate).toBe(h > w);
      for (const [bx, by] of [[0, 0], [1600, 1000], [800, 500], [123.5, 987.25]]) {
        const p = toScreen(v, bx!, by!);
        const q = toBoard(v, p.x, p.y);
        expect(q.x).toBeCloseTo(bx!, 6);
        expect(q.y).toBeCloseTo(by!, 6);
      }
    });
  }

  it('keeps the whole board on screen inside the safe area', () => {
    for (const [w, h] of [[1440, 900], [390, 844]] as const) {
      const v = fitView(w, h, 1, { top: 60, right: 10, bottom: 70, left: 10 });
      for (const [bx, by] of [[0, 0], [1600, 0], [0, 1000], [1600, 1000]]) {
        const p = toScreen(v, bx!, by!);
        expect(p.x).toBeGreaterThanOrEqual(10 - 1e-6);
        expect(p.x).toBeLessThanOrEqual(w - 10 + 1e-6);
        expect(p.y).toBeGreaterThanOrEqual(60 - 1e-6);
        expect(p.y).toBeLessThanOrEqual(h - 70 + 1e-6);
      }
    }
  });

  it('maps the same board point consistently after a resize', () => {
    const a = fitView(1440, 900, 1);
    const b = fitView(390, 844, 2);
    const pa = toScreen(a, 400, 250);
    const pb = toScreen(b, 400, 250);
    expect(toBoard(a, pa.x, pa.y).x).toBeCloseTo(400, 6);
    expect(toBoard(b, pb.x, pb.y).y).toBeCloseTo(250, 6);
  });
});

describe('camera window', () => {
  const rect = { x: 200, y: 150, w: 900, h: 560 };
  for (const [w, h] of [[1440, 900], [390, 844]] as const) {
    it(`round-trips through a sub-rectangle at ${w}x${h}`, () => {
      const v = fitView(w, h, 2, undefined, rect);
      for (const [bx, by] of [[200, 150], [1100, 710], [650, 430]]) {
        const p = toScreen(v, bx!, by!);
        const q = toBoard(v, p.x, p.y);
        expect(q.x).toBeCloseTo(bx!, 6);
        expect(q.y).toBeCloseTo(by!, 6);
      }
    });

    it(`fills the screen with the window's corners at ${w}x${h}`, () => {
      const v = fitView(w, h, 1, undefined, rect);
      const corners = [[rect.x, rect.y], [rect.x + rect.w, rect.y + rect.h]].map(([x, y]) => toScreen(v, x!, y!));
      const spanX = Math.abs(corners[1]!.x - corners[0]!.x);
      const spanY = Math.abs(corners[1]!.y - corners[0]!.y);
      expect(Math.max(spanX / w, spanY / h)).toBeGreaterThan(0.99);
    });
  }

  it('agrees with the canvas transform', () => {
    const v = fitView(390, 844, 2, undefined, rect);
    const [a, b, c, d, e, f] = boardTransform(v);
    for (const [bx, by] of [[300, 200], [1000, 600]]) {
      const p = toScreen(v, bx!, by!);
      expect((a * bx! + c * by! + e) / v.dpr).toBeCloseTo(p.x, 6);
      expect((b * bx! + d * by! + f) / v.dpr).toBeCloseTo(p.y, 6);
    }
  });
});
