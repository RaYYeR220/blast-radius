import type { GameState } from '@blast/sim';
import type { TrailPoint } from '../render/drift/blade';
import { DriftRenderer, type Look } from '../render/drift/renderer';
import { Chrome, type Escalation } from '../ui/chrome';
import type { TypeArea } from '../ui/title';
import { Camera, targetWindow } from './camera';
import type { Point } from './input';
import type { Session } from './session';
import { FULL_BOARD, type Rect, type View } from './view';
import { bestFit, grow, isPhone, playView, regionView, reportRegion, titleRegion } from './viewport';

/** Everything that decides one frame's picture. */
export interface Shot {
  look: Look;
  /** Seconds since the last frame, capped. */
  dt: number;
  now: number;
  alpha: number;
  /** Raw threat for the ambience, 0..1. */
  threat: number;
  frozen: boolean;
  escalation: Omit<Escalation, 'thr' | 'reduced'>;
  /** Frame the board around the replay controls instead of the HUD. */
  replay: boolean;
  interactive: boolean;
  tutorial: boolean;
  hover: Point | null;
  trail: TrailPoint[];
  overAt: number;
  /** Clear a space behind the title type. */
  clearing: boolean;
}

/** The canvas side of the game: which session is drawn, how the board is framed, and the page's warmth. */
export class Stage {
  readonly renderer: DriftRenderer;
  readonly camera = new Camera();
  private readonly chrome = new Chrome();
  /** The session on screen. Only its events reach the renderer. */
  drawn: Session | null = null;
  view: View;
  W = 1;
  H = 1;
  dpr = 1;
  typeArea: TypeArea | null = null;
  private reportRect: Rect | null = null;
  private reportT0 = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new DriftRenderer(canvas);
    this.view = playView(innerWidth, innerHeight, 1, FULL_BOARD);
  }

  get phone(): boolean {
    return isPhone(this.W);
  }

  resize(): void {
    this.dpr = Math.min(devicePixelRatio || 1, 2);
    this.W = innerWidth;
    this.H = innerHeight;
    this.renderer.resize(this.W, this.H, this.dpr);
  }

  /** Draws this session from now on; a switch resets the camera and the renderer's memory. */
  present(sess: Session, intro = false, force = false): void {
    if (sess === this.drawn && !force) return;
    this.drawn = sess;
    this.camera.reset();
    this.renderer.reset(sess, intro);
  }

  /** A report is opening: hold the board still beside it, and start the leak trace over. */
  frameReport(s: GameState): void {
    this.reportRect = grow(targetWindow(s), 1.04);
    this.reportT0 = performance.now();
  }

  draw(sess: Session, shot: Shot): void {
    const s = sess.state;
    const r = this.renderer;
    r.advance(shot.dt, shot.look, { threat: shot.threat, frozen: shot.frozen });
    this.chrome.update({ ...shot.escalation, thr: r.thr, reduced: r.feel.reduced });
    this.view = this.frameFor(s, shot.look, shot.replay);
    r.draw({
      sess,
      look: shot.look,
      view: this.view,
      alpha: shot.alpha,
      now: shot.now,
      interactive: shot.interactive,
      tutorial: shot.tutorial,
      hover: shot.hover,
      trail: shot.trail,
      overAt: shot.overAt,
      reportT0: this.reportT0,
      clearing: shot.clearing ? this.typeArea : null,
    });
  }

  private frameFor(s: GameState, look: Look, replay: boolean): View {
    const { W, H, dpr } = this;
    if (look === 'play') return playView(W, H, dpr, this.camera.update(s), replay);
    if (look === 'over') return regionView(reportRegion(W, H), this.reportRect ?? grow(targetWindow(s), 1.04), isPhone(W) && H > W, W, H, dpr);
    return bestFit(titleRegion(W, H, this.typeArea?.top ?? 0), grow(this.camera.update(s), 1.12, 900, 600), W, H, dpr);
  }
}
