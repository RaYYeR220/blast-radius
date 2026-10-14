import { createGame, INJECTIONS, type GameOptions } from '@blast/sim';
import { type BotKind, makeBot } from '@blast/sim/bots';
import { describe, expect, it } from 'vitest';
import { buildRunRecord, Tally } from './record';
import { Session } from './session';

function play(kind: BotKind, seed: string): { session: Session; tally: Tally } {
  const opts: GameOptions = { seed, mode: 'endless' };
  const session = new Session(opts, createGame(opts));
  const tally = new Tally();
  session.on((e) => tally.onEvent(session.state, e));
  const bot = makeBot(kind, seed);
  for (let i = 0; i < 200_000 && session.state.phase !== 'over'; i++) {
    session.act(bot(session.state));
    session.tick();
  }
  return { session, tally };
}

describe('run record', () => {
  it('logs the injection that leaked', () => {
    const { session, tally } = play('idle', 'e2e-leak');
    const s = session.state;
    expect(s.end).toBe('leak');
    const r = buildRunRecord(s, 'endless', '2026-10-14', tally);
    expect(r.payloads).toContain(s.rootPayload);
    expect(r).toMatchObject({ mode: 'endless', day: '2026-10-14', score: s.score, intercepts: 0, wave: s.wave });
  });

  it('logs the texts of intercepted injections and counts clean waves', () => {
    const { session, tally } = play('heuristic', 'record-1');
    const s = session.state;
    expect(s.intercepts).toBeGreaterThan(0);
    const r = buildRunRecord(s, 'daily', '2026-10-14', tally);
    expect(r.payloads.length).toBeGreaterThan(0);
    expect(r.payloads.every((p) => p >= 0 && p < INJECTIONS.length)).toBe(true);
    expect([...r.payloads].sort((a, b) => a - b)).toEqual(r.payloads);
    expect(new Set(r.payloads).size).toBe(r.payloads.length);
    expect(r.cleanWaves).toBeGreaterThanOrEqual(0);
    expect(r.cleanWaves).toBeLessThan(s.wave);
    expect(r.shipped).toBe(s.shipped);
  });
});
