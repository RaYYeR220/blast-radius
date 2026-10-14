import type { Frame } from './frame';
import { clamp, lerp } from './math';
import { C } from './palette';

export interface TrailPoint {
  x: number;
  y: number;
  /** performance.now ms */
  t: number;
}

const LIFE = 150;

/** Traces a tapered ribbon along screen points, thin at the tail and w1 wide at the head. */
export function ribbon(ctx: CanvasRenderingContext2D, pts: ReadonlyArray<{ x: number; y: number }>, w0: number, w1: number): void {
  const L: Array<[number, number]> = [];
  const R: Array<[number, number]> = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)]!;
    const b = pts[Math.min(pts.length - 1, i + 1)]!;
    let nx = -(b.y - a.y);
    let ny = b.x - a.x;
    const m = Math.hypot(nx, ny) || 1;
    nx /= m;
    ny /= m;
    const f = i / (pts.length - 1);
    const w = lerp(w0, w1, f * f) / 2;
    const p = pts[i]!;
    L.push([p.x + nx * w, p.y + ny * w]);
    R.push([p.x - nx * w, p.y - ny * w]);
  }
  ctx.beginPath();
  ctx.moveTo(L[0]![0], L[0]![1]);
  for (const p of L) ctx.lineTo(p[0], p[1]);
  const h = pts[pts.length - 1]!;
  const hp = pts[pts.length - 2]!;
  const dx = h.x - hp.x;
  const dy = h.y - hp.y;
  const m = Math.hypot(dx, dy) || 1;
  ctx.lineTo(h.x + (dx / m) * w1 * 0.8, h.y + (dy / m) * w1 * 0.8);
  for (let i = R.length - 1; i >= 0; i--) ctx.lineTo(R[i]![0], R[i]![1]);
  ctx.closePath();
}

/** The blade: a tapered ink ribbon with a bright threat edge, fading within 150 ms. Drops expired points. */
export function drawBlade(f: Frame, trail: TrailPoint[]): void {
  const { ctx, now } = f;
  while (trail.length && now - trail[0]!.t > LIFE) trail.shift();
  if (trail.length < 2) return;
  const pts = trail.slice(-16);
  const age = (now - pts[pts.length - 1]!.t) / LIFE;
  const al = 1 - clamp(age, 0, 1);
  ctx.globalAlpha = al;
  ribbon(ctx, pts, 0.4, 9);
  ctx.fillStyle = C.ink;
  ctx.fill();
  ctx.globalAlpha = al * 0.9;
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = C.thr;
  ctx.beginPath();
  ctx.moveTo(pts[0]!.x, pts[0]!.y);
  for (const p of pts) ctx.lineTo(p.x, p.y);
  ctx.stroke();
  ctx.globalAlpha = 1;
}
