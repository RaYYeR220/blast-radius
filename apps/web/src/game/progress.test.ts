import { describe, expect, it } from 'vitest';
import { DEFAULTS } from './persist';
import { recordRun, showTutorial } from './progress';

const fresh = () => structuredClone(DEFAULTS);
const run = (o: Partial<{ intercepts: number; wave: number; cleanWaves: number; score: number; payloads: number[] }>) => ({
  mode: 'endless' as const, day: '2026-10-14', score: 0, intercepts: 0, shipped: 0, wave: 1, cleanWaves: 0, payloads: [], ...o,
});

describe('progress', () => {
  it('shows the tutorial until the first intercept ever', () => {
    const d = fresh();
    expect(showTutorial(d)).toBe(true);
    recordRun(d, run({ intercepts: 1 }));
    expect(showTutorial(d)).toBe(false);
  });

  it('unlocks each blade trail once, at its milestone', () => {
    const d = fresh();
    const first = recordRun(d, run({ intercepts: 1 }));
    expect(first.unlocked).toEqual(['spark']);
    expect(recordRun(d, run({ intercepts: 1 })).unlocked).toEqual([]);
    expect(recordRun(d, run({ wave: 6 })).unlocked).toEqual(['ember']);
    expect(recordRun(d, run({ intercepts: 98 })).unlocked).toEqual(['ribbon']);
    expect(recordRun(d, run({ cleanWaves: 4 })).unlocked).toEqual(['prism']);
    expect(d.trails).toEqual(['plain', 'spark', 'ember', 'ribbon', 'prism']);
  });

  it('keeps bests per mode and per day, and logs new injections in the archive', () => {
    const d = fresh();
    const a = recordRun(d, run({ score: 500, payloads: [4, 9] }));
    expect(a.newBest).toBe(true);
    expect(a.newPayloads).toEqual([4, 9]);
    const b = recordRun(d, run({ score: 300, payloads: [9, 12] }));
    expect(b.newBest).toBe(false);
    expect(b.newPayloads).toEqual([12]);
    expect(d.best.endless).toBe(500);
    recordRun(d, { ...run({ score: 700 }), mode: 'daily' });
    expect(d.best.daily['2026-10-14']).toBe(700);
    expect(d.stats.runs).toBe(3);
  });
});
