import {
  AGENTS_PER_WAVE,
  MAX_AGENTS,
  MAX_DEGREE,
  MIN_SPACING,
  NODE_CLEARANCE,
} from './constants';
import { dist2, pointSegDist2, segmentsCross } from './geom';
import type { GameState, SimEdge, SimNode } from './types';

const CLEAR2 = NODE_CLEARANCE * NODE_CLEARANCE;
const PEER_RANGE2 = (2.8 * MIN_SPACING) ** 2;

export function otherEnd(e: SimEdge, n: number): number {
  return e.a === n ? e.b : e.a;
}

export function edgeUsable(s: GameState, e: SimEdge): boolean {
  return !e.removed && e.severedUntil <= s.tick;
}

export function rebuildAdj(s: GameState): void {
  const adj: number[][] = s.nodes.map(() => []);
  for (const e of s.edges) {
    if (e.removed) continue;
    adj[e.a]!.push(e.id);
    adj[e.b]!.push(e.id);
  }
  s.adj = adj;
  s.adjDirty = false;
}

export function adjOf(s: GameState, n: number): readonly number[] {
  if (s.adjDirty) rebuildAdj(s);
  return s.adj[n] ?? [];
}

function liveEdges(s: GameState): SimEdge[] {
  return s.edges.filter((e) => !e.removed);
}

function adjacent(s: GameState, a: number, b: number): boolean {
  for (const e of s.edges) {
    if (!e.removed && ((e.a === a && e.b === b) || (e.a === b && e.b === a))) return true;
  }
  return false;
}

/** Policy limits that upgrades place on where new edges may go. */
function policyAllows(s: GameState, a: SimNode, b: SimNode): boolean {
  if (s.up.allowlist && (a.id === s.out || b.id === s.out)) return false;
  if (s.up.leastPriv) {
    const v = a.id === s.vault ? a : b.id === s.vault ? b : null;
    if (v && v.degree >= 2) return false;
  }
  return true;
}

/**
 * Can a straight edge a–b be added? It must not cross any edge and must not
 * graze another node. `strict` also keeps clear of not-yet-active candidates,
 * so future nodes never land on an existing edge.
 */
function canLink(s: GameState, a: SimNode, b: SimNode, strict: boolean): boolean {
  if (a.degree >= MAX_DEGREE || b.degree >= MAX_DEGREE) return false;
  if (adjacent(s, a.id, b.id)) return false;
  if (!policyAllows(s, a, b)) return false;
  for (const e of liveEdges(s)) {
    const p = s.nodes[e.a]!;
    const q = s.nodes[e.b]!;
    if (segmentsCross(a.x, a.y, b.x, b.y, p.x, p.y, q.x, q.y)) return false;
  }
  for (const n of s.nodes) {
    if (n.id === a.id || n.id === b.id) continue;
    // Relaxed mode may graze inactive agents, never special nodes: those always join.
    if (!strict && !n.active && n.kind === 'agent') continue;
    if (pointSegDist2(n.x, n.y, a.x, a.y, b.x, b.y) < CLEAR2) return false;
  }
  return true;
}

export function addEdge(s: GameState, a: number, b: number, peer: boolean): SimEdge {
  const [lo, hi] = a < b ? [a, b] : [b, a];
  const A = s.nodes[lo]!;
  const B = s.nodes[hi]!;
  const e: SimEdge = {
    id: s.edges.length,
    a: lo,
    b: hi,
    len: Math.sqrt(dist2(A.x, A.y, B.x, B.y)),
    peer,
    removed: false,
    severedUntil: 0,
    gapT: -1,
  };
  s.edges.push(e);
  A.degree++;
  B.degree++;
  s.adjDirty = true;
  s.events.push({ tick: s.tick, e: 'edge', edge: e.id });
  return e;
}

export function removeEdge(s: GameState, e: SimEdge): void {
  if (e.removed) return;
  e.removed = true;
  s.nodes[e.a]!.degree--;
  s.nodes[e.b]!.degree--;
  s.adjDirty = true;
}

/** Active nodes sorted by distance from `n`, ties by id. */
function nearestActive(s: GameState, n: SimNode): SimNode[] {
  return s.nodes
    .filter((m) => m.active && m.id !== n.id)
    .map((m) => ({ m, d: dist2(n.x, n.y, m.x, m.y) }))
    .sort((p, q) => p.d - q.d || p.m.id - q.m.id)
    .map((p) => p.m);
}

