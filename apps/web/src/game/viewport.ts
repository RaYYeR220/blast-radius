import { fitView, type Insets, type Rect, type View } from './view';

/** A screen area in CSS pixels. */
export interface Region {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Phone layout below this width. */
export const PHONE_MAX = 700;
export const isPhone = (W: number): boolean => W < PHONE_MAX;

/** Space kept clear for the HUD while playing. */
export function playInsets(phone: boolean): Insets {
  return phone ? { top: 92, right: 12, bottom: 84, left: 12 } : { top: 100, right: 32, bottom: 96, left: 32 };
}

/** Scales a board window about its centre, never below a minimum size. */
export function grow(rect: Rect, f: number, minW = 0, minH = 0): Rect {
  const w = Math.max(rect.w * f, minW);
  const h = Math.max(rect.h * f, minH);
  return { x: rect.x + rect.w / 2 - w / 2, y: rect.y + rect.h / 2 - h / 2, w, h };
}

/** Fits a board window into a screen region (same shape as fitView, so toScreen/toBoard work on it). */
export function regionView(region: Region, rect: Rect, rotate: boolean, cssW: number, cssH: number, dpr: number): View {
  const bw = rotate ? rect.h : rect.w;
  const bh = rotate ? rect.w : rect.h;
  const scale = Math.min(region.w / bw, region.h / bh);
  return { cssW, cssH, dpr, rotate, scale, ox: region.x + (region.w - bw * scale) / 2, oy: region.y + (region.h - bh * scale) / 2, rect };
}

/** Whichever orientation shows the board larger (turned only when clearly better). */
export function bestFit(region: Region, rect: Rect, cssW: number, cssH: number, dpr: number): View {
  const a = regionView(region, rect, false, cssW, cssH, dpr);
  const b = regionView(region, rect, true, cssW, cssH, dpr);
  return b.scale > a.scale * 1.05 ? b : a;
}

/** The board beside the incident report: left of the panel on desktop, above the sheet on phone. */
export function reportRegion(W: number, H: number): Region {
  return isPhone(W) ? { x: 10, y: 10, w: W - 20, h: H * 0.4 - 18 } : { x: 28, y: 36, w: W - Math.min(560, W * 0.44) - 56, h: H - 100 };
}

/** The attract board behind the title: between the top bar and the type on phone, the whole screen on desktop. */
export function titleRegion(W: number, H: number, typeTop: number): Region {
  if (!isPhone(W)) return { x: 30, y: 40, w: W - 60, h: H - 80 };
  return { x: 12, y: 74, w: W - 24, h: Math.max(160, (typeTop || H - 400) - 74 - 22) };
}

/** The live board while playing. */
export function playView(W: number, H: number, dpr: number, rect: Rect): View {
  return fitView(W, H, dpr, playInsets(isPhone(W)), rect);
}
