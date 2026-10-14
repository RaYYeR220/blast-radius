import { type GameState, type Variant } from '@blast/sim';
import { packetXY } from '../../game/session';
import type { Frame } from './frame';
import { clamp, easeOut, lerp, rng, TAU } from './math';
import { C, DISPLAY, MONO } from './palette';

interface At {
  /** Start time (performance.now ms); set when the effect is added. */
  t0: number;
  dur: number;
  /** Board position. */
  bx: number;
  by: number;
}

export interface BurstDot {
  c: number;
  s: number;
  v: number;
  z: number;
  col: 0 | 1 | 2;
}

/** A short-lived effect, drawn in screen space at a board position. */
export type Fx = At &
  (
    | { k: 'burst'; ps: BurstDot[]; variant: Variant | null }
    | { k: 'pop'; text: string }
    | { k: 'combo'; n: number }
    | { k: 'cut'; edge: number; trip: boolean }
    | { k: 'infect' }
    | { k: 'ring'; col: string; r0: number; r1: number; lw: number; a?: number }
    | { k: 'seal' }
    | { k: 'secret' }
    | { k: 'heal'; edge: number; t: number }
    | { k: 'reveal'; pid: number }
    | { k: 'tag'; pid: number; text: string; col: string; lx?: number; ly?: number }
    | { k: 'label'; text: string; col: string }
    | { k: 'deny'; text: string }
  );

export function makeBurst(bx: number, by: number, variant: Variant | null, dur: number): Fx {
  const R = rng((Math.random() * 1e9) | 0);
  const ps: BurstDot[] = [];
  for (let i = 0; i < 46; i++) {
    const a = R() * TAU;
    ps.push({ c: Math.cos(a), s: Math.sin(a), v: 18 + Math.pow(R(), 0.7) * 120, z: 1.4 + R() * 2.6, col: i % 4 === 0 ? 2 : i % 3 === 0 ? 1 : 0 });
  }
  return { k: 'burst', t0: 0, dur, bx, by, ps, variant };
}

type Draw<K extends Fx['k']> = (f: Frame, fx: Extract<Fx, { k: K }>, a: number, x: number, y: number, s: GameState) => void;

/** An intercept: white pop, an orange shock ring, an ink ring and a spray of dots. */
const burst: Draw<'burst'> = ({ ctx, kk }, fx, a, x, y) => {
  if (a < 0.22) {
    const fa = a / 0.22;
    ctx.globalAlpha = 1 - fa;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(x, y, (20 - 12 * fa) * kk, 0, TAU);
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = C.ink;
    ctx.stroke();
  }
  const e = easeOut(a);
  ctx.globalAlpha = 1 - a;
  ctx.lineWidth = 3.4 * (1 - a) + 0.5;
  ctx.strokeStyle = C.thr;
  ctx.beginPath();
  ctx.arc(x, y, (8 + 70 * e) * kk, 0, TAU);
  ctx.stroke();
  ctx.globalAlpha = (1 - a) * 0.6;
  ctx.lineWidth = 1;
  ctx.strokeStyle = C.ink;
  ctx.beginPath();
  ctx.arc(x, y, (4 + 44 * easeOut(clamp(a * 1.4, 0, 1))) * kk, 0, TAU);
  ctx.stroke();
  const cols = [C.thr, C.deep, C.ink] as const;
  for (const p of fx.ps) {
    const d = p.v * e * kk;
    const z = p.z * (1 - a * 0.5);
    ctx.globalAlpha = 1 - a * a;
    ctx.fillStyle = cols[p.col];
    ctx.fillRect(x + p.c * d - z / 2, y + p.s * d - z / 2, z, z);
  }
};