/** A candidate may join only if it does not sit on an existing edge. */
function clearOfEdges(s: GameState, n: SimNode): boolean {
  for (const e of liveEdges(s)) {
    if (e.a === n.id || e.b === n.id) continue;
    const p = s.nodes[e.a]!;
    const q = s.nodes[e.b]!;
    if (pointSegDist2(n.x, n.y, p.x, p.y, q.x, q.y) < CLEAR2) return false;
  }
  return true;
}

/** Returns the links a node would make on joining (empty = cannot join). */
function plannedLinks(s: GameState, n: SimNode): SimNode[] {
  const want = 2;
  const others = nearestActive(s, n);
  if (others.length === 0) return [];
  const picked: SimNode[] = [];
  const tryPass = (strict: boolean) => {
    for (const m of others) {
      if (picked.length >= want) return;
      if (picked.includes(m)) continue;
      if (!canLink(s, n, m, strict)) continue;
      // also avoid crossing links already picked in this pass
      const crossesPicked = picked.some((p) => segmentsCross(n.x, n.y, m.x, m.y, n.x, n.y, p.x, p.y));
      if (!crossesPicked) picked.push(m);
    }
  };
  tryPass(true);
  if (picked.length === 0) tryPass(false);
  return picked;
}

/** Activates a node and links it into the mesh. Returns false if it cannot join. */
export function activateNode(s: GameState, id: number): boolean {
  const n = s.nodes[id]!;
  if (n.active) return true;
  const isFirst = !s.nodes.some((m) => m.active);
  if (!isFirst) {
    if (!clearOfEdges(s, n)) return false;
    const links = plannedLinks(s, n);
    if (links.length === 0) return false;
    n.active = true;
    n.activatedAt = s.tick;
    for (const m of links) addEdge(s, n.id, m.id, false);
  } else {
    n.active = true;
    n.activatedAt = s.tick;
  }
  s.events.push({ tick: s.tick, e: 'grow', node: id });
  return true;
}

function activeAgents(s: GameState): number {
  let c = 0;
  for (const n of s.nodes) if (n.active && n.kind === 'agent') c++;
  return c;
}

/** Activates the next agents for a new wave: nearest inactive candidates first. */
export function growWave(s: GameState): void {
  for (let k = 0; k < AGENTS_PER_WAVE; k++) {
    if (activeAgents(s) >= MAX_AGENTS) return;
    const act = s.nodes.filter((n) => n.active);
    const pool = s.nodes
      .filter((n) => !n.active && n.kind === 'agent')
      .map((n) => {
        let d = Infinity;
        for (const m of act) d = Math.min(d, dist2(n.x, n.y, m.x, m.y));
        return { n, d };
      })
      .sort((p, q) => p.d - q.d || p.n.id - q.n.id);
    let joined = false;
    for (const { n } of pool) {
      if (activateNode(s, n.id)) {
        joined = true;
        break;
      }
    }
    if (!joined) return;
  }
}

/** Adds up to `count` lateral agent↔agent links between nearby agents. */
export function addPeerEdges(s: GameState, count: number): void {
  if (count <= 0) return;
  const agents = s.nodes.filter((n) => n.active && n.kind === 'agent');
  const pairs: Array<[SimNode, SimNode]> = [];
  for (let i = 0; i < agents.length; i++) {
    for (let j = i + 1; j < agents.length; j++) {
      const a = agents[i]!;
      const b = agents[j]!;
      if (dist2(a.x, a.y, b.x, b.y) <= PEER_RANGE2) pairs.push([a, b]);
    }
  }
  for (let i = pairs.length - 1; i > 0; i--) {
    const j = s.rng.int(i + 1);
    const t = pairs[i]!;
    pairs[i] = pairs[j]!;
    pairs[j] = t;
  }
  let added = 0;
  for (const [a, b] of pairs) {
    if (added >= count) break;
    if (!canLink(s, a, b, false)) continue;
    addEdge(s, a.id, b.id, true);
    added++;
  }
}

/** Re-links an active node that lost all its edges. Returns false if it cannot. */
export function relink(s: GameState, id: number): boolean {
  const n = s.nodes[id]!;
  const links = plannedLinks(s, n).slice(0, 1);
  for (const m of links) addEdge(s, n.id, m.id, false);
  return links.length > 0;
}
