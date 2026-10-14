import { BOARD_H, BOARD_W } from '@blast/sim';

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * Maps the 1600×1000 board onto the screen. On portrait screens the board is
 * turned 90° clockwise so it fills the tall viewport; text is drawn upright
 * by converting to screen space first.
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
}

const NO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

export function fitView(cssW: number, cssH: number, dpr: number, insets: Insets = NO_INSETS): View {
  const rotate = cssH > cssW;
  const availW = Math.max(1, cssW - insets.left - insets.right);
  const availH = Math.max(1, cssH - insets.top - insets.bottom);
  const boardW = rotate ? BOARD_H : BOARD_W;
  const boardH = rotate ? BOARD_W : BOARD_H;
  const scale = Math.min(availW / boardW, availH / boardH);
  return {
    cssW,
    cssH,
    dpr,
    rotate,
    scale,
    ox: insets.left + (availW - boardW * scale) / 2,
    oy: insets.top + (availH - boardH * scale) / 2,
  };
}

export function toScreen(v: View, bx: number, by: number): { x: number; y: number } {
  if (!v.rotate) return { x: v.ox + bx * v.scale, y: v.oy + by * v.scale };
  return { x: v.ox + (BOARD_H - by) * v.scale, y: v.oy + bx * v.scale };
}

export function toBoard(v: View, sx: number, sy: number): { x: number; y: number } {
  if (!v.rotate) return { x: (sx - v.ox) / v.scale, y: (sy - v.oy) / v.scale };
  return { x: (sy - v.oy) / v.scale, y: BOARD_H - (sx - v.ox) / v.scale };
}

/** Canvas transform (device pixels) that lets the renderer draw in board units. */
export function boardTransform(v: View): [number, number, number, number, number, number] {
  const s = v.scale * v.dpr;
  if (!v.rotate) return [s, 0, 0, s, v.ox * v.dpr, v.oy * v.dpr];
  return [0, s, -s, 0, (v.ox + BOARD_H * v.scale) * v.dpr, v.oy * v.dpr];
}
