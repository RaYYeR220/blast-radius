import type { GameState } from '@blast/sim';
import type { Rect } from './view';

/** Board units kept clear around the outermost nodes. */
export const PAD = 110;
/** The closest the camera will zoom in. */
export const MIN_WINDOW = { w: 820, h: 520 };
const EASE = 0.05;

/** The board window that frames every active node. */
export function targetWindow(s: GameState): Rect {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const n of s.nodes) {
    if (!n.active) continue;
    x0 = Math.min(x0, n.x);
    y0 = Math.min(y0, n.y);
    x1 = Math.max(x1, n.x);
    y1 = Math.max(y1, n.y);
  }
  if (x0 === Infinity) return { x: 0, y: 0, w: 1600, h: 1000 };
  let w = x1 - x0 + PAD * 2;
  let h = y1 - y0 + PAD * 2;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  w = Math.max(w, MIN_WINDOW.w);
  h = Math.max(h, MIN_WINDOW.h);
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

/** Follows the swarm: snaps on the first frame, then eases out as it grows. */
export class Camera {
  private cur: Rect | null = null;

  update(s: GameState): Rect {
    const t = targetWindow(s);
    if (!this.cur) {
      this.cur = t;
      return { ...t };
    }
    const c = this.cur;
    c.x += (t.x - c.x) * EASE;
    c.y += (t.y - c.y) * EASE;
    c.w += (t.w - c.w) * EASE;
    c.h += (t.h - c.h) * EASE;
    return { ...c };
  }

  reset(): void {
    this.cur = null;
  }
}
