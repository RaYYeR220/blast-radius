import type { GameState, SimNode } from '@blast/sim';
import type { Batch } from './batch';
import type { Frame } from './frame';
import { clamp, easeOut, frac, TAU } from './math';
import type { NodeDot } from './pools';
import type { Scene } from './scene';
import { halos } from './sprites';
import { C } from './palette';

/** Screen radius of a node's cluster: busier agents are bigger. */
export function nodeR(n: SimNode, kk: number): number {
  return (n.kind === 'agent' ? 7.5 + n.degree * 2.1 : 14.5) * kk;
}

/** Glow under infected agents, and under the exit while the key is out. */
export function drawNodeHalos(f: Frame, s: GameState): void {
  const { ctx, af, kk, t } = f;
  const H = halos();
  for (const n of s.nodes) {
    if (!n.active || n.kind !== 'agent' || n.quarantinedUntil > s.tick || n.infection !== 2) continue;
    const x = af.x(n.x, n.y);
    const y = af.y(n.x, n.y);
    const r = nodeR(n, kk) * (3.6 + 0.4 * Math.sin(t * 6 + n.id));
    ctx.globalAlpha = 0.85;
    ctx.drawImage(H.thr, x - r, y - r, r * 2, r * 2);
    ctx.globalAlpha = 1;
  }
  const v = s.nodes[s.out];
  if (f.keyOut && v) {
    const x = af.x(v.x, v.y);
    const y = af.y(v.x, v.y);
    const r = 70 * kk * (1 + 0.15 * Math.sin(t * 9));
    ctx.globalAlpha = 0.7;
    ctx.drawImage(H.thr, x - r, y - r, r * 2, r * 2);
    ctx.globalAlpha = 1;
  }
}

interface Spot {
  x: number;
  y: number;
  sc: number;
  /** 1 once the node has fully condensed. */
  spread: number;
  szMul: number;
}

function drawAgent(f: Frame, b: Batch, s: GameState, n: SimNode, arr: readonly NodeDot[], o: Spot): void {
  const { kk, thr, t } = f;
  const tick = s.tick;
  const q = n.quarantinedUntil > tick;
  const inc = n.infection === 1 && !q;
  const inf = n.infection === 2 && !q;
  const sleeper = inc && n.incubVariant === 'sleeper';
  const prog = inc ? clamp(1 - (n.incubateUntil - tick) / (sleeper ? 360 : 60), 0, 1) : 0;
  const cnt = Math.min(arr.length, 56 + 21 * n.degree);
  const spin = inf ? 1.1 : 0.12 * (1 + 2.2 * thr);
  for (let i = 0; i < cnt; i++) {
    const p = arr[i]!;
    let px: number;
    let py: number;
    let path: Path2D;
    if (q) {
      if (i % 3 === 0) continue;
      const a = p.u * TAU + t * 0.05;
      const rr = o.sc * 1.32 + p.g1 * 0.7 * kk;
      px = o.x + Math.cos(a) * rr;
      py = o.y + Math.sin(a) * rr;
      path = b.grey;
    } else {
      const a = p.a0 + t * spin * (1 + p.w);
      let rr = p.r0 * o.sc * 0.56 * o.spread;
      if (inf) rr *= 1 + 0.12 * Math.sin(t * 14 + i * 1.7);
      px = o.x + Math.cos(a) * rr;
      py = o.y + Math.sin(a) * rr;
      if (inf) path = p.r0 < 0.8 ? b.deep : b.thr[p.b > 1 ? 2 : 1];
      else if (inc && !sleeper && p.u < prog * 1.05) path = p.r0 < 0.7 ? b.deep : b.thr[2];
      else if (sleeper && p.u < prog * 0.16) path = b.thr[0];
      else path = b.ink[p.b];
    }
    const z = p.sz * o.szMul * (inf ? 1.3 : 1);
    path.rect(px - z / 2, py - z / 2, z, z);
  }
  if (inc) drawIncubation(b, o, prog, sleeper, kk);
}

/** The incubation timer: a ring of dots that lights up as the infection takes hold. */
function drawIncubation(b: Batch, o: Spot, prog: number, sleeper: boolean, kk: number): void {
  const tot = sleeper ? 30 : 40;
  const R0 = o.sc * 1.8 + 6 * kk;
  const lit = sleeper ? 0 : Math.round(tot * prog);
  for (let i = 0; i < tot; i++) {
    if (sleeper && i % 2) continue;
    const a = -Math.PI / 2 + (i / tot) * TAU;
    const on = i < lit;
    const z = on ? 2.8 : sleeper ? 1.3 : 1.6;
    (on ? b.thr[2] : b.thr[0]).rect(o.x + Math.cos(a) * R0 - z / 2, o.y + Math.sin(a) * R0 - z / 2, z, z);
  }
}

function drawUser(f: Frame, b: Batch, arr: readonly NodeDot[], o: Spot): void {
  const { thr, t } = f;
  arr.forEach((p, i) => {
    const core = i % 4 === 0;
    const a = p.u * TAU + t * (core ? -0.2 : 0.08) * (1 + thr);
    const rr = (core ? 0.22 + Math.abs(p.g2) * 0.12 : 1 + p.g1 * 0.07) * o.sc * 1.25 * o.spread;
    const z = p.sz * o.szMul;
    b.ink[core ? 3 : p.b].rect(o.x + Math.cos(a) * rr - z / 2, o.y + Math.sin(a) * rr - z / 2, z, z);
  });
}

