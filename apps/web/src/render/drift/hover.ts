import { type GameState, quarantineCost } from '@blast/sim';
import { TAP_RADIUS } from '../../game/input';
import { toBoard, type View } from '../../game/view';
import type { Frame } from './frame';
import { TAU } from './math';
import { nodeR } from './nodes';
import { C, MONO } from './palette';

/** Desktop affordance: which agent a click would quarantine, and what it costs. */
export function drawHover(f: Frame, s: GameState, view: View, hover: { x: number; y: number }): void {
  const b = toBoard(view, hover.x, hover.y);
  let best = -1;
  let bd = TAP_RADIUS * TAP_RADIUS;
  for (const n of s.nodes) {
    if (!n.active || n.kind !== 'agent') continue;
    const d = (n.x - b.x) ** 2 + (n.y - b.y) ** 2;
    if (d < bd) {
      bd = d;
      best = n.id;
    }
  }
  const n = s.nodes[best];
  if (!n || n.quarantinedUntil > s.tick) return;
  const { ctx, af } = f;
  const x = af.x(n.x, n.y);
  const y = af.y(n.x, n.y);
  const r = nodeR(n, f.kk) * 1.6 + 10;
  const cost = quarantineCost(s);
  const ok = s.credits >= cost;
  ctx.setLineDash([3, 4]);
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = ok ? C.ink : C.ink3;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.font = `400 11.5px ${MONO}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.lineWidth = 3.5;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = C.ground;
  const label = ok ? `click · quarantine ${cost}` : `quarantine ${cost} · have ${s.credits}`;
  ctx.strokeText(label, x, y - r - 6);
  ctx.fillStyle = ok ? C.ink : C.ink2;
  ctx.fillText(label, x, y - r - 6);
  ctx.textAlign = 'left';
}
