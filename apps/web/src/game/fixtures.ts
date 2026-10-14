import { createEmptyState, type GameState, type NodeKind } from '@blast/sim';

/** A hand-built board for client tests. */
export function boardOf(nodes: Array<[number, number, NodeKind]>, edges: Array<[number, number]>): GameState {
  const s = createEmptyState({ seed: 'fixture', mode: 'endless' });
  nodes.forEach(([x, y, kind], id) =>
    s.nodes.push({
      id, kind, x, y, active: true, activatedAt: 0, quarantinedUntil: 0, infection: 0, incubateUntil: 0,
      incubVariant: null, infectedAt: 0, nextEmitAt: 0, degree: 0, payload: -1, incubPayload: -1,
    }),
  );
  edges.forEach(([a, b], id) => {
    const [lo, hi] = a < b ? [a, b] : [b, a];
    const A = s.nodes[lo]!;
    const B = s.nodes[hi]!;
    s.edges.push({ id, a: lo, b: hi, len: Math.hypot(A.x - B.x, A.y - B.y), peer: false, removed: false, severedUntil: 0, gapT: -1 });
    A.degree++;
    B.degree++;
  });
  s.user = nodes.findIndex((n) => n[2] === 'user');
  s.web = nodes.findIndex((n) => n[2] === 'web');
  s.vault = nodes.findIndex((n) => n[2] === 'vault');
  s.out = nodes.findIndex((n) => n[2] === 'out');
  return s;
}
