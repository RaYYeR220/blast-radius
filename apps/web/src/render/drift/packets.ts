import type { GameState, Packet } from '@blast/sim';
import { packetXY, type Session } from '../../game/session';
import type { Frame } from './frame';
import { glyphPath, polyPath, secretAt, SHAPE } from './glyphs';
import { frac, lerp, rng, TAU } from './math';
import { C } from './palette';
import type { Scene } from './scene';
import { halos } from './sprites';

/** Remembers the last fourteen positions of every injection, for its comet tail. Call once per tick. */
export function recordHist(scene: Scene, s: GameState): void {
  for (const p of s.packets) {
    if (p.dead || p.kind !== 'inject') continue;
    let h = scene.hist.get(p.id);
    if (!h) scene.hist.set(p.id, (h = []));
    const xy = packetXY(s, p);
    h.push(xy.x, xy.y);
    if (h.length > 28) h.splice(0, 2);
  }
  if (s.tick % 90 === 0) {
    const alive = new Set(s.packets.map((p) => p.id));
    for (const k of scene.hist.keys()) if (!alive.has(k)) scene.hist.delete(k);
    for (const k of scene.lastAng.keys()) if (!alive.has(k)) scene.lastAng.delete(k);
  }
}

function pktPos(sess: Session, s: GameState, p: Packet, alpha: number): { x: number; y: number } {
  const cur = packetXY(s, p);
  const pv = sess.prev.get(p.id);
  if (!pv || alpha >= 1) return cur;
  return { x: pv.x + (cur.x - pv.x) * alpha, y: pv.y + (cur.y - pv.y) * alpha };
}

/** Screen heading of a packet, kept while it waits on a node. */
function pktAngle(f: Frame, scene: Scene, s: GameState, p: Packet): number {
  if (p.edge >= 0) {
    const a = s.nodes[p.from]!;
    const b = s.nodes[p.to]!;
    const ddx = b.x - a.x;
    const ddy = b.y - a.y;
    const { af } = f;
    const ang = Math.atan2(af.d * ddx + af.e * ddy, af.a * ddx + af.b * ddy);
    scene.lastAng.set(p.id, ang);
    return ang;
  }
  return scene.lastAng.get(p.id) ?? 0;
}

interface Placed {
  p: Packet;
  x: number;
  y: number;
  a: number;
}

/** Tasks as small white beads, knocked out of the stream; one batched pass. */
function drawTasks(f: Frame, sess: Session, s: GameState, alpha: number, dim: number, inj: Packet[]): void {
  const { ctx, af } = f;
  const rT = Math.max(3.5, 4.4 * f.kk);
  const knock = new Path2D();
  const body = new Path2D();
  for (const p of s.packets) {
    if (p.dead) continue;
    if (p.kind === 'inject' && p.revealed) {
      inj.push(p);
      continue;
    }
    const pos = pktPos(sess, s, p, alpha);
    const x = af.x(pos.x, pos.y);
    const y = af.y(pos.x, pos.y);
    knock.moveTo(x + rT + 1.6, y);
    knock.arc(x, y, rT + 1.6, 0, TAU);
    body.moveTo(x + rT, y);
    body.arc(x, y, rT, 0, TAU);
  }
  ctx.globalAlpha = dim;
  ctx.fillStyle = C.ground;
  ctx.fill(knock);
  ctx.fillStyle = '#ffffff';
  ctx.fill(body);
  ctx.lineWidth = 1.35;
  ctx.strokeStyle = C.ink;
  ctx.stroke(body);
  ctx.globalAlpha = 1;
}

/** Comet dust behind every injection, in one batched pass. */
function drawComets(f: Frame, scene: Scene, poses: readonly Placed[], quiet: boolean): void {
  const { ctx, af, kk, t } = f;
  const c0 = new Path2D();
  const c1 = new Path2D();
  const c2 = new Path2D();
  for (const q of poses) {
    const h = scene.hist.get(q.p.id);
    if (!h || h.length < 6) continue;
    const R = rng(q.p.id * 31 + 7);
    const n = h.length / 2;
    for (let j = 0; j < 30; j++) {
      const fr = j / 30;
      const idx = (n - 1) * (1 - fr);
      const i0 = Math.floor(idx);
      const i1 = Math.min(n - 1, i0 + 1);
      const m = idx - i0;
      const bxp = lerp(h[i0 * 2]!, h[i1 * 2]!, m);
      const byp = lerp(h[i0 * 2 + 1]!, h[i1 * 2 + 1]!, m);
      const jx = (R() - 0.5) * (2 + fr * 9) * kk + Math.sin(t * 9 + j) * fr * 1.5;
      const jy = (R() - 0.5) * (2 + fr * 9) * kk;
      const x = af.x(bxp, byp) + jx;
      const y = af.y(bxp, byp) + jy;
      const z = (2.2 - fr * 1.2) * kk;
      (fr < 0.3 ? c2 : fr < 0.65 ? c1 : c0).rect(x - z / 2, y - z / 2, z, z);
    }
  }
  const cq = quiet ? 0.35 : 1;
  ctx.fillStyle = C.thr;
  ctx.globalAlpha = 0.28 * cq;
  ctx.fill(c0);
  ctx.globalAlpha = 0.55 * cq;
  ctx.fill(c1);
  ctx.globalAlpha = 0.9 * cq;
  ctx.fill(c2);
  ctx.globalAlpha = 1;
}

