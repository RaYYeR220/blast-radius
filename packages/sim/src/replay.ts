import { MAX_RUN_TICKS, SIM_VERSION } from './constants';
import { stateHash } from './hash';
import { createGame, step } from './step';
import type { Action, EndReason, GameState, Mode, SimEvent } from './types';

export interface ReplayEntry {
  tick: number;
  a: Action;
}

export interface Replay {
  v: number;
  mode: Mode;
  seed: string;
  actions: ReplayEntry[];
}

export interface RunSummary {
  score: number;
  wave: number;
  shipped: number;
  intercepts: number;
  infected: number;
  endedBy: EndReason;
  durationTicks: number;
  rootPayload: number | null;
  leakPath: number[] | null;
  /** Hash of the final state: two logs that end identically are the same run. */
  finalHash: string;
}

export const MAX_REPLAY_ENTRIES = 20_000;

/** Steps a live game and keeps the log needed to reproduce it. */
export class Recorder {
  private readonly log: ReplayEntry[] = [];

  constructor(readonly state: GameState) {}

  step(actions: readonly Action[]): SimEvent[] {
    for (const a of actions) this.log.push({ tick: this.state.tick, a });
    return step(this.state, actions);
  }

  replay(): Replay {
    return { v: this.state.v, mode: this.state.mode, seed: this.state.seed, actions: this.log.slice() };
  }
}

const ACTION_TYPES = new Set(['cut', 'quarantine', 'pick', 'reroll', 'skip']);

/** Rebuilds each action with only the fields the rules read, in a fixed order. */
export function canonicalActions(entries: readonly ReplayEntry[]): ReplayEntry[] {
  return entries.map((e) => {
    // malformed entries pass through untouched; verification rejects them
    if (!e || typeof e !== 'object' || !e.a || typeof e.a !== 'object') return e;
    const { tick, a } = e;
    switch (a.type) {
      case 'cut':
        return { tick, a: { type: 'cut', edge: a.edge, t: a.t } };
      case 'quarantine':
        return { tick, a: { type: 'quarantine', node: a.node } };
      case 'pick':
        return { tick, a: { type: 'pick', slot: a.slot } };
      default:
        return { tick, a: { type: a.type } as Action };
    }
  });
}

function wellFormed(r: Replay): string | null {
  if (!r || typeof r !== 'object') return 'not a replay';
  if (typeof r.seed !== 'string' || r.seed.length === 0 || r.seed.length > 64) return 'bad seed';
  if (!Array.isArray(r.actions)) return 'bad actions';
  if (r.actions.length > MAX_REPLAY_ENTRIES) return 'too many actions';
  let last = 0;
  for (const e of r.actions) {
    if (!e || !Number.isInteger(e.tick) || e.tick < 0) return 'bad tick';
    if (e.tick < last) return 'ticks run backwards';
    last = e.tick;
    if (!e.a || typeof e.a !== 'object' || !ACTION_TYPES.has((e.a as { type: string }).type)) return 'bad action';
  }
  return null;
}

/** Re-simulates a replay from scratch. Runs past the log until the game ends. */
export function runReplay(r: Replay, opts: { untilTick?: number } = {}): { state: GameState; rejected: number } {
  const s = createGame({ seed: r.seed, mode: r.mode });
  const acts = r.actions;
  let idx = 0;
  let rejected = 0;
  while (s.phase !== 'over') {
    if (opts.untilTick !== undefined && s.tick >= opts.untilTick) break;
    const batch: Action[] = [];
    while (idx < acts.length && acts[idx]!.tick === s.tick) batch.push(acts[idx++]!.a);
    if (s.phase === 'shop' && batch.length === 0) {
      s.phase = 'over';
      s.end = 'abandoned';
      break;
    }
    for (const e of step(s, batch)) if (e.e === 'reject') rejected++;
    if (s.tick >= MAX_RUN_TICKS) break;
  }
  return { state: s, rejected };
}

export function summarize(s: GameState): RunSummary {
  return {
    score: s.score,
    wave: s.wave,
    shipped: s.shipped,
    intercepts: s.intercepts,
    infected: s.infectedTotal,
    endedBy: s.end ?? 'abandoned',
    durationTicks: s.tick,
    rootPayload: s.rootPayload,
    leakPath: s.leakPath,
    finalHash: stateHash(s),
  };
}

export type Verdict = { ok: true; summary: RunSummary } | { ok: false; reason: string };

/** Accepts a run only if it re-simulates to the claimed score and ended by the rules. */
export function verifyReplay(r: Replay, claimed: { score: number }): Verdict {
  if (r?.v !== SIM_VERSION) return { ok: false, reason: 'wrong sim version' };
  const bad = wellFormed(r);
  if (bad) return { ok: false, reason: bad };
  let out: { state: GameState; rejected: number };
  try {
    out = runReplay(r);
  } catch {
    return { ok: false, reason: 'replay failed to run' };
  }
  if (out.rejected > 0) return { ok: false, reason: 'replay contains illegal actions' };
  const s = out.state;
  if (s.end !== 'leak' && s.end !== 'stall') return { ok: false, reason: `run did not finish (${s.end ?? 'open'})` };
  if (s.score !== claimed.score) return { ok: false, reason: 'score does not match' };
  return { ok: true, summary: summarize(s) };
}