function outlinedText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, lw: number, fill: string): void {
  ctx.lineWidth = lw;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = C.ground;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

const pop: Draw<'pop'> = ({ ctx, kk }, fx, a, x, y) => {
  ctx.globalAlpha = a < 0.7 ? 1 : 1 - (a - 0.7) / 0.3;
  ctx.font = `600 ${Math.round(15 * clamp(kk, 0.9, 1.2))}px ${DISPLAY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const yy = y - 18 * kk - 26 * easeOut(a);
  outlinedText(ctx, fx.text, x + 16 * kk, yy, 3, C.ink);
};

const combo: Draw<'combo'> = ({ ctx, kk }, fx, a, x, y) => {
  const sc = a < 0.12 ? lerp(0.5, 1.2, a / 0.12) : a < 0.22 ? lerp(1.2, 1, (a - 0.12) / 0.1) : 1;
  ctx.globalAlpha = a < 0.75 ? 1 : 1 - (a - 0.75) / 0.25;
  const yy = y - 44 * kk - 18 * easeOut(a);
  const size = Math.round(46 * clamp(kk, 0.85, 1.25) * sc);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `600 ${size}px ${DISPLAY}`;
  outlinedText(ctx, `×${fx.n}`, x, yy, 6, C.thr);
  ctx.font = `500 ${Math.round(12 * clamp(kk, 0.95, 1.2))}px ${MONO}`;
  outlinedText(ctx, `combo +${50 * (fx.n - 1)}`, x, yy + 18, 3, C.ink);
};

/** A cut: a stroke across the link and dots thrown along it. */
const cut: Draw<'cut'> = ({ ctx, af, kk }, fx, a, x, y, s) => {
  const ed = s.edges[fx.edge];
  if (!ed) return;
  const A = s.nodes[ed.a]!;
  const Bn = s.nodes[ed.b]!;
  const dx = af.x(Bn.x, Bn.y) - af.x(A.x, A.y);
  const dy = af.y(Bn.x, Bn.y) - af.y(A.x, A.y);
  const L = Math.hypot(dx, dy) || 1;
  const ux = dx / L;
  const uy = dy / L;
  const R = rng(fx.edge * 13 + 1);
  const e = easeOut(a);
  ctx.fillStyle = C.ink;
  for (let i = 0; i < 26; i++) {
    const side = i % 2 ? 1 : -1;
    const sp = (8 + R() * 40) * kk * e;
    const sw = (R() - 0.5) * 16 * kk * e;
    ctx.globalAlpha = (1 - a) * (0.4 + R() * 0.6);
    ctx.fillRect(x + ux * sp * side - uy * sw, y + uy * sp * side + ux * sw, 1.7, 1.7);
  }
  ctx.globalAlpha = 1 - a;
  ctx.strokeStyle = fx.trip ? C.thr : C.ink;
  ctx.lineWidth = 2;
  const h = 16 * kk * (1 - a * 0.3);
  ctx.beginPath();
  ctx.moveTo(x - uy * h, y + ux * h);
  ctx.lineTo(x + uy * h, y - ux * h);
  ctx.stroke();
};

const infect: Draw<'infect'> = ({ ctx, kk }, _fx, a, x, y) => {
  if (a < 0.3) {
    const fa = a / 0.3;
    ctx.globalAlpha = (1 - fa) * 0.9;
    ctx.fillStyle = C.ink;
    ctx.beginPath();
    ctx.arc(x, y, (46 - 30 * fa) * kk, 0, TAU);
    ctx.fill();
  }
  const e = easeOut(a);
  ctx.globalAlpha = 1 - a;
  ctx.lineWidth = 5 * (1 - a) + 0.6;
  ctx.strokeStyle = C.thr;
  ctx.beginPath();
  ctx.arc(x, y, (14 + 150 * e) * kk, 0, TAU);
  ctx.stroke();
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = C.deep;
  ctx.beginPath();
  ctx.arc(x, y, (10 + 96 * easeOut(clamp(a * 1.3, 0, 1))) * kk, 0, TAU);
  ctx.stroke();
};

const ring: Draw<'ring'> = ({ ctx, kk }, fx, a, x, y) => {
  ctx.globalAlpha = (1 - a) * (fx.a ?? 1);
  ctx.lineWidth = fx.lw;
  ctx.strokeStyle = fx.col;
  ctx.beginPath();
  ctx.arc(x, y, lerp(fx.r0, fx.r1, easeOut(a)) * kk, 0, TAU);
  ctx.stroke();
};

const seal: Draw<'seal'> = ({ ctx, kk }, _fx, a, x, y) => {
  const r = lerp(70, 22, easeOut(a)) * kk;
  ctx.globalAlpha = 1 - a * 0.8;
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = C.ink;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.stroke();
  for (let i = 0; i < 8; i++) {
    const an = (i / 8) * TAU;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(an) * r, y + Math.sin(an) * r);
    ctx.lineTo(x + Math.cos(an) * (r + 7 * kk), y + Math.sin(an) * (r + 7 * kk));
    ctx.stroke();
  }
};

const secret: Draw<'secret'> = ({ ctx, kk }, _fx, a, x, y) => {
  for (let i = 0; i < 3; i++) {
    const aa = clamp(a * 1.4 - i * 0.18, 0, 1);
    if (aa <= 0 || aa >= 1) continue;
    ctx.globalAlpha = 1 - aa;
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = C.gold;
    ctx.beginPath();
    ctx.arc(x, y, (16 + 70 * easeOut(aa)) * kk, 0, TAU);
    ctx.stroke();
  }
};

const heal: Draw<'heal'> = ({ ctx, af, kk }, fx, a, _x, _y, s) => {
  const ed = s.edges[fx.edge];
  if (!ed) return;
  const A = s.nodes[ed.a]!;
  const Bn = s.nodes[ed.b]!;
  const t = fx.t >= 0 ? fx.t : 0.5;
  const bx = lerp(A.x, Bn.x, t);
  const by = lerp(A.y, Bn.y, t);
  ctx.globalAlpha = (1 - a) * 0.8;
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = C.ink;
  ctx.beginPath();
  ctx.arc(af.x(bx, by), af.y(bx, by), (4 + 16 * easeOut(a)) * kk, 0, TAU);
  ctx.stroke();
};

/** A stealth injection showing its true colours. */
const reveal: Draw<'reveal'> = ({ ctx, af, kk }, fx, a, _x, _y, s) => {
  const p = s.packets.find((q) => q.id === fx.pid);
  if (!p) return;
  const pos = packetXY(s, p);
  const x = af.x(pos.x, pos.y);
  const y = af.y(pos.x, pos.y);
  ctx.globalAlpha = 1 - a;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(x, y, (18 - 10 * a) * kk, 0, TAU);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = C.thr;
  ctx.beginPath();
  ctx.arc(x, y, (8 + 30 * easeOut(a)) * kk, 0, TAU);
  ctx.stroke();
};

/** A small mono tag that follows a packet. */
const tag: Draw<'tag'> = ({ ctx, af, kk }, fx, a, _x, _y, s) => {
  const p = s.packets.find((q) => q.id === fx.pid);
  if (p) {
    const pos = packetXY(s, p);
    fx.lx = pos.x;
    fx.ly = pos.y;
  } else if (fx.lx === undefined) return;
  const x = af.x(fx.lx, fx.ly ?? 0);
  const y = af.y(fx.lx, fx.ly ?? 0);
  ctx.globalAlpha = a < 0.8 ? 1 : 1 - (a - 0.8) / 0.2;
  ctx.font = `400 ${Math.round(clamp(11.5 * kk, 11, 13))}px ${MONO}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  outlinedText(ctx, fx.text, x + 16 * kk, y - 16 * kk, 3.5, fx.col);
};

const label: Draw<'label'> = ({ ctx, kk }, fx, a, x, y) => {
  ctx.globalAlpha = a < 0.85 ? 1 : 1 - (a - 0.85) / 0.15;
  ctx.font = `400 ${Math.round(clamp(11.5 * kk, 11, 13))}px ${MONO}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  outlinedText(ctx, fx.text, x, y + 30 * kk, 3.5, fx.col);
};

/** A refused quarantine: a struck circle that shakes, with the reason under it. */
const deny: Draw<'deny'> = ({ ctx, kk }, fx, a, x, y) => {
  const sh = a < 0.3 ? Math.sin(a * 60) * 4 * (1 - a / 0.3) : 0;
  const r = 24 * kk;
  ctx.globalAlpha = a < 0.7 ? 1 : 1 - (a - 0.7) / 0.3;
  ctx.lineWidth = 2;
  ctx.strokeStyle = C.ink;
  ctx.beginPath();
  ctx.arc(x + sh, y, r, 0, TAU);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + sh - r * 0.7, y + r * 0.7);
  ctx.lineTo(x + sh + r * 0.7, y - r * 0.7);
  ctx.stroke();
  ctx.font = `600 ${Math.round(clamp(14 * kk, 13, 16))}px ${DISPLAY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  outlinedText(ctx, fx.text, x + sh, y + r + 8, 4, C.ink);
};

function drawOne(f: Frame, fx: Fx, a: number, x: number, y: number, s: GameState): void {
  switch (fx.k) {
    case 'burst': return burst(f, fx, a, x, y, s);
    case 'pop': return pop(f, fx, a, x, y, s);
    case 'combo': return combo(f, fx, a, x, y, s);
    case 'cut': return cut(f, fx, a, x, y, s);
    case 'infect': return infect(f, fx, a, x, y, s);
    case 'ring': return ring(f, fx, a, x, y, s);
    case 'seal': return seal(f, fx, a, x, y, s);
    case 'secret': return secret(f, fx, a, x, y, s);
    case 'heal': return heal(f, fx, a, x, y, s);
    case 'reveal': return reveal(f, fx, a, x, y, s);
    case 'tag': return tag(f, fx, a, x, y, s);
    case 'label': return label(f, fx, a, x, y, s);
    case 'deny': return deny(f, fx, a, x, y, s);
  }
}

/** Draws every live effect and drops the finished ones. */
export function drawFx(f: Frame, list: Fx[], s: GameState): void {
  const { ctx, af, now } = f;
  for (let i = list.length - 1; i >= 0; i--) {
    const fx = list[i]!;
    const a = (now - fx.t0) / fx.dur;
    if (a >= 1) {
      list.splice(i, 1);
      continue;
    }
    if (a < 0) continue;
    drawOne(f, fx, a, af.x(fx.bx, fx.by), af.y(fx.bx, fx.by), s);
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';
}
