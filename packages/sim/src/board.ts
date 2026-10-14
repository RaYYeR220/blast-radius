import { BOARD_H, BOARD_W, MARGIN, MAX_CANDIDATES, MIN_SPACING, SPECIAL_MIN_DIST } from './constants';
import { dist2 } from './geom';
import type { Rng } from './rng';
import type { NodeKind, SimNode } from './types';

interface Point {
  x: number;
  y: number;
}

const AGENT_TRIES = 200;
const SPECIAL_TRIES = 200;

function makeNode(id: number, kind: NodeKind, p: Point): SimNode {
  return {
    id,
    kind,
    x: p.x,
    y: p.y,
    active: false,
    activatedAt: -1,
    quarantinedUntil: 0,
    infection: 0,
    incubateUntil: 0,
    incubVariant: null,
    infectedAt: 0,
    nextEmitAt: 0,
    degree: 0,
  };
}

function inRange(rng: Rng, lo: number, hi: number): number {
  return Math.floor(lo + rng.next() * (hi - lo));
}

function farEnough(p: Point, placed: readonly Point[], min: number): boolean {
  const m2 = min * min;
  for (const q of placed) if (dist2(p.x, p.y, q.x, q.y) < m2) return false;
  return true;
}

/**
 * Special nodes: user centre-left, web on the right, vault and out on opposite
 * halves of the board, with web/vault/out mutually far apart. Falls back to
 * fixed anchors if sampling fails, so every seed produces a valid board.
 */
function placeSpecials(rng: Rng): Point[] {
  const vaultTop = rng.chance(0.5);
  const half = BOARD_H / 2;
  const boxes: Array<[number, number, number, number]> = [
    [0.22 * BOARD_W, 0.38 * BOARD_W, 0.35 * BOARD_H, 0.65 * BOARD_H],
    [0.7 * BOARD_W, 0.92 * BOARD_W, MARGIN, BOARD_H - MARGIN],
    vaultTop ? [MARGIN, 0.6 * BOARD_W, MARGIN, half] : [MARGIN, 0.6 * BOARD_W, half, BOARD_H - MARGIN],
    vaultTop ? [MARGIN, 0.6 * BOARD_W, half, BOARD_H - MARGIN] : [MARGIN, 0.6 * BOARD_W, MARGIN, half],
  ];
  const placed: Point[] = [];
  for (let i = 0; i < boxes.length; i++) {
    const [x0, x1, y0, y1] = boxes[i]!;
    let ok = false;
    for (let t = 0; t < SPECIAL_TRIES && !ok; t++) {
      const p = { x: inRange(rng, x0, x1), y: inRange(rng, y0, y1) };
      if (!farEnough(p, placed, MIN_SPACING)) continue;
      if (i >= 2 && !farEnough(p, placed.slice(1), SPECIAL_MIN_DIST)) continue;
      placed.push(p);
      ok = true;
    }
    if (!ok) {
      const y = (top: boolean) => (top ? 0.15 : 0.88) * BOARD_H;
      return [
        { x: 0.3 * BOARD_W, y: 0.5 * BOARD_H },
        { x: 0.85 * BOARD_W, y: 0.5 * BOARD_H },
        { x: 0.12 * BOARD_W, y: y(vaultTop) },
        { x: 0.5 * BOARD_W, y: y(!vaultTop) },
      ];
    }
  }
  return placed;
}

/**
 * Generates every candidate node for the run. Ids: 0 user, 1 web, 2 vault,
 * 3 out, then agents ordered by distance to the user, so the swarm grows outward.
 */
export function generateBoard(rng: Rng): SimNode[] {
  const specials = placeSpecials(rng);
  const placed: Point[] = [...specials];
  const agents: Point[] = [];
  while (placed.length < MAX_CANDIDATES) {
    let found: Point | null = null;
    for (let t = 0; t < AGENT_TRIES && !found; t++) {
      const p = { x: inRange(rng, MARGIN, BOARD_W - MARGIN), y: inRange(rng, MARGIN, BOARD_H - MARGIN) };
      if (farEnough(p, placed, MIN_SPACING)) found = p;
    }
    if (!found) break;
    placed.push(found);
    agents.push(found);
  }
  const u = specials[0]!;
  const order = agents
    .map((p, i) => ({ p, i, d: dist2(p.x, p.y, u.x, u.y) }))
    .sort((a, b) => a.d - b.d || a.i - b.i);
  const kinds: NodeKind[] = ['user', 'web', 'vault', 'out'];
  return [
    ...specials.map((p, i) => makeNode(i, kinds[i]!, p)),
    ...order.map((o, k) => makeNode(4 + k, 'agent', o.p)),
  ];
}
