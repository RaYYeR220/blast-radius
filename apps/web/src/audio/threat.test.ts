import { describe, expect, it } from 'vitest';
import { boardOf } from '../game/fixtures';
import { threatOf } from './threat';

const s = () =>
  boardOf(
    [[0, 0, 'user'], [300, 0, 'agent'], [600, 0, 'vault'], [900, 0, 'out'], [300, 300, 'web']],
    [[0, 1], [1, 2], [2, 3], [1, 4]],
  );

describe('threatOf', () => {
  it('is zero on a quiet board', () => {
    expect(threatOf(s())).toBe(0);
  });

  it('rises with backlog, injections near the vault and infected agents, and stays in 0..1', () => {
    const st = s();
    st.queue = 200;
    expect(threatOf(st)).toBeCloseTo(0.4, 5);
    st.nodes[1]!.infection = 2;
    const withInfection = threatOf(st);
    expect(withInfection).toBeGreaterThan(0.4);
    expect(withInfection).toBeLessThanOrEqual(1);
  });
});
