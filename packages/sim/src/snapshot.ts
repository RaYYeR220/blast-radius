import { SIM_VERSION } from './constants';
import { Rng } from './rng';
import type { GameState } from './types';

/** A self-contained string from which the game can continue exactly where it was. */
export function snapshot(s: GameState): string {
  const { rng, events, adj, adjDirty, ...rest } = s;
  void events;
  void adj;
  void adjDirty;
  return JSON.stringify({ ...rest, rng: rng.snapshot() });
}

export function restore(str: string): GameState {
  const o = JSON.parse(str) as Omit<GameState, 'rng'> & { rng: number[] };
  if (o.v !== SIM_VERSION) throw new Error(`snapshot from sim v${o.v}, this is v${SIM_VERSION}`);
  return { ...o, rng: Rng.fromSnapshot(o.rng), events: [], adj: [], adjDirty: true };
}
