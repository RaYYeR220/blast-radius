import type { SimEdge, SimNode } from '@blast/sim';
import { clamp, gauss, rng, TAU } from './math';

/** Ink density step: 0 faint … 3 dense. */
export type Tone = 0 | 1 | 2 | 3;

const tone4 = (q: number): Tone => (q < 0.2 ? 0 : q < 0.55 ? 1 : q < 0.85 ? 2 : 3);

/** One dot of a link's stream: a phase along the link, a lane, and a jitter. */
export interface StreamDot {
  ph: number;
  lane: 1 | -1;
  off: number;
  sz: number;
  b: Tone;
  sp: number;
  keep: number;
  k2: number;
}

/** Debris that settles at the two ends of a cut. */
export interface PileDot {
  side: 1 | -1;
  d: number;
  off: number;
  sz: number;
  b: 1 | 2 | 3;
  drift: number;
}

export interface EdgePool {
  arr: StreamDot[];
  pile: PileDot[];
}

/** One dot of a node's cluster, in a gaussian cloud. */
export interface NodeDot {
  g1: number;
  g2: number;
  a0: number;
  r0: number;
  u: number;
  v: number;
  sz: number;
  b: Tone;
  w: number;
}

function makeEdgePool(e: SimEdge): EdgePool {
  const R = rng(e.id * 7919 + 101);
  const n = clamp(Math.round(e.len / 1.6), 34, 400);
  const arr: StreamDot[] = [];
  for (let i = 0; i < n; i++) {
    const q = R();
    arr.push({ ph: R(), lane: R() < 0.5 ? 1 : -1, off: gauss(R) * 0.9, sz: 1.05 + R() * 1.15, b: tone4(q), sp: 0.75 + R() * 0.5, keep: R(), k2: R() });
  }
  const pile: PileDot[] = [];
  for (let i = 0; i < 44; i++) {
    pile.push({ side: i % 2 ? 1 : -1, d: Math.abs(gauss(R)) * 8, off: gauss(R) * 3.2, sz: 0.9 + R() * 1.2, b: (1 + ((R() * 3) | 0)) as 1 | 2 | 3, drift: R() });
  }
  return { arr, pile };
}

function makeNodePool(n: SimNode): NodeDot[] {
  const R = rng(n.id * 104729 + 7);
  const m = n.kind === 'agent' ? 160 : n.kind === 'vault' ? 120 : 210;
  const arr: NodeDot[] = [];
  for (let i = 0; i < m; i++) {
    const g1 = gauss(R);
    const g2 = gauss(R);
    const q = R();
    arr.push({
      g1, g2, a0: Math.atan2(g2, g1), r0: Math.hypot(g1, g2), u: R(), v: R(), sz: 0.85 + R() * 1.25,
      b: q < 0.18 ? 0 : q < 0.5 ? 1 : q < 0.82 ? 2 : 3, w: (R() - 0.5) * 0.7,
    });
  }
  return arr;
}

/** Particle layouts, seeded once per link and node id; positions are recomputed every frame. */
export class Pools {
  private readonly edges = new Map<number, EdgePool>();
  private readonly nodes = new Map<number, NodeDot[]>();

  edge(e: SimEdge): EdgePool {
    let p = this.edges.get(e.id);
    if (!p) this.edges.set(e.id, (p = makeEdgePool(e)));
    return p;
  }

  node(n: SimNode): NodeDot[] {
    let p = this.nodes.get(n.id);
    if (!p) this.nodes.set(n.id, (p = makeNodePool(n)));
    return p;
  }

  clear(): void {
    this.edges.clear();
    this.nodes.clear();
  }
}

/** The ambient dot field that drifts behind everything. */
export interface Dust {
  x: number;
  y: number;
  px: number;
  py: number;
  ax: number;
  ay: number;
  ph: number;
  b: 0 | 1 | 2;
  sz: number;
  o: number;
}

export function seedDust(W: number, H: number): Dust[] {
  const R = rng(1415);
  const n = Math.round(clamp((W * H) / 1500, 260, 1000));
  const out: Dust[] = [];
  for (let i = 0; i < n; i++) {
    const q = R();
    out.push({
      x: R(), y: R(), px: 22 + R() * 12, py: 26 + R() * 8, ax: 6 + R() * 18, ay: 4 + R() * 14, ph: R() * TAU,
      b: q < 0.55 ? 0 : q < 0.88 ? 1 : 2, sz: 0.9 + R() * 1.1, o: R(),
    });
  }
  return out;
}
