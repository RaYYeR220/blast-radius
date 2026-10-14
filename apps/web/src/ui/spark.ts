import type { Sample } from '../game/session';
import { C } from '../render/drift/palette';

export interface SparkPaths {
  /** Infected agents, as a filled area along the bottom. */
  inf: string;
  cap: string;
  backlog: string;
}

const EMPTY: readonly Sample[] = [
  { tick: 0, backlog: 0, capacity: 21, infected: 0 },
  { tick: 60, backlog: 0, capacity: 21, infected: 0 },
];

/**
 * Scales a run's once-a-second samples into a w×h chart: backlog and capacity
 * share an axis with 10% headroom; infections fill the lower half on their own axis.
 */
export function sparkPaths(samples: readonly Sample[], w = 480, h = 84): SparkPaths {
  const tl = samples.length < 2 ? EMPTY : samples;
  const n = tl.length;
  const maxB = Math.max(...tl.map((d) => Math.max(d.backlog, d.capacity))) * 1.1 || 1;
  const maxI = Math.max(2, ...tl.map((d) => d.infected));
  const X = (i: number) => ((i / (n - 1)) * w).toFixed(1);
  const YB = (v: number) => (h - 3 - (v / maxB) * (h - 10)).toFixed(1);
  const YI = (v: number) => (h - (v / maxI) * h * 0.46).toFixed(1);
  let inf = `M0,${h}`;
  tl.forEach((d, i) => {
    inf += ` L${X(i)},${YI(d.infected)}`;
  });
  inf += ` L${w},${h} Z`;
  const line = (pick: (d: Sample) => number) => tl.map((d, i) => `${i ? 'L' : 'M'}${X(i)},${YB(pick(d))}`).join(' ');
  return { inf, cap: line((d) => d.capacity), backlog: line((d) => d.backlog) };
}

/** The report's chart as SVG children for a 480×84 viewBox. */
export function sparkSvg(samples: readonly Sample[]): string {
  const w = 480;
  const h = 84;
  const p = sparkPaths(samples, w, h);
  return (
    `<path d="${p.inf}" fill="${C.thr}" fill-opacity=".22" stroke="${C.thr}" stroke-width="1.2" vector-effect="non-scaling-stroke"/>` +
    `<path d="${p.cap}" fill="none" stroke="${C.ink2}" stroke-width="1.2" stroke-dasharray="3 3" vector-effect="non-scaling-stroke"/>` +
    `<path d="${p.backlog}" fill="none" stroke="${C.ink}" stroke-width="1.8" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>` +
    `<line x1="0" y1="${h}" x2="${w}" y2="${h}" stroke="${C.ink}" stroke-opacity=".15" vector-effect="non-scaling-stroke"/>`
  );
}
