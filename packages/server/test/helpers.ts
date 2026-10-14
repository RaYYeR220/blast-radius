import { createGame, Recorder, type Mode, type Replay } from '@blast/sim';
import { makeBot } from '@blast/sim/bots';
import { MemoryRepo } from '../src/repo';
import type { Deps } from '../src/runs';

/** Plays a full game with a bot and returns its replay and final score. */
export function playToEnd(seed: string, mode: Mode = 'endless', bot: 'sloppy' | 'idle' = 'idle'): { replay: Replay; score: number } {
  const s = createGame({ seed, mode });
  const rec = new Recorder(s);
  const b = makeBot(bot, seed);
  while (s.phase !== 'over') rec.step(b(s));
  return { replay: rec.replay(), score: s.score };
}

export function deps(now = Date.parse('2026-10-15T12:00:00Z')): Deps & { repo: MemoryRepo } {
  return { repo: new MemoryRepo(), now: () => now, salt: 'test-salt' };
}
