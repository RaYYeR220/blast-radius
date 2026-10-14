import { BOARD_H, BOARD_W } from '@blast/sim';

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** A window onto the board, in board units. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Maps a window of the 1600×1000 board onto the screen. On portrait screens
 * the board is turned 90° clockwise so it fills the tall viewport; text is
 * drawn upright by converting to screen space first.
 */
export interface View {
  cssW: number;
  cssH: number;
  dpr: number;
  rotate: boolean;
  /** CSS pixels per board unit. */
  scale: number;
  ox: number;
  oy: number;
  rect: Rect;
}

const NO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
export const FULL_BOARD: Rect = { x: 0, y: 0, w: BOARD_W, h: BOARD_H };

export function fitView(cssW: number, cssH: number, dpr: number, insets: Insets = NO_INSETS, rect: Rect = FULL_BOARD): View {
  const rotate = cssH > cssW;
  const availW = Math.max(1, cssW - insets.left - insets.right);
  const availH = Math.max(1, cssH - insets.top - insets.bottom);
  const w = rotate ? rect.h : rect.w;
  const h = rotate ? rect.w : rect.h;
  const scale = Math.min(availW / w, availH / h);
  return {
    cssW,
    cssH,
    dpr,
    rotate,
    scale,
    ox: insets.left + (availW - w * scale) / 2,
    oy: insets.top + (availH - h * scale) / 2,
    rect,
  };
}

export function toScreen(v: View, bx: number, by: number): { x: number; y: number } {
  const r = v.rect;
  if (!v.rotate) return { x: v.ox + (bx - r.x) * v.scale, y: v.oy + (by - r.y) * v.scale };
  return { x: v.ox + (r.y + r.h - by) * v.scale, y: v.oy + (bx - r.x) * v.scale };
}

export function toBoard(v: View, sx: number, sy: number): { x: number; y: number } {
  const r = v.rect;
  if (!v.rotate) return { x: r.x + (sx - v.ox) / v.scale, y: r.y + (sy - v.oy) / v.scale };
  return { x: r.x + (sy - v.oy) / v.scale, y: r.y + r.h - (sx - v.ox) / v.scale };
}

/** Canvas transform (device pixels) that lets the renderer draw in board units. */
export function boardTransform(v: View): [number, number, number, number, number, number] {
  const s = v.scale * v.dpr;
  const r = v.rect;
  if (!v.rotate) return [s, 0, 0, s, (v.ox - r.x * v.scale) * v.dpr, (v.oy - r.y * v.scale) * v.dpr];
  return [0, s, -s, 0, (v.ox + (r.y + r.h) * v.scale) * v.dpr, (v.oy - r.x * v.scale) * v.dpr];
}
