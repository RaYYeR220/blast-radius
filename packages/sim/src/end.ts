import type { EndReason, GameState } from './types';

export function endGame(s: GameState, reason: EndReason): void {
  if (s.phase === 'over') return;
  s.phase = 'over';
  s.end = reason;
  s.events.push({ tick: s.tick, e: 'over', reason });
}
