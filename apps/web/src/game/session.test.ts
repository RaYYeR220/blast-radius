import { createGame, runReplay, stateHash } from '@blast/sim';
import { describe, expect, it } from 'vitest';
import { Session } from './session';

const fresh = () => new Session({ seed: 'sess', mode: 'endless' }, createGame({ seed: 'sess', mode: 'endless' }));

describe('Session', () => {
  it('advances one tick per call and records queued actions on that tick', () => {
    const s = fresh();
    s.tick();
    s.act([{ type: 'cut', edge: 0, t: 500 }]);
    s.tick();
    expect(s.state.tick).toBe(2);
    expect(s.replay().actions).toEqual([{ tick: 1, a: { type: 'cut', edge: 0, t: 500 } }]);
  });

  it('produces a replay that re-simulates to the same state', () => {
    const s = fresh();
    for (let i = 0; i < 300; i++) {
      if (i === 100) s.act([{ type: 'cut', edge: 1, t: 300 }]);
      s.tick();
    }
    const r = runReplay(s.replay(), { untilTick: s.state.tick });
    expect(stateHash(r.state)).toBe(stateHash(s.state));
  });

  it('keeps the previous packet positions for interpolation', () => {
    const s = fresh();
    for (let i = 0; i < 90; i++) s.tick(); // the first task leaves the user at ~0.9 s
    const moving = s.state.packets.find((p) => p.edge >= 0);
    expect(moving).toBeDefined();
    expect(s.prev.has(moving!.id)).toBe(true);
  });

  it('applies shop actions at once, since time is stopped', () => {
    const s = fresh();
    s.state.phase = 'shop';
    s.state.offers = [];
    s.act([{ type: 'skip' }]);
    expect(s.state.phase).toBe('play');
    expect(s.state.wave).toBe(2);
  });

  it('notifies listeners of events', () => {
    const s = fresh();
    const seen: string[] = [];
    s.on((e) => seen.push(e.e));
    for (let i = 0; i < 120; i++) s.tick();
    expect(seen).toContain('spawn');
  });

  it('samples backlog and infection once a second', () => {
    const s = fresh();
    for (let i = 0; i < 240; i++) s.tick();
    expect(s.timeline.length).toBe(4);
    expect(s.timeline[0]!.capacity).toBeGreaterThan(0);
  });
});
