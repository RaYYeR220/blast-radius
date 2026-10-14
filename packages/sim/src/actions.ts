import {
  BLADE_HALF,
  BLADE_HALF_WIDE,
  QUARANTINE_COST,
  QUARANTINE_COST_SANDBOX,
  QUARANTINE_TICKS,
  QUARANTINE_TICKS_SANDBOX,
  SEVER_TICKS,
  SEVER_TICKS_FAST,
} from './constants';
import { destroy, posFromA } from './packets';
import type { Action, GameState } from './types';

function reject(s: GameState, action: Action, reason: string): false {
  s.events.push({ tick: s.tick, e: 'reject', action, reason });
  return false;
}

export function quarantineCost(s: GameState): number {
  return s.up.sandbox ? QUARANTINE_COST_SANDBOX : QUARANTINE_COST;
}

export function bladeHalf(s: GameState): number {
  return s.up.wideBlade ? BLADE_HALF_WIDE : BLADE_HALF;
}

function cut(s: GameState, a: Extract<Action, { type: 'cut' }>): boolean {
  if (!Number.isInteger(a.edge) || a.edge < 0 || a.edge >= s.edges.length) return reject(s, a, 'no such edge');
  if (!Number.isInteger(a.t) || a.t < 0 || a.t > 1000) return reject(s, a, 't must be an integer 0..1000');
  const e = s.edges[a.edge]!;
  if (e.removed) return reject(s, a, 'edge removed');
  if (e.severedUntil > s.tick) return true;
  const gap = a.t / 1000;
  e.severedUntil = s.tick + (s.up.fastHeal ? SEVER_TICKS_FAST : SEVER_TICKS);
  e.gapT = gap;
  const reach = bladeHalf(s);
  for (const p of s.packets) {
    if (p.dead || p.edge !== e.id) continue;
    if (Math.abs(posFromA(s, p) - gap) * e.len <= reach) destroy(s, p, 'cut');
  }
  s.events.push({ tick: s.tick, e: 'cut', edge: e.id, t: a.t });
  return true;
}

/** Takes an agent offline, clearing any infection. `auto` marks a Rollback. */
export function quarantineNode(s: GameState, id: number, auto: boolean): void {
  const n = s.nodes[id]!;
  n.quarantinedUntil = s.tick + (s.up.sandbox ? QUARANTINE_TICKS_SANDBOX : QUARANTINE_TICKS);
  n.infection = 0;
  n.incubVariant = null;
  n.incubPayload = -1;
  n.payload = -1;
  for (const p of s.packets) if (!p.dead && p.node === id) destroy(s, p, 'quarantine');
  s.events.push({ tick: s.tick, e: 'quarantine', node: id, auto });
}

function quarantine(s: GameState, a: Extract<Action, { type: 'quarantine' }>): boolean {
  if (!Number.isInteger(a.node) || a.node < 0 || a.node >= s.nodes.length) return reject(s, a, 'no such node');
  const n = s.nodes[a.node]!;
  if (!n.active || n.kind !== 'agent') return reject(s, a, 'only agents can be quarantined');
  if (n.quarantinedUntil > s.tick) return reject(s, a, 'already quarantined');
  const cost = quarantineCost(s);
  if (s.credits < cost) return reject(s, a, 'not enough credits');
  s.credits -= cost;
  quarantineNode(s, n.id, false);
  return true;
}

/** Shop actions are wired in by the shop module. */
export type ShopHandler = (s: GameState, a: Action) => boolean;

export function applyAction(s: GameState, a: Action, shop: ShopHandler): boolean {
  if (s.phase === 'over') return reject(s, a, 'game over');
  switch (a.type) {
    case 'cut':
      return s.phase === 'play' ? cut(s, a) : reject(s, a, 'not in play');
    case 'quarantine':
      return s.phase === 'play' ? quarantine(s, a) : reject(s, a, 'not in play');
    case 'pick':
    case 'reroll':
    case 'skip':
      return s.phase === 'shop' ? shop(s, a) : reject(s, a, 'shop is closed');
    default:
      return reject(s, a, 'unknown action');
  }
}
