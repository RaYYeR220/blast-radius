/** Soft radial halos, baked once into small canvases and stamped with drawImage. */
export interface Halos {
  thr: HTMLCanvasElement;
  gold: HTMLCanvasElement;
}

function halo(rgb: string, a0: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  if (!g) return c;
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, `rgba(${rgb},${a0})`);
  gr.addColorStop(0.32, `rgba(${rgb},${a0 * 0.42})`);
  gr.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  return c;
}

let cache: Halos | null = null;

export function halos(): Halos {
  cache ??= { thr: halo('226,98,27', 0.75), gold: halo('217,162,27', 0.8) };
  return cache;
}
