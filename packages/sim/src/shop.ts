import { REROLL_COST } from './constants';
import { startNextWave } from './waves';
import { applyUpgrade, rollOffers } from './upgrades';
import type { Action, GameState } from './types';

function reject(s: GameState, action: Action, reason: string): false {
  s.events.push({ tick: s.tick, e: 'reject', action, reason });
  return false;
}

export function shopAction(s: GameState, a: Action): boolean {
  if (a.type === 'skip') {
    startNextWave(s);
    return true;
  }
  if (a.type === 'reroll') {
    if (s.credits < REROLL_COST) return reject(s, a, 'not enough credits');
    s.credits -= REROLL_COST;
    s.offers = rollOffers(s);
    return true;
  }
  if (a.type === 'pick') {
    const offer = Number.isInteger(a.slot) ? s.offers[a.slot] : undefined;
    if (!offer) return reject(s, a, 'no such offer');
    if (s.credits < offer.price) return reject(s, a, 'not enough credits');
    s.credits -= offer.price;
    applyUpgrade(s, offer.id);
    startNextWave(s);
    return true;
  }
  return reject(s, a, 'not a shop action');
}