/** One injection: halo, pulse ring, the glyph in threat orange with a darker core, and the key if it carries one. */
function drawInjection(f: Frame, q: Placed, rI: number, quiet: boolean): void {
  const { ctx, t } = f;
  const { p, x, y, a } = q;
  const pulse = frac(t * 1.25 + p.id * 0.137);
  const r = quiet ? rI * 0.8 : rI;
  if (!quiet) {
    const hr = r * (2.7 + 0.35 * Math.sin(t * 7 + p.id));
    ctx.globalAlpha = 0.8;
    ctx.drawImage(p.secret ? halos().gold : halos().thr, x - hr, y - hr, hr * 2, hr * 2);
    ctx.globalAlpha = (1 - pulse) * 0.75;
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = p.secret ? C.gold : C.thr;
    ctx.beginPath();
    ctx.arc(x, y, r * (1.25 + pulse * 1.7), 0, TAU);
    ctx.stroke();
  }
  ctx.globalAlpha = quiet ? 0.45 : 1;
  const mode = glyphPath(ctx, p.variant, x, y, r, a);
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3.4;
  ctx.strokeStyle = C.ground;
  ctx.stroke();
  if (mode === 'stroke') {
    const ga = ctx.globalAlpha;
    ctx.lineWidth = Math.max(2.4, r * 0.44);
    ctx.strokeStyle = C.thr;
    ctx.globalAlpha = ga * (0.8 + 0.2 * Math.sin(t * 3.2 + p.id));
    ctx.stroke();
    ctx.globalAlpha = ga;
    ctx.lineWidth = 1;
    ctx.strokeStyle = C.deep;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, r * 0.2, 0, TAU);
    ctx.fillStyle = C.deep;
    ctx.fill();
  } else {
    ctx.fillStyle = C.thr;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = C.deep;
    ctx.stroke();
    if (p.variant === 'fast') {
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * r * 1.1, y + Math.sin(a) * r * 1.1, r * 0.3, 0, TAU);
    } else if (p.variant === 'hunter') polyPath(ctx, SHAPE.hunter, x + Math.cos(a) * r * 0.15, y + Math.sin(a) * r * 0.15, r * 0.42, a);
    else if (p.variant === 'splitter') {
      ctx.beginPath();
      ctx.arc(x, y, r * 0.34, 0, TAU);
    } else polyPath(ctx, SHAPE.diamond, x, y, r * 0.44, a);
    ctx.fillStyle = C.deep;
    ctx.fill();
  }
  if (p.secret) {
    const [sx, sy] = secretAt(p.variant, x, y, r, a);
    const sr = Math.max(2.6, r * 0.4);
    ctx.beginPath();
    ctx.arc(sx, sy, sr + 1.2, 0, TAU);
    ctx.fillStyle = C.goldDeep;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(sx, sy, sr, 0, TAU);
    ctx.fillStyle = C.gold;
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** Packets: tasks batched; revealed injections drawn one by one so the threat pops against the paper. */
export function drawPackets(f: Frame, scene: Scene, sess: Session, alpha: number, dim: number, quiet: boolean): void {
  const s = sess.state;
  const inj: Packet[] = [];
  drawTasks(f, sess, s, alpha, dim, inj);
  if (!inj.length) return;
  const poses = inj.map((p): Placed => {
    const pos = pktPos(sess, s, p, alpha);
    return { p, x: f.af.x(pos.x, pos.y), y: f.af.y(pos.x, pos.y), a: pktAngle(f, scene, s, p) };
  });
  drawComets(f, scene, poses, quiet);
  const rI = Math.max(6.6, 8.8 * f.kk);
  for (const q of poses) drawInjection(f, q, rI, quiet);
}
