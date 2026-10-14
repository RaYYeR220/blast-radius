import type { GameState } from '@blast/sim';
import type { Frame } from './frame';
import { glyphPath } from './glyphs';
import { clamp, lerp, TAU } from './math';
import { C, MONO } from './palette';

type P = [number, number];

function trace(ctx: CanvasRenderingContext2D, pts: readonly P[], done: number, part: number, w: number, col: string, al: number): void {
  ctx.globalAlpha = al;
  ctx.lineWidth = w;
  ctx.strokeStyle = col;
  ctx.beginPath();
  ctx.moveTo(pts[0]![0], pts[0]![1]);
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    if (i < done) ctx.lineTo(b[0], b[1]);
    else if (i === done) {
      ctx.lineTo(lerp(a[0], b[0], part), lerp(a[1], b[1], part));
      break;
    }
  }
  ctx.stroke();
}

/** The route the key took, drawn hop by hop in the threat colour with numbered stops. `prog` counts hops. */
export function drawLeakPath(f: Frame, s: GameState, prog: number): void {
  const path = s.leakPath;
  if (!path || path.length < 2) return;
  const { ctx, af, kk } = f;
  const pts: P[] = path.map((id) => {
    const n = s.nodes[id]!;
    return [af.x(n.x, n.y), af.y(n.x, n.y)];
  });
  const nseg = pts.length - 1;
  const done = Math.floor(prog);
  const part = prog - done;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  trace(ctx, pts, done, part, 16 * kk, C.thr, 0.16);
  trace(ctx, pts, done, part, 4.2 * kk, C.thr, 1);
  trace(ctx, pts, done, part, 1.3 * kk, C.deep, 1);
  ctx.globalAlpha = 1;
  const fs = Math.round(clamp(10 * kk, 10, 12));
  for (let i = 0; i <= Math.min(done + (part > 0 ? 1 : 0), nseg); i++) {
    if (i > done && part <= 0) break;
    const [x, y] = pts[i]!;
    const last = i === nseg && prog >= nseg;
    ctx.beginPath();
    ctx.arc(x, y, 9 * kk, 0, TAU);
    ctx.fillStyle = last ? C.thr : '#fff';
    ctx.fill();
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = last ? C.deep : C.ink;
    ctx.stroke();
    ctx.font = `400 ${fs}px ${MONO}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = last ? '#fff' : C.ink;
    ctx.fillText(String(i + 1), x, y + 0.5);
  }
  if (prog < nseg) drawRunner(ctx, s, path, pts, done, part, kk);
  ctx.textAlign = 'left';
  ctx.lineCap = 'butt';
}

/** The injection walking the path; it carries the key once it has passed the vault. */
function drawRunner(ctx: CanvasRenderingContext2D, s: GameState, path: readonly number[], pts: readonly P[], done: number, part: number, kk: number): void {
  const i = Math.min(done, pts.length - 2);
  const a = pts[i]!;
  const b = pts[i + 1]!;
  const hx = lerp(a[0], b[0], part);
  const hy = lerp(a[1], b[1], part);
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const r = 9 * kk;
  glyphPath(ctx, 'plain', hx, hy, r, ang);
  ctx.lineWidth = 3;
  ctx.strokeStyle = C.ground;
  ctx.stroke();
  ctx.fillStyle = C.thr;
  ctx.fill();
  if (s.nodes[path[i]!] && i >= path.indexOf(s.vault)) {
    ctx.beginPath();
    ctx.arc(hx, hy, r * 0.4, 0, TAU);
    ctx.fillStyle = C.gold;
    ctx.fill();
  }
}
