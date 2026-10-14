/** Warm paper, ink, and one colour for the threat. Mirrors the CSS tokens in styles/tokens.css. */
export const C = {
  ground: '#f1f0ee',
  card: '#ecebe8',
  ink: '#0e0d0c',
  ink2: '#565553',
  ink3: '#8b8a87',
  thr: '#e2621b',
  deep: '#8c2f06',
  gold: '#d9a21b',
  goldDeep: '#6f4a05',
} as const;

/** Alpha steps for ink dots, faint to dense. */
export const INK_A = [0.2, 0.38, 0.6, 0.88] as const;
/** Alpha steps for threat dots. */
export const THR_A = [0.3, 0.62, 1] as const;

export const DISPLAY = 'Outfit, Figtree, system-ui, sans-serif';
export const MONO = "'Fragment Mono', ui-monospace, Menlo, monospace";
