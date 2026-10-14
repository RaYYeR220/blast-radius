import { quarantineCost } from './actions';
import { MAX_RUN_TICKS } from './constants';
import { type RunSummary, Recorder, summarize } from './replay';
import { Rng } from './rng';
import { createGame } from './step';
import type { Action, GameState, Mode, UpgradeId } from './types';

export type BotKind = 'idle' | 'denyAll' | 'heuristic' | 'sloppy';
export type Bot = (s: GameState) => Action[];

const SHOP_PRIORITY: readonly UpgradeId[] = [
  'canary', 'rollback', 'breaker', 'rateLimit', 'sandbox', 'fastHeal', 'wideBlade', 'leastPriv', 'allowlist', 'hitl',
];

function shopChoice(s: GameState): Action[] {
  for (const id of SHOP_PRIORITY) {
    const slot = s.offers.findIndex((o) => o.id === id);
    if (slot >= 0 && s.offers[slot]!.price <= s.credits) return [{ type: 'pick', slot: slot as 0 | 1 | 2 }];
  }
  return [{ type: 'skip' }];
}

const idle: Bot = (s) => (s.phase === 'shop' ? [{ type: 'skip' }] : []);

const denyAll: Bot = (s) => {
  if (s.phase === 'shop') return [{ type: 'skip' }];
  if (s.phase !== 'play') return [];
  return s.edges
    .filter((e) => !e.removed && e.severedUntil <= s.tick)
    .filter((e) => e.a === s.user || e.b === s.user || e.a === s.web || e.b === s.web)
    .map((e) => ({ type: 'cut', edge: e.id, t: 500 }));
};

/**
 * A capable but human-limited defender: it reacts after a short delay, makes
 * a few moves per second, aims imperfectly, and only sees what a player sees.
 */
export function heuristicBot(seed: string, opts = { reactTicks: 30, moveEvery: 45, aimError: 0.06 }): Bot {
  const rng = new Rng(`bot-${seed}`);
  const seenAt = new Map<number, number>();
  let nextMoveAt = 0;
  return (s) => {
    if (s.phase === 'shop') return shopChoice(s);
    if (s.phase !== 'play') return [];
    for (const p of s.packets) {
      if (!p.dead && p.kind === 'inject' && p.revealed && !seenAt.has(p.id)) seenAt.set(p.id, s.tick);
    }
    if (s.tick < nextMoveAt) return [];
    // hubs that are turning first: quarantine an infected or incubating agent
    const sick = s.nodes
      .filter((n) => n.active && n.kind === 'agent' && n.infection > 0 && n.quarantinedUntil <= s.tick)
      .sort((a, b) => b.degree - a.degree || a.id - b.id);
    if (sick.length && s.credits >= quarantineCost(s) && s.tick >= s.nodes[sick[0]!.id]!.incubateUntil - 45) {
      nextMoveAt = s.tick + opts.moveEvery;
      return [{ type: 'quarantine', node: sick[0]!.id }];
    }
    // otherwise cut the most urgent visible injection: secrets first, then closest to the vault
    const targets = s.packets
      .filter((p) => !p.dead && p.kind === 'inject' && p.revealed && p.edge >= 0)
      .filter((p) => s.tick - (seenAt.get(p.id) ?? s.tick) >= opts.reactTicks)
      .filter((p) => s.edges[p.edge]!.severedUntil <= s.tick)
      .sort((a, b) => Number(b.secret) - Number(a.secret) || b.progress - a.progress || a.id - b.id);
    const p = targets[0];
    if (!p) return [];
    const e = s.edges[p.edge]!;
    const pa = p.from === e.a ? p.progress : 1 - p.progress;
    const err = (rng.next() * 2 - 1) * opts.aimError;
    const t = Math.max(0, Math.min(1000, Math.round((pa + err) * 1000)));
    nextMoveAt = s.tick + opts.moveEvery;
    return [{ type: 'cut', edge: p.edge, t }];
  };
}

export function makeBot(kind: BotKind, seed: string): Bot {
  if (kind === 'idle') return idle;
  if (kind === 'denyAll') return denyAll;
  if (kind === 'sloppy') return heuristicBot(seed, { reactTicks: 45, moveEvery: 75, aimError: 0.12 });
  return heuristicBot(seed);
}

/** Plays one full game with a bot through a Recorder (so the run is replayable). */
export function runBot(kind: BotKind, seed: string, mode: Mode = 'endless'): RunSummary & { actions: number } {
  const s = createGame({ seed, mode });
  const rec = new Recorder(s);
  const bot = makeBot(kind, seed);
  for (let i = 0; i < MAX_RUN_TICKS + 1000 && s.phase !== 'over'; i++) rec.step(bot(s));
  return { ...summarize(s), actions: rec.replay().actions.length };
}
