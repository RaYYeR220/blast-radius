import { type GameState, posFromA, type SimEdge } from '@blast/sim';
import type { Batch } from './batch';
import type { Frame } from './frame';
import { clamp, easeOut, frac } from './math';
import type { EdgePool } from './pools';
import type { Scene } from './scene';

/** Where each revealed injection sits along its link (0..1 from node a), so the stream can stain around it. */
function hotSpots(s: GameState): Map<number, number[]> {
  const hot = new Map<number, number[]>();
  for (const p of s.packets) {
    if (p.dead || p.kind !== 'inject' || !p.revealed || p.edge < 0) continue;
    const arr = hot.get(p.edge) ?? [];
    arr.push(posFromA(s, p));
    hot.set(p.edge, arr);
  }
  return hot;
}

/** How much of a growing link is drawn: [from, to] along a→b, or null before it starts. */
function growth(scene: Scene, e: SimEdge, now: number): [number, number] | null {
  const eb = scene.edgeBorn.get(e.id);
  if (!eb) return [0, 1];
  if (now < eb.t0) return null;
  const g = easeOut(clamp((now - eb.t0) / 720, 0, 1));
  if (g >= 1) {
    scene.edgeBorn.delete(e.id);
    return [0, 1];
  }
  return eb.fromB ? [1 - g, 1] : [0, g];
}

/** Links drawn as two lanes of drifting particles; cuts open a gap with debris at both ends. */
export function drawStreams(f: Frame, b: Batch, scene: Scene, s: GameState): void {
  const { af, kk, thr, now } = f;
  const tick = s.tick;
  const laneSep = (1.5 + 2.6 * thr) * kk;
  const spread = (0.8 + 1.2 * thr) * kk;
  const szMul = (0.92 + 0.1 * kk) * (1 + 0.6 * thr);
  const dens = (f.calm ? 0.7 : 0.66) + 0.34 * thr;
  const hot = hotSpots(s);
  for (const e of s.edges) {
    if (e.removed) continue;
    const A = s.nodes[e.a]!;
    const Bn = s.nodes[e.b]!;
    if (!A.active || !Bn.active) continue;
    const span = growth(scene, e, now);
    if (!span) continue;
    const [g0, g1] = span;
    const P = scene.pools.edge(e);
    const ax = af.x(A.x, A.y);
    const ay = af.y(A.x, A.y);
    const dx = af.x(Bn.x, Bn.y) - ax;
    const dy = af.y(Bn.x, Bn.y) - ay;
    const L = Math.hypot(dx, dy) || 1;
    const nx = -dy / L;
    const ny = dx / L;
    const sev = e.severedUntil > tick;
    const gap = sev && e.gapT >= 0;
    const trip = sev && e.gapT < 0;
    const gw = gap ? ((20 + 5 / Math.max(af.s, 0.2)) / e.len) * clamp((e.severedUntil - tick) / 22, 0, 1) : 0;
    const hu = hot.get(e.id);
    const hw = 50 / e.len;
    const infA = A.kind === 'agent' && A.infection > 0 && A.quarantinedUntil <= tick;
    const infB = Bn.kind === 'agent' && Bn.infection > 0 && Bn.quarantinedUntil <= tick;
    const reachA = infA ? (A.infection === 2 ? 95 : 40) / e.len : 0;
    const reachB = infB ? (Bn.infection === 2 ? 95 : 40) / e.len : 0;
    const speed = f.flow * (520 / e.len);
    const peer = e.peer;
    for (const p of P.arr) {
      if (p.keep > dens) continue;
      const u = trip ? p.ph : frac(p.ph + p.lane * speed * p.sp);
      if (u < g0 || u > g1) continue;
      if (gap && Math.abs(u - e.gapT) < gw) continue;
      if (peer && ((u * e.len) / 11 | 0) % 2 === 1) continue;
      const o = peer ? p.off * spread * 0.7 : p.lane * laneSep + p.off * spread;
      const x = ax + dx * u + nx * o;
      const y = ay + dy * u + ny * o;
      const z = p.sz * szMul;
      let path = peer ? b.grey : b.ink[p.b];
      if (trip) path = b.grey;
      else {
        if (hu) {
          for (const h of hu) {
            const d = Math.abs(u - h);
            if (d < hw * (0.4 + p.k2)) {
              path = d < hw * 0.35 ? b.thr[2] : b.thr[1];
              break;
            }
          }
        }
        if (reachA && u < reachA * p.k2) path = b.thr[p.b > 1 ? 2 : 1];
        else if (reachB && 1 - u < reachB * p.k2) path = b.thr[p.b > 1 ? 2 : 1];
      }
      path.rect(x - z / 2, y - z / 2, z, z);
    }
    if (gap) drawPile(b, P, e, s, { ax, ay, dx, dy, nx, ny, gw, kk });
  }
}

interface Seg {
  ax: number;
  ay: number;
  dx: number;
  dy: number;
  nx: number;
  ny: number;
  gw: number;
  kk: number;
}

/** Debris piles at both cut ends, settling outward while the link is down. */
function drawPile(b: Batch, P: EdgePool, e: SimEdge, s: GameState, g: Seg): void {
  const age = clamp(1 - (e.severedUntil - s.tick) / (s.up.fastHeal ? 108 : 180), 0, 1);
  for (const p of P.pile) {
    const u = e.gapT + p.side * (g.gw + (p.d * (1 + age * 0.8)) / e.len);
    const o = p.off * g.kk * (1 + age * 0.6 * p.drift);
    if (u < 0 || u > 1) continue;
    const z = p.sz * g.kk;
    b.ink[p.b].rect(g.ax + g.dx * u + g.nx * o - z / 2, g.ay + g.dy * u + g.ny * o - z / 2, z, z);
  }
}
