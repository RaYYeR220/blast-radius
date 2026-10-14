import type { Variant } from '@blast/sim';
import { TAU } from './math';
import { C } from './palette';

type Pt = readonly [number, number];

/** Glyph outlines in unit coordinates; +x is the direction of travel. */
export const SHAPE: Readonly<Record<'diamond' | 'jag' | 'hunter', readonly Pt[]>> = {
  diamond: [[1.2, 0], [0, 0.82], [-1.2, 0], [0, -0.82]],
  jag: [[1.28, 0], [0.62, 0.42], [0.46, 0.26], [0, 0.86], [-1.28, 0], [-0.62, -0.42], [-0.46, -0.26], [0, -0.86]],
  hunter: [[1.35, 0], [-0.95, 0.98], [-0.38, 0], [-0.95, -0.98]],
};

export function polyPath(c: CanvasRenderingContext2D, pts: readonly Pt[], x: number, y: number, r: number, a: number): void {
  const co = Math.cos(a);
  const si = Math.sin(a);
  c.beginPath();
  pts.forEach(([u, v], i) => {
    const px = x + (u * co - v * si) * r;
    const py = y + (u * si + v * co) * r;
    if (i) c.lineTo(px, py);
    else c.moveTo(px, py);
  });
  c.closePath();
}

function caltropPath(c: CanvasRenderingContext2D, x: number, y: number, r: number, a: number): void {
  c.beginPath();
  for (let i = 0; i < 3; i++) {
    const t0 = a + (i * TAU) / 3;
    const tm = t0 + TAU / 6;
    const t1 = t0 + TAU / 3;
    if (i === 0) c.moveTo(x + Math.cos(t0) * r * 1.38, y + Math.sin(t0) * r * 1.38);
    c.quadraticCurveTo(x + Math.cos(tm) * r * -0.12, y + Math.sin(tm) * r * -0.12, x + Math.cos(t1) * r * 1.38, y + Math.sin(t1) * r * 1.38);
  }
  c.closePath();
}

function streakPath(c: CanvasRenderingContext2D, x: number, y: number, r: number, a: number): void {
  const co = Math.cos(a);
  const si = Math.sin(a);
  const hw = r * 0.5;
  const hx = x + co * r * 1.1;
  const hy = y + si * r * 1.1;
  const tx = x - co * r * 1.8;
  const ty = y - si * r * 1.8;
  c.beginPath();
  c.arc(hx, hy, hw, a - Math.PI / 2, a + Math.PI / 2);
  c.lineTo(tx - si * hw * 0.3, ty + co * hw * 0.3);
  c.lineTo(tx + si * hw * 0.3, ty - co * hw * 0.3);
  c.closePath();
}

/** Traces an injection glyph and says whether to fill or stroke it. */
export function glyphPath(c: CanvasRenderingContext2D, variant: Variant | null, x: number, y: number, r: number, a: number): 'fill' | 'stroke' {
  switch (variant) {
    case 'plain':
      polyPath(c, r >= 7 ? SHAPE.jag : SHAPE.diamond, x, y, r, a);
      return 'fill';
    case 'stealth':
      polyPath(c, SHAPE.diamond, x, y, r, a);
      return 'fill';
    case 'fast':
      streakPath(c, x, y, r, a);
      return 'fill';
    case 'splitter':
      caltropPath(c, x, y, r, a + Math.PI / 6);
      return 'fill';
    case 'sleeper':
      polyPath(c, SHAPE.diamond, x, y, r * 1.05, a);
      return 'stroke';
    case 'hunter':
      polyPath(c, SHAPE.hunter, x, y, r, a);
      return 'fill';
    default:
      c.beginPath();
      c.arc(x, y, r, 0, TAU);
      return 'fill';
  }
}

/** Where the gold key sits on a glyph: trailing behind the fast and hunting shapes. */
export function secretAt(variant: Variant | null, x: number, y: number, r: number, a: number): Pt {
  if (variant === 'fast' || variant === 'hunter') return [x - Math.cos(a) * (r * 2.0 + 4), y - Math.sin(a) * (r * 2.0 + 4)];
  return [x, y];
}

export type GlyphKind = Variant | 'task' | 'secret';

const pts = (arr: readonly Pt[], r: number): string => arr.map(([u, v]) => `${(u * r).toFixed(2)},${(v * r).toFixed(2)}`).join(' ');

function splitterSvg(): string {
  let d = '';
  const r = 5.6;
  for (let i = 0; i < 3; i++) {
    const t0 = Math.PI / 6 + (i * TAU) / 3;
    const tm = t0 + TAU / 6;
    const t1 = t0 + TAU / 3;
    if (!i) d += `M${(Math.cos(t0) * r * 1.38).toFixed(2)},${(Math.sin(t0) * r * 1.38).toFixed(2)}`;
    d += ` Q${(Math.cos(tm) * r * -0.12).toFixed(2)},${(Math.sin(tm) * r * -0.12).toFixed(2)} ${(Math.cos(t1) * r * 1.38).toFixed(2)},${(Math.sin(t1) * r * 1.38).toFixed(2)}`;
  }
  return `<path d="${d}Z" fill="${C.thr}"/>`;
}

/** The same glyphs as inline SVG (viewBox -10 -10 20 20) for the DOM: toasts and the legend. */
export function svgGlyph(kind: GlyphKind): string {
  const T = C.thr;
  const I = C.ink;
  switch (kind) {
    case 'task':
      return `<circle r="4.6" fill="#fff" stroke="${I}" stroke-width="1.4"/>`;
    case 'plain':
      return `<polygon points="${pts(SHAPE.jag, 7)}" fill="${T}"/><polygon points="${pts(SHAPE.diamond, 2.8)}" fill="${C.deep}"/>`;
    case 'fast':
      return `<path d="M5.5,-3.2 A3.2,3.2 0 0 1 5.5,3.2 L-9,1 L-9,-1 Z" fill="${T}"/>`;
    case 'stealth':
      return `<circle r="5.2" fill="#fff" stroke="${I}" stroke-width="1.3" stroke-dasharray="2 1.6"/><polygon points="${pts(SHAPE.diamond, 3.4)}" fill="${T}"/>`;
    case 'splitter':
      return splitterSvg();
    case 'sleeper':
      return `<polygon points="${pts(SHAPE.diamond, 6.6)}" fill="none" stroke="${T}" stroke-width="2.2" stroke-linejoin="round"/>`;
    case 'hunter':
      return `<polygon points="${pts(SHAPE.hunter, 6.4)}" fill="${T}"/>`;
    case 'secret':
      return `<polygon points="${pts(SHAPE.jag, 7)}" fill="${T}"/><circle r="2.8" fill="${C.gold}" stroke="${C.goldDeep}" stroke-width=".8"/>`;
  }
}
