import { createEmptyState } from '../src/step';
import type { GameState, NodeKind } from '../src/types';

/** Builds a state from explicit nodes and edges, skipping the board generator. */
export function testState(
  nodes: Array<[number, number, NodeKind]>,
  edges: Array<[number, number]>,
): GameState {
  const s = createEmptyState({ seed: 't', mode: 'endless' });
  nodes.forEach(([x, y, kind], id) =>
    s.nodes.push({
      id, kind, x, y, active: true, activatedAt: 0, quarantinedUntil: 0, infection: 0,
      incubateUntil: 0, incubVariant: null, infectedAt: 0, nextEmitAt: 0, degree: 0,
      payload: -1, incubPayload: -1,
    }),
  );
  edges.forEach(([a, b], id) => {
    const [lo, hi] = a < b ? [a, b] : [b, a];
    const A = s.nodes[lo]!;
    const B = s.nodes[hi]!;
    s.edges.push({
      id, a: lo, b: hi, len: Math.sqrt((A.x - B.x) ** 2 + (A.y - B.y) ** 2),
      peer: false, removed: false, severedUntil: 0, gapT: -1,
    });
    A.degree++;
    B.degree++;
  });
  const find = (k: NodeKind) => nodes.findIndex((n) => n[2] === k);
  s.user = find('user');
  s.web = find('web');
  s.vault = find('vault');
  s.out = find('out');
  s.adjDirty = true;
  return s;
}
