import type { View } from '../../game/view';

/**
 * Board units → CSS pixels for the current view, as a plain affine so the
 * hot loops can place thousands of dots without allocating. Matches toScreen().
 */
export class Affine {
  a = 1;
  b = 0;
  c = 0;
  d = 0;
  e = 1;
  f = 0;
  /** CSS pixels per board unit. */
  s = 1;

  set(v: View): void {
    const r = v.rect;
    const s = v.scale;
    this.s = s;
    if (v.rotate) {
      this.a = 0;
      this.b = -s;
      this.c = v.ox + (r.y + r.h) * s;
      this.d = s;
      this.e = 0;
      this.f = v.oy - r.x * s;
    } else {
      this.a = s;
      this.b = 0;
      this.c = v.ox - r.x * s;
      this.d = 0;
      this.e = s;
      this.f = v.oy - r.y * s;
    }
  }

  x(bx: number, by: number): number {
    return this.a * bx + this.b * by + this.c;
  }

  y(bx: number, by: number): number {
    return this.d * bx + this.e * by + this.f;
  }
}
