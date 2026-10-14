import { describe, expect, it } from 'vitest';
import { toBoard, toScreen } from './view';
import { bestFit, grow, regionView, reportRegion, titleRegion } from './viewport';

const rect = { x: 100, y: 50, w: 1200, h: 800 };

describe('viewport', () => {
  it('grows a window about its centre, with a floor', () => {
    expect(grow(rect, 1.5)).toEqual({ x: -200, y: -150, w: 1800, h: 1200 });
    expect(grow({ x: 0, y: 0, w: 100, h: 100 }, 1, 900, 600)).toEqual({ x: -400, y: -250, w: 900, h: 600 });
  });

  it('centres the window in its region and round-trips coordinates', () => {
    const region = { x: 28, y: 36, w: 800, h: 800 };
    for (const rotate of [false, true]) {
      const v = regionView(region, rect, rotate, 1440, 900, 2);
      const c = toScreen(v, rect.x + rect.w / 2, rect.y + rect.h / 2);
      expect(c.x).toBeCloseTo(region.x + region.w / 2);
      expect(c.y).toBeCloseTo(region.y + region.h / 2);
      const b = toBoard(v, 300, 400);
      const back = toScreen(v, b.x, b.y);
      expect(back.x).toBeCloseTo(300);
      expect(back.y).toBeCloseTo(400);
    }
  });

  it('turns the board only when that shows it clearly larger', () => {
    expect(bestFit({ x: 0, y: 0, w: 400, h: 900 }, rect, 400, 900, 1).rotate).toBe(true);
    expect(bestFit({ x: 0, y: 0, w: 1400, h: 900 }, rect, 1400, 900, 1).rotate).toBe(false);
  });

  it('keeps the report board clear of the report panel', () => {
    const d = reportRegion(1440, 900);
    expect(d.x + d.w).toBeLessThanOrEqual(1440 - 560);
    const p = reportRegion(390, 844);
    expect(p.y + p.h).toBeLessThanOrEqual(844 * 0.4);
  });

  it('fits the title board above the type on phone', () => {
    const r = titleRegion(390, 844, 380);
    expect(r.y + r.h).toBeLessThanOrEqual(380 - 22);
    expect(titleRegion(390, 844, 100).h).toBe(160);
  });
});
