import { describe, expect, it } from 'vitest';
import { boardOf } from './fixtures';
import { Blade, swipeToCuts, tapToAction } from './input';

// two vertical edges at x=400 and x=800, a horizontal edge along y=900
const s = () =>
  boardOf(
    [
      [400, 100, 'agent'], [400, 700, 'agent'], [800, 100, 'agent'], [800, 700, 'web'],
      [200, 900, 'user'], [1400, 900, 'vault'],
    ],
    [[0, 1], [2, 3], [4, 5]],
  );

describe('swipeToCuts', () => {
  it('cuts each crossed edge once, at the crossing', () => {
    const cuts = swipeToCuts(s(), { x: 200, y: 400 }, { x: 1000, y: 400 }, new Set());
    expect(cuts).toEqual([
      { type: 'cut', edge: 0, t: 500 },
      { type: 'cut', edge: 1, t: 500 },
    ]);
  });

  it('measures t from the lower-id endpoint', () => {
    const cuts = swipeToCuts(s(), { x: 200, y: 250 }, { x: 600, y: 250 }, new Set());
    expect(cuts).toEqual([{ type: 'cut', edge: 0, t: 250 }]);
  });

  it('does not cut the same edge twice in one stroke', () => {
    const seen = new Set<number>();
    swipeToCuts(s(), { x: 200, y: 400 }, { x: 600, y: 400 }, seen);
    expect(swipeToCuts(s(), { x: 600, y: 410 }, { x: 200, y: 420 }, seen)).toEqual([]);
  });

  it('never cuts within reach of a node, so a stroke from a node spares its edges', () => {
    expect(swipeToCuts(s(), { x: 400, y: 110 }, { x: 600, y: 110 }, new Set())).toEqual([]);
  });

  it('ignores a stroke that runs exactly along an edge', () => {
    expect(swipeToCuts(s(), { x: 600, y: 900 }, { x: 900, y: 900 }, new Set())).toEqual([]);
  });

  it('does not double-cut when passing through a node centre', () => {
    const cuts = swipeToCuts(s(), { x: 300, y: 700 }, { x: 500, y: 700 }, new Set());
    expect(cuts).toEqual([]);
  });

  it('skips edges that are already severed', () => {
    const st = s();
    st.edges[0]!.severedUntil = 100;
    const cuts = swipeToCuts(st, { x: 200, y: 400 }, { x: 1000, y: 400 }, new Set());
    expect(cuts.map((c) => c.edge)).toEqual([1]);
  });
});

describe('tapToAction', () => {
  it('quarantines the agent under the finger', () => {
    const st = s();
    st.credits = 10;
    expect(tapToAction(st, { x: 420, y: 690 })).toEqual({ action: { type: 'quarantine', node: 1 } });
  });

  it('ignores taps on special nodes and empty space', () => {
    const st = s();
    st.credits = 10;
    expect(tapToAction(st, { x: 800, y: 700 })).toBeNull();
    expect(tapToAction(st, { x: 1200, y: 400 })).toBeNull();
  });

  it('reports a denied quarantine instead of sending an action the rules would reject', () => {
    const st = s();
    st.credits = 1;
    expect(tapToAction(st, { x: 400, y: 700 })).toEqual({ denied: 'credits', node: 1 });
    st.credits = 10;
    st.nodes[1]!.quarantinedUntil = 50;
    expect(tapToAction(st, { x: 400, y: 700 })).toEqual({ denied: 'quarantined', node: 1 });
  });
});

describe('Blade', () => {
  const ident = { toBoard: (x: number, y: number) => ({ x, y }) };

  it('treats a 9 px wobble as a tap', () => {
    const b = new Blade(ident);
    b.begin(400, 700);
    expect(b.move(409, 700)).toEqual([]);
    expect(b.end()).toEqual({ tap: { x: 400, y: 700 } });
  });

  it('treats a 12 px drag as a swipe and cuts along it', () => {
    const st = s();
    const b = new Blade(ident);
    b.begin(390, 400);
    expect(b.move(402, 400, st)).toEqual([{ type: 'cut', edge: 0, t: 500 }]);
    expect(b.end()).toEqual({ swipe: true });
  });

  it('keeps a short trail for drawing', () => {
    const b = new Blade(ident);
    b.begin(0, 0);
    for (let i = 1; i < 40; i++) b.move(i * 20, 0);
    expect(b.trail().length).toBeGreaterThan(2);
    expect(b.trail().length).toBeLessThanOrEqual(16);
  });
});
