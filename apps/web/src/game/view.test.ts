import { describe, expect, it } from 'vitest';
import { fitView, toBoard, toScreen } from './view';

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
