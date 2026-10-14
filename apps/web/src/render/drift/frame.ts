import type { Affine } from './affine';

/** What every drawing pass needs for one frame. Sizes are CSS pixels. */
export interface Frame {
  ctx: CanvasRenderingContext2D;
  af: Affine;
  W: number;
  H: number;
  /** Size factor: how big dots and glyphs are at this zoom. */
  kk: number;
  /** Smoothed threat, 0..1: everything gets denser, warmer and faster with it. */
  thr: number;
  /** Seconds, for oscillations. */
  t: number;
  /** Milliseconds (performance.now), for timed effects. */
  now: number;
  /** Accumulated stream phase. */
  flow: number;
  /** Away from live play: calmer streams, no ghost agents. */
  calm: boolean;
  /** A packet is carrying the vault key right now. */
  keyOut: boolean;
}
