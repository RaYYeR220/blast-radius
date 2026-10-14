import type { GameState } from './types';

/** FNV-1a over a canonical serialisation of everything the rules read. */
export function stateHash(s: GameState): string {
  const parts: Array<string | number | boolean> = [
    s.tick, s.phase, s.wave, s.waveStart, s.credits, s.score, s.queue, s.spawnAcc, s.stallTicks,
    s.shipped, s.intercepts, s.lost, s.canaries, s.end ?? '-', ...s.rng.snapshot(),
  ];
  for (const n of s.nodes) {
    parts.push(n.id, n.active, n.quarantinedUntil, n.infection, n.incubateUntil, n.nextEmitAt, n.payload, n.degree);
  }
  for (const e of s.edges) parts.push(e.id, e.removed, e.severedUntil, e.gapT);
  for (const p of s.packets) {
    parts.push(p.id, p.kind, p.variant ?? '-', p.node, p.edge, p.from, p.to, p.progress, p.stopIdx, p.secret, p.waitUntil);
  }
  const str = parts.join('|');
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
