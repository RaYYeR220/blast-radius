import type { GameState, Variant } from '@blast/sim';
import type { Fx } from './fx';
import { Pools } from './pools';

export interface EdgeBirth {
  t0: number;
  /** Draw out from node b instead of node a. */
  fromB: boolean;
}

/** The renderer's memory of one session: particle layouts, growth timing, comet trails, effects. */
export class Scene {
  readonly pools = new Pools();
  /** node id → when it starts condensing (performance.now ms). */
  readonly nodeBorn = new Map<number, number>();
  readonly edgeBorn = new Map<number, EdgeBirth>();
  /** inject packet id → recent board positions [x0, y0, x1, y1, …]. */
  readonly hist = new Map<number, number[]>();
  readonly lastAng = new Map<number, number>();
  readonly fx: Fx[] = [];
  readonly seenVariants = new Set<Variant>();
  /** The wave-one injection the tutorial ghost follows. */
  tutPacket = -1;
  keyTagAt = 0;
  lastIntercept: { x: number; y: number } | null = null;

  reset(): void {
    this.pools.clear();
    this.clearBirths();
    this.hist.clear();
    this.lastAng.clear();
    this.fx.length = 0;
    this.seenVariants.clear();
    this.tutPacket = -1;
    this.keyTagAt = 0;
    this.lastIntercept = null;
  }

  clearBirths(): void {
    this.nodeBorn.clear();
    this.edgeBorn.clear();
  }

  /** Every run opens with the mesh assembling outward from the user node. */
  introGrow(s: GameState, now: number): void {
    const u = s.nodes[s.user];
    if (!u) return;
    for (const n of s.nodes) if (n.active) this.nodeBorn.set(n.id, now + 120 + Math.hypot(n.x - u.x, n.y - u.y) * 0.55);
    for (const e of s.edges) {
      if (e.removed) continue;
      const ta = this.nodeBorn.get(e.a) ?? now;
      const tb = this.nodeBorn.get(e.b) ?? now;
      this.edgeBorn.set(e.id, { t0: Math.min(ta, tb) + 160, fromB: tb < ta });
    }
  }

  addFx(f: Fx, delay = 0): void {
    f.t0 = performance.now() + delay;
    this.fx.push(f);
  }
}