function drawWeb(f: Frame, b: Batch, arr: readonly NodeDot[], o: Spot): void {
  const { thr, t } = f;
  const jit = 0.6 + 2.2 * thr;
  arr.forEach((p, i) => {
    const px = o.x + (p.u - 0.5) * o.sc * 2.5 * o.spread + Math.sin(t * 3 + i) * jit;
    const py = o.y + (p.v - 0.5) * o.sc * 2.5 * o.spread + Math.cos(t * 2.7 + i * 1.3) * jit;
    const z = p.sz * o.szMul;
    (i % 13 === 0 ? b.thr[1] : b.ink[p.b]).rect(px - z / 2, py - z / 2, z, z);
  });
}

function drawVault(f: Frame, b: Batch, arr: readonly NodeDot[], o: Spot): void {
  for (let i = 0; i < 81; i++) {
    const gx = i % 9;
    const gy = (i / 9) | 0;
    const p = arr[i]!;
    const px = o.x + (gx - 4) * o.sc * 0.25 * o.spread;
    const py = o.y + (gy - 4) * o.sc * 0.25 * o.spread;
    const z = 1.3 * o.szMul;
    const gold = f.keyOut && (i * 7 + ((f.t * 8) | 0)) % 9 === 0;
    (gold ? b.gold : b.ink[p.b > 0 ? 2 : 1]).rect(px - z / 2, py - z / 2, z, z);
  }
}

function drawOut(f: Frame, b: Batch, arr: readonly NodeDot[], o: Spot): void {
  const { thr, t } = f;
  arr.forEach((p, i) => {
    const ph = frac(p.u + t * (0.18 + 0.4 * thr));
    const sp = (p.v - 0.5) * 0.9 * ph;
    const px = o.x + sp * 2.2 * o.sc + p.g1 * 1.1;
    const py = o.y - ph * 3.1 * o.sc + p.g2 * 1.1;
    const z = p.sz * o.szMul * (1 - ph * 0.4);
    (f.keyOut && i % 2 ? b.thr[2] : b.ink[p.b]).rect(px - z / 2, py - z / 2, z, z);
  });
}

/** Every node is a particle cluster: agents swirl, the user orbits, the web jitters, the vault is a grid, the exit vents. */
export function drawNodes(f: Frame, b: Batch, scene: Scene, s: GameState): void {
  const { af, kk, thr, now } = f;
  const szMul = (0.95 + 0.1 * kk) * (1 + 0.25 * thr);
  for (const n of s.nodes) {
    if (!n.active) {
      if (n.kind === 'agent' && !f.calm) b.ink[0].rect(af.x(n.x, n.y) - 0.7, af.y(n.x, n.y) - 0.7, 1.4, 1.4);
      continue;
    }
    let gr = 1;
    const nb = scene.nodeBorn.get(n.id);
    if (nb !== undefined) {
      if (now < nb) continue;
      gr = clamp((now - nb) / 900, 0, 1);
      if (gr >= 1) scene.nodeBorn.delete(n.id);
    }
    const o: Spot = { x: af.x(n.x, n.y), y: af.y(n.x, n.y), sc: nodeR(n, kk), spread: 1 + (1 - easeOut(gr)) * 6, szMul };
    const arr = scene.pools.node(n);
    if (n.kind === 'agent') drawAgent(f, b, s, n, arr, o);
    else if (n.kind === 'user') drawUser(f, b, arr, o);
    else if (n.kind === 'web') drawWeb(f, b, arr, o);
    else if (n.kind === 'vault') drawVault(f, b, arr, o);
    else drawOut(f, b, arr, o);
  }
}

/** Strokes on top of the dots: the vault frame, quarantine seals and the infected agents' charge arcs. */
export function drawNodeMarks(f: Frame, scene: Scene, s: GameState): void {
  const { ctx, af, kk } = f;
  const tick = s.tick;
  for (const n of s.nodes) {
    if (!n.active || scene.nodeBorn.has(n.id)) continue;
    const x = af.x(n.x, n.y);
    const y = af.y(n.x, n.y);
    const sc = nodeR(n, kk);
    if (n.kind === 'vault') {
      ctx.strokeStyle = f.keyOut ? C.thr : 'rgba(14,13,12,.5)';
      ctx.lineWidth = f.keyOut ? 1.6 : 1;
      const h = sc * 1.28;
      ctx.strokeRect(x - h, y - h, h * 2, h * 2);
    }
    if (n.kind !== 'agent') continue;
    if (n.quarantinedUntil > tick) {
      const dur = s.up.sandbox ? 180 : 300;
      const rem = clamp((n.quarantinedUntil - tick) / dur, 0, 1);
      const R0 = sc * 1.32 + 6 * kk;
      ctx.setLineDash([1.5, 4]);
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = C.ink2;
      ctx.beginPath();
      ctx.arc(x, y, R0, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = C.ink;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(x, y, R0, -Math.PI / 2, -Math.PI / 2 + rem * TAU);
      ctx.stroke();
      ctx.lineCap = 'butt';
      continue;
    }
    if (n.infection === 2) {
      // charge arc: time until the next emission
      const fr = clamp(1 - (n.nextEmitAt - tick) / 180, 0, 1);
      const R0 = sc * 2 + 5 * kk;
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = C.thr;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(x, y, R0, -Math.PI / 2, -Math.PI / 2 + fr * TAU);
      ctx.stroke();
      ctx.lineCap = 'butt';
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(226,98,27,.35)';
      ctx.beginPath();
      ctx.arc(x, y, R0, 0, TAU);
      ctx.stroke();
    }
  }
}
