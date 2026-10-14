import type { SimEvent } from '@blast/sim';
import type { Session } from '../../game/session';
import type { View } from '../../game/view';
import { Affine } from './affine';
import { drawDust } from './ambient';
import { Batch } from './batch';
import { drawBlade, type TrailPoint } from './blade';
import { feelEvent } from './events';
import { Feel } from './feel';
import type { Frame } from './frame';
import { drawFx } from './fx';
import { drawHover } from './hover';
import { drawLabels } from './labels';
import { drawLeakPath } from './leak';
import { clamp, TAU } from './math';
import { drawNodeHalos, drawNodeMarks, drawNodes } from './nodes';
import { drawPackets, recordHist } from './packets';
import { type Dust, seedDust } from './pools';
import { Scene } from './scene';
import { drawStreams } from './streams';
import { drawTutorial } from './tutorial';

/** How the board is being shown: live or replayed play, the incident report, the title, or dimmed behind a page. */
export type Look = 'title' | 'play' | 'over' | 'backdrop';

/** The soft clearing painted behind the title type. */
export interface Clearing {
  x: number;
  y: number;
  r: number;
}

export interface DrawInput {
  sess: Session;
  look: Look;
  view: View;
  alpha: number;
  now: number;
  /** Hover ring, tutorial ghost and blade trail are drawn (live play, not paused). */
  interactive: boolean;
  tutorial: boolean;
  hover: { x: number; y: number } | null;
  trail: TrailPoint[];
  /** When the run ended, and when the report opened (performance.now ms): they pace the leak path. */
  overAt: number;
  reportT0: number;
  clearing: Clearing | null;
}

export interface Ambience {
  /** Raw threat this frame, 0..1, before smoothing. */
  threat: number;
  /** A stall ending freezes the streams. */
  frozen: boolean;
}

/**
 * The Particle Drift look: links as drifting particle streams, agents as
 * particle clusters, the threat in a single orange on warm paper.
 */
