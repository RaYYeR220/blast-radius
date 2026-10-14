import type { SimEvent } from '@blast/sim';
import { describe, expect, it } from 'vitest';
import { AudioEngine } from './engine';
import { FakeContext } from './fake';

function make() {
  const ctx = new FakeContext();
  const engine = new AudioEngine(() => ctx as unknown as AudioContext);
  return { ctx, engine };
}
const ev = (e: Partial<SimEvent> & { e: string }, tick = 0) => ({ tick, ...e }) as SimEvent;

describe('AudioEngine', () => {
  it('stays silent until unlocked by a gesture', () => {
    const { ctx, engine } = make();
    engine.onEvent(ev({ e: 'intercept', packet: 1, edge: 0, variant: 'plain' }));
    expect(ctx.oscillators.length).toBe(0);
    engine.unlock();
    expect(ctx.state).toBe('running');
    engine.onEvent(ev({ e: 'intercept', packet: 1, edge: 0, variant: 'plain' }));
    expect(ctx.oscillators.length).toBeGreaterThan(0);
  });

  it('falls silent while the tab is hidden and comes back with it', () => {
    const { ctx, engine } = make();
    engine.setHidden(false);
    expect(ctx.state).toBe('suspended'); // nothing starts before the first gesture
    engine.unlock();
    engine.setHidden(true);
    expect(ctx.state).toBe('suspended');
    engine.setHidden(false);
    expect(ctx.state).toBe('running');
  });

  it('mutes through the master gain', () => {
    const { engine } = make();
    engine.unlock();
    engine.setMuted(true);
    expect(engine.masterLevel).toBe(0);
    engine.setMuted(false);
    expect(engine.masterLevel).toBeGreaterThan(0);
  });

  it('rate-limits the ship blip to eight per second', () => {
    const { ctx, engine } = make();
    engine.unlock();
    const before = ctx.oscillators.length;
    for (let i = 0; i < 40; i++) engine.onEvent(ev({ e: 'ship', packet: i, job: 'compute' }));
    expect(ctx.oscillators.length - before).toBeLessThanOrEqual(8);
    ctx.currentTime = 1.1;
    for (let i = 0; i < 40; i++) engine.onEvent(ev({ e: 'ship', packet: i, job: 'compute' }));
    expect(ctx.oscillators.length - before).toBeLessThanOrEqual(16);
  });

  it('climbs a pitch ladder for intercepts in quick succession, then resets', () => {
    const { ctx, engine } = make();
    engine.unlock();
    const pitches: number[] = [];
    for (let i = 0; i < 4; i++) {
      const n = ctx.oscillators.length;
      engine.onEvent(ev({ e: 'intercept', packet: i, edge: 0, variant: 'plain' }));
      pitches.push(ctx.oscillators[n]!.frequency.value);
      ctx.currentTime += 0.2;
    }
    for (let i = 1; i < pitches.length; i++) expect(pitches[i]!).toBeGreaterThan(pitches[i - 1]!);
    ctx.currentTime += 3;
    const n = ctx.oscillators.length;
    engine.onEvent(ev({ e: 'intercept', packet: 9, edge: 0, variant: 'plain' }));
    expect(ctx.oscillators[n]!.frequency.value).toBe(pitches[0]);
  });

  it('clamps threat to 0..1', () => {
    const { engine } = make();
    engine.unlock();
    engine.setThreat(4);
    expect(engine.threat).toBe(1);
    engine.setThreat(-1);
    expect(engine.threat).toBe(0);
  });
});
