import { createGame, Recorder, runReplay, stateHash } from '@blast/sim';
import { makeBot } from '@blast/sim/bots';
import { describe, expect, it } from 'vitest';
import { ReplayPlayer } from './replayer';

function recorded(seed: string) {
  const s = createGame({ seed, mode: 'daily' });
  const rec = new Recorder(s);
  const bot = makeBot('sloppy', seed);
  while (s.phase !== 'over') rec.step(bot(s));
  return { replay: rec.replay(), final: stateHash(s), ticks: s.tick };
}

describe('ReplayPlayer', () => {
  const { replay, final, ticks } = recorded('daily-2026-10-15');

  it('knows how long the run lasts before playing it', () => {
    expect(new ReplayPlayer(replay).duration).toBe(ticks);
  });

  it('plays the run tick by tick to the identical final state', () => {
    const p = new ReplayPlayer(replay);
    let guard = 0;
    while (!p.done && guard++ < 1_000_000) p.tick();
    expect(stateHash(p.session.state)).toBe(final);
  });

  it('seeks to any tick, matching a headless re-simulation', () => {
    const p = new ReplayPlayer(replay);
    const target = Math.floor(ticks * 0.6);
    p.seek(target);
    expect(p.session.state.tick).toBe(target);
    expect(stateHash(p.session.state)).toBe(stateHash(runReplay(replay, { untilTick: target }).state));
    p.seek(10);
    expect(p.session.state.tick).toBe(10);
  });
});
