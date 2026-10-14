import { describe, expect, it } from 'vitest';
import { boardOf } from './fixtures';
import { hashStr, incidentId, leakRoute, mmss, plural } from './incident';

describe('incident', () => {
  it('names a run INC- and four capitals or digits', () => {
    for (const [seed, tick, score] of [['a', 0, 0], ['daily-2026-10-14', 1180, 88], ['e-x9', 99999, 12345]] as const) {
      expect(incidentId(seed, tick, score)).toMatch(/^INC-[A-Z0-9]{4}$/);
    }
  });

  it('gives the same run the same id, and a different run a different one', () => {
    expect(incidentId('shot-1', 1180, 88)).toBe(incidentId('shot-1', 1180, 88));
    expect(incidentId('shot-1', 1180, 88)).not.toBe(incidentId('shot-1', 1181, 88));
  });

  it('hashes with FNV-1a', () => {
    expect(hashStr('')).toBe(2166136261);
    expect(hashStr('a')).toBe(0xe40c292c);
  });

  it('formats ticks as minutes and seconds', () => {
    expect(mmss(0)).toBe('0:00');
    expect(mmss(59)).toBe('0:00');
    expect(mmss(19 * 60)).toBe('0:19');
    expect(mmss(61 * 60)).toBe('1:01');
  });

  it('spells out the leak route', () => {
    const s = boardOf([[100, 100, 'web'], [300, 100, 'agent'], [500, 100, 'vault'], [700, 100, 'out']], [[0, 1], [1, 2], [1, 3]]);
    s.leakPath = [0, 1, 2, 1, 3];
    expect(leakRoute(s)).toBe('web → agent 1 → vault → agent 1 → outbound');
  });

  it('pluralises', () => {
    expect(plural(1, 'agent')).toBe('agent');
    expect(plural(2, 'agent')).toBe('agents');
    expect(plural(0, 'injection')).toBe('injections');
  });
});
