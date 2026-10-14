export function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

function orient(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  const v = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  return v > 0 ? 1 : v < 0 ? -1 : 0;
}

/** For a point already known to be collinear with a–b: does it lie within the segment's box? */
function onSegment(ax: number, ay: number, bx: number, by: number, px: number, py: number): boolean {
  return (
    px >= Math.min(ax, bx) && px <= Math.max(ax, bx) && py >= Math.min(ay, by) && py <= Math.max(ay, by)
  );
}

/**
 * True when two segments meet anywhere other than a shared endpoint.
 * Two segments that share an endpoint still "cross" if they overlap along a line.
 */
export function segmentsCross(
  p1x: number, p1y: number, p2x: number, p2y: number,
  q1x: number, q1y: number, q2x: number, q2y: number,
): boolean {
  const shared =
    (p1x === q1x && p1y === q1y) || (p1x === q2x && p1y === q2y) ||
    (p2x === q1x && p2y === q1y) || (p2x === q2x && p2y === q2y);
  if (shared) {
    const pShared = (p1x === q1x && p1y === q1y) || (p1x === q2x && p1y === q2y);
    const sx = pShared ? p1x : p2x;
    const sy = pShared ? p1y : p2y;
    const ux = pShared ? p2x : p1x;
    const uy = pShared ? p2y : p1y;
    const qShared = q1x === sx && q1y === sy;
    const wx = qShared ? q2x : q1x;
    const wy = qShared ? q2y : q1y;
    if (orient(sx, sy, ux, uy, wx, wy) !== 0) return false;
    return (ux - sx) * (wx - sx) + (uy - sy) * (wy - sy) > 0;
  }
  const o1 = orient(p1x, p1y, p2x, p2y, q1x, q1y);
  const o2 = orient(p1x, p1y, p2x, p2y, q2x, q2y);
  const o3 = orient(q1x, q1y, q2x, q2y, p1x, p1y);
  const o4 = orient(q1x, q1y, q2x, q2y, p2x, p2y);
  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment(p1x, p1y, p2x, p2y, q1x, q1y)) return true;
  if (o2 === 0 && onSegment(p1x, p1y, p2x, p2y, q2x, q2y)) return true;
  if (o3 === 0 && onSegment(q1x, q1y, q2x, q2y, p1x, p1y)) return true;
  if (o4 === 0 && onSegment(q1x, q1y, q2x, q2y, p2x, p2y)) return true;
  return false;
}

/** Squared distance from point p to segment a–b. */
export function pointSegDist2(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const vx = bx - ax;
  const vy = by - ay;
  const len2 = vx * vx + vy * vy;
  if (len2 === 0) return dist2(px, py, ax, ay);
  let t = ((px - ax) * vx + (py - ay) * vy) / len2;
  t = Math.max(0, Math.min(1, t));
  return dist2(px, py, ax + t * vx, ay + t * vy);
}
