import { quarantineCost } from '../src/actions';
import type { Rng } from '../src/rng';
import type { Action, GameState } from '../src/types';

/**
 * A seeded random player used by determinism tests. With `validOnly` it only
 * issues actions the rules accept, so its runs verify cleanly.
 */
export function randomPolicy(s: GameState, r: Rng, validOnly = false): Action[] {
  if (s.phase === 'shop') {
    const roll = r.next();
    if (roll < 0.15 && (!validOnly || s.credits >= 3)) return [{ type: 'reroll' }];
    const slot = r.int(3) as 0 | 1 | 2;
    const offer = s.offers[slot];
    if (roll < 0.7 && offer && (!validOnly || s.credits >= offer.price)) return [{ type: 'pick', slot }];
    return [{ type: 'skip' }];
  }
  if (s.phase !== 'play') return [];
  const out: Action[] = [];
  if (r.next() < 0.05) {
    const live = s.edges.filter((e) => !e.removed);
    const e = live[r.int(live.length)]!;
    out.push({ type: 'cut', edge: e.id, t: r.int(1001) });
  }
  if (r.next() < 0.01) {
    const agents = s.nodes.filter((n) => n.active && n.kind === 'agent' && n.quarantinedUntil <= s.tick);
    const n = agents.length ? agents[r.int(agents.length)]! : null;
    if (n && (!validOnly || s.credits >= quarantineCost(s))) out.push({ type: 'quarantine', node: n.id });
  }
  return out;
}

/** Cuts every visible injection where it stands and quarantines incubating agents. */
export function sniper(s: GameState): Action[] {
  if (s.phase !== 'play') return [];
  const out: Action[] = [];
  const cutEdges = new Set<number>();
  for (const p of s.packets) {
    if (p.dead || p.kind !== 'inject' || !p.revealed || p.edge < 0 || cutEdges.has(p.edge)) continue;
    const e = s.edges[p.edge]!;
    if (e.severedUntil > s.tick) continue;
    const pa = p.from === e.a ? p.progress : 1 - p.progress;
    out.push({ type: 'cut', edge: p.edge, t: Math.round(pa * 1000) });
    cutEdges.add(p.edge);
  }
  let credits = s.credits;
  for (const n of s.nodes) {
    if (!n.active || n.kind !== 'agent' || n.infection === 0 || n.quarantinedUntil > s.tick) continue;
    if (credits < quarantineCost(s)) break;
    credits -= quarantineCost(s);
    out.push({ type: 'quarantine', node: n.id });
  }
  return out;
}
