import { describe, expect, it } from 'vitest';
import { type BotKind, runBot } from '../src/bots';

const SEEDS = Array.from({ length: 50 }, (_, i) => `balance-${i}`);

function stats(kind: BotKind) {
  const runs = SEEDS.map((seed) => runBot(kind, seed));
  const waves = runs.map((r) => r.wave).sort((a, b) => a - b);
  const share = (end: string) => runs.filter((r) => r.endedBy === end).length / runs.length;
  return {
    leak: share('leak'),
    stall: share('stall'),
    median: waves[Math.floor(waves.length / 2)]!,
    p10: waves[Math.floor(waves.length * 0.1)]!,
  };
}

describe('balance gates', () => {
  it('idle play loses to a leak', () => {
    expect(stats('idle').leak).toBeGreaterThanOrEqual(0.95);
  });

  it('cutting everything loses to a stall', () => {
    expect(stats('denyAll').stall).toBeGreaterThanOrEqual(0.95);
  });

  it('a sensible defender survives several waves', () => {
    const h = stats('heuristic');
    expect(h.median).toBeGreaterThanOrEqual(6);
    expect(h.p10).toBeGreaterThanOrEqual(3);
  });

  it('bots are deterministic', () => {
    expect(runBot('heuristic', 'det')).toEqual(runBot('heuristic', 'det'));
  });
});
