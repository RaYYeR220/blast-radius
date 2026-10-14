import type { GameState, SimEvent } from '@blast/sim';
import type { RunRecord } from './progress';

/**
 * What a run adds to the incident archive and the stats, gathered from its
 * events as it plays: the injection texts the player stopped (or that leaked),
 * and the waves that ended with no agent infected.
 */
export class Tally {
  private readonly payloadOf = new Map<number, number>();
  readonly collected = new Set<number>();
  cleanWaves = 0;

  onEvent(s: GameState, e: SimEvent): void {
    switch (e.e) {
      case 'spawn':
      case 'convert': {
        const p = s.packets.find((q) => q.id === e.packet);
        if (p && p.kind === 'inject') this.payloadOf.set(p.id, p.payload);
        return;
      }
      case 'intercept': {
        const payload = this.payloadOf.get(e.packet);
        if (payload !== undefined) this.collected.add(payload);
        this.payloadOf.delete(e.packet);
        return;
      }
      case 'lost':
      case 'canary':
        this.payloadOf.delete(e.packet);
        return;
      case 'shop':
        if (s.waveInfections === 0) this.cleanWaves++;
        return;
      case 'leak':
        if (s.rootPayload !== null) this.collected.add(s.rootPayload);
        return;
      default:
    }
  }
}

/** The finished run, as progress.recordRun wants it. */
export function buildRunRecord(s: GameState, mode: RunRecord['mode'], day: string, tally: Tally): RunRecord {
  return {
    mode,
    day,
    score: s.score,
    intercepts: s.intercepts,
    shipped: s.shipped,
    wave: s.wave,
    cleanWaves: tally.cleanWaves,
    payloads: [...tally.collected].sort((a, b) => a - b),
  };
}
