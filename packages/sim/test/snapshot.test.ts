import { describe, expect, it } from 'vitest';
import { stateHash } from '../src/hash';
import { Rng } from '../src/rng';
import { restore, snapshot } from '../src/snapshot';
import { createGame, step } from '../src/step';
import { randomPolicy } from './policy';

describe('snapshot', () => {
  it('restores a state that keeps stepping identically (200 seeds)', () => {
    for (let i = 0; i < 200; i++) {
      const a = createGame({ seed: `snap-${i}`, mode: 'agent' });
      const pa = new Rng(`p-${i}`);
      for (let k = 0; k < 900 && a.phase !== 'over'; k++) step(a, randomPolicy(a, pa, true));
      const b = restore(snapshot(a));
      expect(stateHash(b)).toBe(stateHash(a));
      const pb = new Rng(`q-${i}`);
      const pc = new Rng(`q-${i}`);
      for (let k = 0; k < 900 && a.phase !== 'over'; k++) {
        step(a, randomPolicy(a, pb, true));
        step(b, randomPolicy(b, pc, true));
      }
      expect(stateHash(b)).toBe(stateHash(a));
    }
  });

  it('is a plain string and does not share objects with the source', () => {
    const a = createGame({ seed: 'iso', mode: 'agent' });
    const snap = snapshot(a);
    expect(typeof snap).toBe('string');
    const b = restore(snap);
    b.nodes[0]!.x = -1;
    expect(a.nodes[0]!.x).not.toBe(-1);
  });

  it('rejects a snapshot from another sim version', () => {
    const a = createGame({ seed: 'ver', mode: 'agent' });
    const bad = JSON.parse(snapshot(a));
    bad.v = 999;
    expect(() => restore(JSON.stringify(bad))).toThrow();
  });
});
