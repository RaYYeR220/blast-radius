import type { GameState } from '@blast/sim';
import type { Frame } from './frame';
import { clamp } from './math';
import { nodeR } from './nodes';
import { C, MONO } from './palette';
import type { Scene } from './scene';

type Circle = [number, number, number];

/** Picks the side of a node where a label of w×h overlaps the fewest other nodes and stays on screen. */
export function placeLabel(f: Pick<Frame, 'W' | 'H'>, w: number, h: number, x: number, y: number, r: number, avoid: readonly Circle[], pad = 6): [number, number] {
  const c: Array<[number, number]> = [
    [r + pad, -h / 2], [-r - pad - w, -h / 2], [-w / 2, r + pad], [-w / 2, -r - pad - h],
    [r * 0.7 + pad, r * 0.7], [-r * 0.7 - pad - w, r * 0.7], [r * 0.7 + pad, -r * 0.7 - h], [-r * 0.7 - pad - w, -r * 0.7 - h],
  ];
  let best = c[0]!;
  let bc = 1e9;
  c.forEach(([dx, dy], i) => {
    const L = x + dx;
    const T = y + dy;
    let cost = i * 0.01;
    if (L < 6 || L + w > f.W - 6 || T < 6 || T + h > f.H - 6) cost += 6;
    for (const [ax, ay, ar] of avoid) {
      const nx = clamp(ax, L, L + w);
      const ny = clamp(ay, T, T + h);
      const d = Math.hypot(ax - nx, ay - ny);
      if (d < ar) cost += (ar - d) / ar + 0.5;
    }
    if (cost < bc) {
      bc = cost;
      best = [dx, dy];
    }
  });
  return [x + best[0], y + best[1]];
}

/** Names the four fixed nodes in small mono type, upright whatever the board's rotation. */
export function drawLabels(f: Frame, scene: Scene, s: GameState, dim: number): void {
  const { ctx, af, kk } = f;
  const fs = Math.round(clamp(11 * kk, 10.5, 12.5));
  ctx.font = `400 ${fs}px ${MONO}`;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  const avoid: Circle[] = s.nodes.filter((n) => n.active).map((n) => [af.x(n.x, n.y), af.y(n.x, n.y), nodeR(n, kk) * 1.9 + 6]);
  const o = s.nodes[s.out];
  if (o) avoid.push([af.x(o.x, o.y), af.y(o.x, o.y) - nodeR(o, kk) * 2.4, nodeR(o, kk) * 1.6]);
  for (const id of [s.user, s.web, s.vault, s.out]) {
    const n = s.nodes[id];
    if (!n || !n.active || scene.nodeBorn.has(n.id)) continue;
    const x = af.x(n.x, n.y);
    const y = af.y(n.x, n.y);
    const label = n.kind;
    const w = ctx.measureText(label).width;
    const others = avoid.filter((a) => a[0] !== x || a[1] !== y);
    const [lx, ly] = placeLabel(f, w, fs, x, y, nodeR(n, kk) * (n.kind === 'vault' ? 1.9 : 1.6) + 4, others, 6);
    ctx.globalAlpha = dim;
    ctx.lineWidth = 3.5;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = C.ground;
    ctx.strokeText(label, lx, ly);
    ctx.fillStyle = (n.kind === 'out' || n.kind === 'vault') && f.keyOut ? C.deep : C.ink2;
    ctx.fillText(label, lx, ly);
  }
  ctx.globalAlpha = 1;
}
