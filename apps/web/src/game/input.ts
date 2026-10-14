import { type Action, type GameState, quarantineCost } from '@blast/sim';

export interface Point {
  x: number;
  y: number;
}

/** A stroke never cuts this close (board units) to a node, so strokes may start on one. */
export const NODE_GUARD = 26;
/** Taps land on the nearest agent within this radius (board units). */
export const TAP_RADIUS = 56;
/** Movement (CSS px) that turns a press into a swipe. */
export const SWIPE_THRESHOLD = 10;

const cross = (ax: number, ay: number, bx: number, by: number) => ax * by - ay * bx;

/**
 * Cuts produced by one stroke segment a→b (board units): every usable edge it
 * properly crosses, once per stroke, never near a node, never along an edge.
 */
export function swipeToCuts(s: GameState, a: Point, b: Point, cut: Set<number>): Action[] {
  const out: Action[] = [];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  for (const e of s.edges) {
    if (e.removed || e.severedUntil > s.tick || cut.has(e.id)) continue;
    const A = s.nodes[e.a]!;
    const B = s.nodes[e.b]!;
    if (!A.active || !B.active) continue;
    const ex = B.x - A.x;
    const ey = B.y - A.y;
    const denom = cross(dx, dy, ex, ey);
    if (Math.abs(denom) < 1e-9) continue;
    const ax = A.x - a.x;
    const ay = A.y - a.y;
    const sp = cross(ax, ay, ex, ey) / denom;
    const u = cross(ax, ay, dx, dy) / denom;
    if (sp < 0 || sp > 1 || u < 0 || u > 1) continue;
    if (u * e.len < NODE_GUARD || (1 - u) * e.len < NODE_GUARD) continue;
    cut.add(e.id);
    out.push({ type: 'cut', edge: e.id, t: Math.round(u * 1000) });
  }
  return out.sort((x, y) => (x as { edge: number }).edge - (y as { edge: number }).edge);
}

export type TapResult =
  | { action: Action }
  | { denied: 'credits' | 'quarantined'; node: number }
  | null;

/** A tap quarantines the nearest agent under the finger, if the rules allow it. */
export function tapToAction(s: GameState, p: Point): TapResult {
  let best = -1;
  let bestD = TAP_RADIUS * TAP_RADIUS;
  for (const n of s.nodes) {
    if (!n.active || n.kind !== 'agent') continue;
    const d = (n.x - p.x) ** 2 + (n.y - p.y) ** 2;
    if (d <= bestD) {
      best = n.id;
      bestD = d;
    }
  }
  if (best < 0) return null;
  if (s.nodes[best]!.quarantinedUntil > s.tick) return { denied: 'quarantined', node: best };
  if (s.credits < quarantineCost(s)) return { denied: 'credits', node: best };
  return { action: { type: 'quarantine', node: best } };
}

export interface ScreenToBoard {
  toBoard(x: number, y: number): Point;
}

const TRAIL_POINTS = 16;

/** Tracks one pointer stroke: tap or swipe, cuts as it goes, and a trail to draw. */
export class Blade {
  private start: Point | null = null;
  private last: Point | null = null;
  private swiping = false;
  private readonly cut = new Set<number>();
  private readonly points: Point[] = [];

  constructor(private readonly view: ScreenToBoard) {}

  get active(): boolean {
    return this.start !== null;
  }

  begin(sx: number, sy: number): void {
    this.start = { x: sx, y: sy };
    this.last = { x: sx, y: sy };
    this.swiping = false;
    this.cut.clear();
    this.points.length = 0;
    this.points.push({ x: sx, y: sy });
  }

  /** Returns the cuts this movement makes (none while it is still a possible tap). */
  move(sx: number, sy: number, s?: GameState): Action[] {
    if (!this.start || !this.last) return [];
    this.points.push({ x: sx, y: sy });
    if (this.points.length > TRAIL_POINTS) this.points.shift();
    if (!this.swiping) {
      if (Math.hypot(sx - this.start.x, sy - this.start.y) < SWIPE_THRESHOLD) return [];
      this.swiping = true;
      this.last = this.start;
    }
    const from = this.view.toBoard(this.last.x, this.last.y);
    const to = this.view.toBoard(sx, sy);
    this.last = { x: sx, y: sy };
    return s ? swipeToCuts(s, from, to, this.cut) : [];
  }

  end(): { tap: Point } | { swipe: true } | null {
    if (!this.start) return null;
    const result = this.swiping ? { swipe: true as const } : { tap: this.view.toBoard(this.start.x, this.start.y) };
    this.start = null;
    this.last = null;
    return result;
  }

  trail(): readonly Point[] {
    return this.points;
  }
}
