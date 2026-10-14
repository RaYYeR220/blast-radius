import type { Frame } from './frame';
import { TAU } from './math';
import { C } from './palette';
import type { Dust } from './pools';

/** The drifting dot field: it swells with threat and some dots turn the threat colour. */
export function drawDust(f: Frame, dust: readonly Dust[], drift: number, dim: number): void {
  const { ctx, W, H } = f;
  const amp = 1 + f.thr * 1.3;
  const warmF = f.thr * 0.32;
  const d0 = new Path2D();
  const d1 = new Path2D();
  const d2 = new Path2D();
  const dt = new Path2D();
  for (const d of dust) {
    const x = d.x * W + Math.sin((drift * TAU) / d.px + d.ph) * d.ax * amp;
    const y = d.y * H + Math.cos((drift * TAU) / d.py + d.ph) * d.ay * amp;
    (d.o < warmF ? dt : d.b === 0 ? d0 : d.b === 1 ? d1 : d2).rect(x, y, d.sz, d.sz);
  }
  ctx.fillStyle = C.ink;
  ctx.globalAlpha = 0.1 * dim;
  ctx.fill(d0);
  ctx.globalAlpha = 0.2 * dim;
  ctx.fill(d1);
  ctx.globalAlpha = 0.34 * dim;
  ctx.fill(d2);
  ctx.fillStyle = C.thr;
  ctx.globalAlpha = 0.5;
  ctx.fill(dt);
  ctx.globalAlpha = 1;
}
