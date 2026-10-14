import type { GameState, SimEdge } from '@blast/sim';
import { ribbon } from './blade';
import type { Frame } from './frame';
import { clamp, easeInOut, frac, lerp, TAU } from './math';
import { C, DISPLAY } from './palette';
import type { Scene } from './scene';

/** The first link on the shortest open route from one node to another, or −1. */
export function firstHop(s: GameState, from: number, to: number): number {
  const usable = (id: number) => {
    const nd = s.nodes[id];
    return !!nd && nd.active && nd.quarantinedUntil <= s.tick;
  };
  if (from === to || !usable(to)) return -1;
  const adj: number[][] = s.nodes.map(() => []);
  for (const e of s.edges) {
    if (e.removed) continue;
    adj[e.a]!.push(e.id);
    adj[e.b]!.push(e.id);
  }
  const first = new Int32Array(s.nodes.length).fill(-2);
  first[from] = -1;
  const q = [from];
  for (let i = 0; i < q.length; i++) {
    const v = q[i]!;
    for (const eid of adj[v]!) {
      const e = s.edges[eid]!;
      if (e.severedUntil > s.tick) continue;
      const w = e.a === v ? e.b : e.a;
      if (first[w] !== -2 || !usable(w)) continue;
      const f = v === from ? eid : first[v]!;
      if (w === to) return f;
      first[w] = f;
      q.push(w);
    }
  }
  return -1;
}

interface Spot {
  x: number;
  y: number;
  e: SimEdge;
}

/** Where the ghost blade should cut: just ahead of the wave-one injection on its way to the vault. */
export function tutorialSpot(scene: Scene, s: GameState): Spot | null {
  if (s.wave !== 1 || s.phase !== 'play') return null;
  let eid = -1;
  let from = s.web;
  let uFrom = 0.42;
  if (scene.tutPacket < 0) {
    if (s.tick > 380) return null;
    eid = firstHop(s, s.web, s.vault);
  } else {
    const p = s.packets.find((q) => q.id === scene.tutPacket && !q.dead);
    if (!p) return null;
    if (p.edge >= 0) {
      eid = p.edge;
      from = p.from;
      uFrom = Math.min(0.86, p.progress + 0.22);
    } else if (p.node === s.web) eid = firstHop(s, s.web, s.vault);
    else return null;
  }
  const e = s.edges[eid];
  if (!e) return null;
  const uA = from === e.a ? uFrom : 1 - uFrom;
  const A = s.nodes[e.a]!;
  const B = s.nodes[e.b]!;
  return { x: lerp(A.x, B.x, uA), y: lerp(A.y, B.y, uA), e };
}

/** A ghost hand swiping across the link the tutorial injection will take, with the word "cut". */
export function drawTutorial(f: Frame, scene: Scene, s: GameState): void {
  const spot = tutorialSpot(scene, s);
  if (!spot) return;
  const { ctx, af, kk, now } = f;
  const cx = af.x(spot.x, spot.y);
  const cy = af.y(spot.x, spot.y);
  const A = s.nodes[spot.e.a]!;
  const B = s.nodes[spot.e.b]!;
  const dx = af.x(B.x, B.y) - af.x(A.x, A.y);
  const dy = af.y(B.x, B.y) - af.y(A.x, A.y);
  const L = Math.hypot(dx, dy) || 1;
  const ux = dx / L;
  const uy = dy / L;
  const nx = -uy;
  const ny = ux;
  const half = 58;
  const T = frac(now / 1700);
  const h = easeInOut(clamp(T / 0.55, 0, 1));
  const fade = T < 0.55 ? 1 : 1 - (T - 0.55) / 0.45;
  // the ghost swipe leans slightly along the link, like a real hand
  const p0 = { x: cx - nx * half - ux * 14, y: cy - ny * half - uy * 14 };
  const p1 = { x: cx + nx * half + ux * 14, y: cy + ny * half + uy * 14 };
  const pts: Array<{ x: number; y: number }> = [];
  for (let i = 0; i <= 14; i++) {
    const k = (i / 14) * h;
    pts.push({ x: lerp(p0.x, p1.x, k), y: lerp(p0.y, p1.y, k) });
  }
  ctx.setLineDash([2, 5]);
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = C.thr;
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  ctx.arc(cx, cy, 24 * kk + 6, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);
  if (h > 0.05) {
    ctx.globalAlpha = 0.62 * fade;
    ribbon(ctx, pts, 0.4, 9);
    ctx.fillStyle = C.ink;
    ctx.fill();
  }
  const hd = pts[pts.length - 1]!;
  ctx.globalAlpha = 0.9 * fade;
  ctx.fillStyle = 'rgba(255,255,255,.75)';
  ctx.beginPath();
  ctx.arc(hd.x, hd.y, 13, 0, TAU);
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = C.ink;
  ctx.stroke();
  ctx.globalAlpha = 1;
  const side = ny < 0 ? 1 : -1;
  const lx = cx + ux * 46 * side;
  const ly = cy + uy * 46 * side;
  ctx.font = `600 26px ${DISPLAY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 6;
  ctx.strokeStyle = C.ground;
  ctx.strokeText('cut', lx, ly);
  ctx.fillStyle = C.ink;
  ctx.fillText('cut', lx, ly);
  ctx.beginPath();
  ctx.arc(lx + ctx.measureText('cut').width / 2 + 9, ly + 5, 3.5, 0, TAU);
  ctx.fillStyle = C.thr;
  ctx.fill();
  ctx.textAlign = 'left';
}
