import { adjOf, edgeUsable, otherEnd } from './graph';
import type { GameState } from './types';

function passable(s: GameState, n: number): boolean {
  const node = s.nodes[n]!;
  return node.active && node.quarantinedUntil <= s.tick;
}

/**
 * First edge on a shortest usable path from `from` to `goal` (by hop count),
 * or −1 when there is none. Adjacency is sorted by edge id, so equal-length
 * paths always resolve to the lowest first edge.
 */
export function nextHop(s: GameState, from: number, goal: number): number {
  if (from === goal || !passable(s, goal)) return -1;
  const n = s.nodes.length;
  const firstEdge = new Int32Array(n).fill(-2);
  firstEdge[from] = -1;
  const queue = [from];
  for (let head = 0; head < queue.length; head++) {
    const u = queue[head]!;
    for (const eid of adjOf(s, u)) {
      const e = s.edges[eid]!;
      if (!edgeUsable(s, e)) continue;
      const v = otherEnd(e, u);
      if (firstEdge[v] !== -2) continue;
      if (!passable(s, v)) continue;
      const fe = u === from ? eid : firstEdge[u]!;
      if (v === goal) return fe;
      firstEdge[v] = fe;
      queue.push(v);
    }
  }
  return -1;
}
