import { SCORE_CLEAN_WAVE } from './constants';
import { addPeerEdges, growWave } from './graph';
import { rollOffers } from './upgrades';
import type { GameState } from './types';

/** Closes the wave: clean bonus, then the shop. */
export function endWave(s: GameState): void {
  if (s.waveInfections === 0) s.score += SCORE_CLEAN_WAVE;
  s.phase = 'shop';
  s.offers = rollOffers(s);
  s.events.push({ tick: s.tick, e: 'shop' });
}

export function startNextWave(s: GameState): void {
  s.wave++;
  s.waveStart = s.tick;
  growWave(s);
  addPeerEdges(s, s.wave >= 3 ? 1 + s.rng.int(2) : 0);
  s.waveInfections = 0;
  s.offers = [];
  s.phase = 'play';
  s.events.push({ tick: s.tick, e: 'wave', wave: s.wave });
}
