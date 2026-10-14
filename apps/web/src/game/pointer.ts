import type { Action, GameState } from '@blast/sim';
import type { TrailPoint } from '../render/drift/blade';
import { Blade, type Point, tapToAction, type TapResult } from './input';

export interface PointerHooks {
  wake(): void;
  /** Live play, not paused, not in the shop. */
  playable(): boolean;
  state(): GameState | null;
  act(actions: Action[]): void;
  denied(t: Extract<TapResult, { denied: string }>): void;
  toBoard(x: number, y: number): Point;
}

/**
 * Mouse and touch on the board: a press-and-drag is the blade, a tap
 * quarantines, two fingers down slow time (Human in the Loop).
 */
export class PointerInput {
  readonly pointers = new Set<number>();
  readonly trail: TrailPoint[] = [];
  hover: Point | null = null;
  private readonly blade: Blade;

  constructor(private readonly canvas: HTMLCanvasElement, private readonly hooks: PointerHooks) {
    this.blade = new Blade({ toBoard: (x, y) => hooks.toBoard(x, y) });
    canvas.addEventListener('pointerdown', (e) => this.down(e));
    canvas.addEventListener('pointermove', (e) => this.move(e));
    canvas.addEventListener('pointerup', (e) => this.end(e));
    canvas.addEventListener('pointercancel', (e) => this.end(e));
    canvas.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse') this.hover = null;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  get twoFingers(): boolean {
    return this.pointers.size >= 2;
  }

  /** Drops any stroke in progress (a new run, a pause). */
  reset(): void {
    this.blade.end();
    this.trail.length = 0;
  }

  private down(e: PointerEvent): void {
    this.hooks.wake();
    this.pointers.add(e.pointerId);
    if (!this.hooks.playable() || (e.pointerType === 'mouse' && e.button !== 0)) return;
    if (this.twoFingers) {
      this.reset();
      return;
    }
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      // capture is best-effort
    }
    this.blade.begin(e.clientX, e.clientY);
    this.trail.length = 0;
    this.trail.push({ x: e.clientX, y: e.clientY, t: performance.now() });
  }

  private move(e: PointerEvent): void {
    if (e.pointerType === 'mouse') this.hover = { x: e.clientX, y: e.clientY };
    if (!this.blade.active) return;
    const s = this.hooks.state();
    const coalesced = e.getCoalescedEvents?.() ?? [];
    for (const ev of coalesced.length ? coalesced : [e]) {
      this.trail.push({ x: ev.clientX, y: ev.clientY, t: performance.now() });
      const cuts = this.blade.move(ev.clientX, ev.clientY, s && s.phase === 'play' ? s : undefined);
      if (cuts.length && this.hooks.playable()) this.hooks.act(cuts);
    }
    if (this.trail.length > 40) this.trail.splice(0, this.trail.length - 40);
  }

  private end(e: PointerEvent): void {
    this.pointers.delete(e.pointerId);
    if (!this.blade.active) return;
    const r = this.blade.end();
    const s = this.hooks.state();
    if (!r || !('tap' in r) || !s || !this.hooks.playable()) return;
    const t = tapToAction(s, r.tap);
    if (t && 'action' in t) this.hooks.act([t.action]);
    else if (t) this.hooks.denied(t);
  }
}
