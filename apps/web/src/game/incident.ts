import { type GameState, TICK_HZ } from '@blast/sim';

/** FNV-1a, 32-bit. */
export function hashStr(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** A short, stable name for a run's incident: the same run always gets the same INC-XXXX. */
export function incidentId(seed: string, tick: number, score: number): string {
  const h = hashStr(`${seed}:${tick}:${score}`).toString(36).toUpperCase().replace(/[^A-Z0-9]/g, '');
  return `INC-${(h + 'K7Q2').slice(0, 4)}`;
}

/** Ticks as m:ss. */
export function mmss(ticks: number): string {
  const sec = Math.floor(ticks / TICK_HZ);
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

export function nodeName(s: GameState, id: number): string {
  const k = s.nodes[id]?.kind;
  if (!k) return '?';
  return k === 'agent' ? `agent ${id}` : k === 'out' ? 'outbound' : k;
}

/** The leak's route in words: "web → agent 5 → vault → outbound". */
export function leakRoute(s: GameState): string {
  return (s.leakPath ?? []).map((id) => nodeName(s, id)).join(' → ');
}

export const plural = (n: number, one: string, many = `${one}s`): string => (n === 1 ? one : many);
