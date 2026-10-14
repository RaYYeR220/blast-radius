import { backlog, capacity, type GameState } from '@blast/sim';

/** How bad things look right now, 0..1: backlog pressure, injections close to the vault, infected agents. */
export function threatOf(s: GameState): number {
  const cap = capacity(s);
  const pressure = cap > 0 ? Math.min(1, backlog(s) / cap) : 0;
  let near = 0;
  for (const p of s.packets) {
    if (p.dead || p.kind !== 'inject' || !p.revealed) continue;
    if (p.secret || p.to === s.vault || p.node === s.vault) near++;
  }
  let infected = 0;
  for (const n of s.nodes) if (n.active && n.infection === 2) infected++;
  return Math.min(1, 0.4 * pressure + 0.4 * Math.min(1, near / 3) + 0.2 * Math.min(1, infected / 4));
}
