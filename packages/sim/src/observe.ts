import { STALL_TICKS } from './constants';
import { backlog, capacity } from './packets';
import { INJECTIONS, TASKS } from './payloads';
import type { GameState, NodeKind, Offer, Phase, UpgradeId, Variant } from './types';

export interface ObservedNode {
  id: number;
  kind: NodeKind;
  x: number;
  y: number;
  state: 'ok' | 'incubating' | 'infected' | 'quarantined';
}

export interface ObservedPacket {
  id: number;
  kind: 'task' | 'inject';
  variant: Variant | null;
  /** −1 while the packet sits on a node. */
  edge: number;
  at: number;
  from: number;
  to: number;
  progress: number;
  carrying: 'secret' | null;
  text: string;
}

export interface AgentObservation {
  tick: number;
  phase: Phase;
  wave: number;
  credits: number;
  score: number;
  backlog: number;
  capacity: number;
  /** Ticks left before a stall ends the run, or null when not stalling. */
  stallIn: number | null;
  canaries: number;
  upgrades: UpgradeId[];
  offers: Offer[];
  nodes: ObservedNode[];
  edges: Array<{ id: number; a: number; b: number; severed: boolean }>;
  packets: ObservedPacket[];
}

/** What a player can see. Unrevealed stealth packets look exactly like tasks. */
export function observe(s: GameState): AgentObservation {
  const nodes: ObservedNode[] = s.nodes
    .filter((n) => n.active)
    .map((n) => ({
      id: n.id,
      kind: n.kind,
      x: n.x,
      y: n.y,
      state:
        n.quarantinedUntil > s.tick ? 'quarantined' : n.infection === 2 ? 'infected' : n.infection === 1 ? 'incubating' : 'ok',
    }));
  const packets: ObservedPacket[] = s.packets
    .filter((p) => !p.dead)
    .map((p) => {
      const hidden = p.kind === 'inject' && !p.revealed;
      const looksLikeTask = p.kind === 'task' || hidden;
      return {
        id: p.id,
        kind: looksLikeTask ? 'task' : 'inject',
        variant: looksLikeTask ? null : p.variant,
        edge: p.edge,
        at: p.node,
        from: p.from,
        to: p.to,
        progress: Math.round(p.progress * 100) / 100,
        carrying: p.secret && !hidden ? 'secret' : null,
        text: hidden
          ? `${TASKS[p.id % TASKS.length]!} <!-- ${INJECTIONS[p.payload]!} -->`
          : p.kind === 'inject'
            ? INJECTIONS[p.payload]!
            : TASKS[p.id % TASKS.length]!,
      };
    });
  return {
    tick: s.tick,
    phase: s.phase,
    wave: s.wave,
    credits: s.credits,
    score: s.score,
    backlog: backlog(s),
    capacity: capacity(s),
    stallIn: s.stallTicks > 0 ? STALL_TICKS - s.stallTicks : null,
    canaries: s.canaries,
    upgrades: (Object.keys(s.up) as UpgradeId[]).filter((k) => s.up[k]),
    offers: s.offers.slice(),
    nodes,
    edges: s.edges.filter((e) => !e.removed).map((e) => ({ id: e.id, a: e.a, b: e.b, severed: e.severedUntil > s.tick })),
    packets,
  };
}