export class DriftRenderer {
  readonly scene = new Scene();
  readonly feel = new Feel();
  readonly af = new Affine();
  private readonly ctx: CanvasRenderingContext2D;
  private readonly batch = new Batch();
  private dust: Dust[] = [];
  private W = 1;
  private H = 1;
  private dpr = 1;
  /** Smoothed threat. */
  thr = 0;
  private flow = 0;
  private drift = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not available');
    this.ctx = ctx;
  }

  resize(W: number, H: number, dpr: number): void {
    this.W = W;
    this.H = H;
    this.dpr = dpr;
    this.canvas.width = Math.round(W * dpr);
    this.canvas.height = Math.round(H * dpr);
    this.dust = seedDust(W, H);
  }

  /** A new session: forget the old one's particles and effects; optionally grow the mesh in. */
  reset(sess: Session, intro: boolean): void {
    this.scene.reset();
    this.feel.reset();
    if (intro) this.scene.introGrow(sess.state, performance.now());
  }

  calm(): void {
    this.thr = 0;
    this.feel.reset();
  }

  onEvent(sess: Session, e: SimEvent, live: boolean): void {
    feelEvent(this.scene, this.feel, sess, e, live, performance.now());
  }

  /** Call once per simulation tick: injections remember where they have been. */
  onTick(sess: Session): void {
    recordHist(this.scene, sess.state);
  }

  /** Eases threat, stream flow and dust drift by dt seconds. */
  advance(dt: number, look: Look, amb: Ambience): void {
    const rm = this.feel.reduced ? 0.35 : 1;
    this.thr += (amb.threat - this.thr) * (1 - Math.exp(-dt * 2.2));
    const thr = this.thr;
    this.flow += dt * 0.035 * (look === 'play' ? 1.5 : 1) * (1 + 3.4 * thr) * rm * (amb.frozen ? 0 : 1) * (look === 'over' ? 0.4 : 1);
    this.drift += dt * (1 + 2.6 * thr) * rm;
    this.feel.shakeAmp *= Math.exp(-dt * 9);
  }

  /** Draws one frame; skipped during a hit-stop so the moment of an intercept holds. */
  draw(d: DrawInput): void {
    const feel = this.feel;
    if (d.now < feel.freezeUntil) return;
    this.af.set(d.view);
    this.paint(d);
    if (feel.pendingFreeze) {
      feel.pendingFreeze = false;
      feel.freezeUntil = d.now + 60;
    }
  }

  private frame(d: DrawInput): Frame {
    const s = d.sess.state;
    return {
      ctx: this.ctx,
      af: this.af,
      W: this.W,
      H: this.H,
      kk: clamp(this.af.s / 0.62, 0.58, 1.38),
      thr: this.thr,
      t: d.now / 1000,
      now: d.now,
      flow: this.flow,
      calm: d.look !== 'play',
      keyOut: s.packets.some((p) => !p.dead && p.secret),
    };
  }

  private paint(d: DrawInput): void {
    const { ctx, feel } = this;
    const sess = d.sess;
    const s = sess.state;
    const f = this.frame(d);
    const dim = d.look === 'backdrop' ? 0.55 : d.look === 'title' ? 0.92 : 1;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.W, this.H);
    drawDust(f, this.dust, this.drift, d.look === 'title' || d.look === 'backdrop' ? 1 : 0.85);
    ctx.save();
    if (feel.shakeAmp > 0.3) ctx.translate((Math.random() - 0.5) * 2 * feel.shakeAmp, (Math.random() - 0.5) * 2 * feel.shakeAmp);
    if (d.look === 'title' && !feel.reduced) ctx.translate(Math.sin((f.t * TAU) / 28) * 10, Math.cos((f.t * TAU) / 34) * 6);
    drawNodeHalos(f, s);
    this.batch.reset();
    drawStreams(f, this.batch, this.scene, s);
    drawNodes(f, this.batch, this.scene, s);
    this.batch.flush(ctx, dim);
    drawNodeMarks(f, this.scene, s);
    if (d.look === 'play' || d.look === 'over') drawLabels(f, this.scene, s, dim);
    drawPackets(f, this.scene, sess, d.alpha, dim, d.look === 'over');
    drawFx(f, this.scene.fx, s);
    if (s.phase === 'over' && s.end === 'leak' && (d.look === 'play' || d.look === 'over')) this.leakPath(f, d);
    ctx.restore();
    if (d.interactive) {
      if (d.hover && s.phase === 'play') drawHover(f, s, d.view, d.hover);
      if (d.tutorial) drawTutorial(f, this.scene, s);
      drawBlade(f, d.trail);
    }
    if (d.clearing) this.clearing(d.clearing);
    if (d.look === 'play' && s.phase === 'over' && s.end === 'stall') {
      ctx.fillStyle = 'rgba(241,240,238,.35)';
      ctx.fillRect(0, 0, this.W, this.H);
    }
    this.flash(d.now);
  }

  private leakPath(f: Frame, d: DrawInput): void {
    const s = d.sess.state;
    const segs = (s.leakPath ?? []).length - 1;
    if (d.look === 'play') {
      drawLeakPath(f, s, clamp((d.now - d.overAt) / 1300, 0, 1) * segs);
      return;
    }
    const per = 420;
    const cyc = segs * per + 2600;
    const el = (d.now - d.reportT0) % cyc;
    drawLeakPath(f, s, this.feel.reduced ? segs : clamp(el / per, 0, segs));
  }

  private clearing(c: Clearing): void {
    const ctx = this.ctx;
    const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, c.r);
    g.addColorStop(0, 'rgba(241,240,238,.88)');
    g.addColorStop(0.55, 'rgba(241,240,238,.6)');
    g.addColorStop(1, 'rgba(241,240,238,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.W, this.H);
  }

  private flash(now: number): void {
    const feel = this.feel;
    if (feel.flashW <= 0) return;
    const a = feel.flashW * (1 - clamp((now - feel.flashT) / 220, 0, 1));
    if (a <= 0) {
      feel.flashW = 0;
      return;
    }
    this.ctx.fillStyle = `rgba(255,255,255,${a})`;
    this.ctx.fillRect(0, 0, this.W, this.H);
  }
}
