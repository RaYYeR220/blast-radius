import { describe, expect, it } from 'vitest';
import { nextHop } from '../src/routing';
import { testState } from './helpers';

// line 0-1-2-3 plus a shortcut 0-4-3
const line = () =>
  testState(
    [[0, 0, 'user'], [100, 0, 'agent'], [200, 0, 'agent'], [300, 0, 'vault'], [150, 100, 'agent']],
    [[0, 1], [1, 2], [2, 3], [0, 4], [4, 3]],
  );

describe('nextHop', () => {
  it('takes the shortest path', () => {
    expect(nextHop(line(), 0, 3)).toBe(3);
  });
  it('avoids severed edges', () => {
    const s = line();
    s.edges[3]!.severedUntil = 999;
    expect(nextHop(s, 0, 3)).toBe(0);
  });
  it('treats an edge as healed once its sever time has passed', () => {
    const s = line();
    s.edges[3]!.severedUntil = 5;
    s.tick = 5;
    expect(nextHop(s, 0, 3)).toBe(3);
  });
  it('avoids quarantined intermediate nodes', () => {
    const s = line();
    s.nodes[4]!.quarantinedUntil = 999;
    expect(nextHop(s, 0, 3)).toBe(0);
  });
  it('refuses a quarantined goal', () => {
    const s = line();
    s.nodes[3]!.quarantinedUntil = 999;
    expect(nextHop(s, 0, 3)).toBe(-1);
  });
  it('avoids removed edges and inactive nodes', () => {
    const s = line();
    s.edges[3]!.removed = true;
    s.adjDirty = true;
    expect(nextHop(s, 0, 3)).toBe(0);
    s.nodes[1]!.active = false;
    expect(nextHop(s, 0, 3)).toBe(-1);
  });
  it('returns -1 when cut off', () => {
    const s = line();
    s.edges[0]!.severedUntil = 999;
    s.edges[3]!.severedUntil = 999;
    expect(nextHop(s, 0, 3)).toBe(-1);
  });
  it('returns -1 at the goal', () => {
    expect(nextHop(line(), 3, 3)).toBe(-1);
  });
  it('breaks ties toward the lowest edge id', () => {
    const s = testState(
      [[0, 0, 'user'], [100, -50, 'agent'], [100, 50, 'agent'], [200, 0, 'vault']],
      [[0, 2], [0, 1], [1, 3], [2, 3]],
    );
    expect(nextHop(s, 0, 3)).toBe(0);
  });
});
