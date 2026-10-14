const STEP_MS = 1000 / 60;
const MAX_TICKS_PER_FRAME = 5;

export interface LoopDeps {
  now(): number;
  raf(cb: (t: number) => void): number;
  caf(id: number): void;
  /** Subscribes to tab visibility; returns an unsubscribe function. */
  onVisibility(cb: (hidden: boolean) => void): () => void;
}

export interface LoopOptions {
  onTick(): void;
  onRender(alpha: number): void;
  onAutoPause?(): void;
  deps?: Partial<LoopDeps>;
}

const browserDeps = (): LoopDeps => ({
  now: () => performance.now(),
  raf: (cb) => requestAnimationFrame(cb),
  caf: (id) => cancelAnimationFrame(id),
  onVisibility: (cb) => {
    const h = () => cb(document.visibilityState === 'hidden');
    document.addEventListener('visibilitychange', h);
    return () => document.removeEventListener('visibilitychange', h);
  },
});

/**
 * Fixed 60 Hz simulation under a variable-rate render loop. A long stall
 * (background tab, debugger) runs at most five ticks and drops the rest, so
 * coming back never fast-forwards the player into a loss.
 */
export class GameLoop {
  private readonly deps: LoopDeps;
  private acc = 0;
  private last = -1;
  private rafId = 0;
  private running = false;
  private isPaused = false;
  private scale = 1;
  private unsubscribe: (() => void) | null = null;

  constructor(private readonly opts: LoopOptions) {
    this.deps = { ...browserDeps(), ...opts.deps };
  }

  get paused(): boolean {
    return this.isPaused;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = -1;
    this.unsubscribe = this.deps.onVisibility((hidden) => {
      if (hidden && !this.isPaused) {
        this.pause();
        this.opts.onAutoPause?.();
      }
    });
    const tick = (t: number) => {
      if (!this.running) return;
      this.frame(t);
      this.rafId = this.deps.raf(tick);
    };
    this.rafId = this.deps.raf(tick);
  }

  stop(): void {
    this.running = false;
    this.deps.caf(this.rafId);
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  pause(): void {
    this.isPaused = true;
  }

  resume(): void {
    this.isPaused = false;
    this.last = -1;
    this.acc = 0;
  }

  setTimeScale(x: number): void {
    this.scale = Math.max(0, x);
  }

  /** One animation frame. Public so tests (and replays) can drive it directly. */
  frame(t: number): void {
    if (this.last < 0 || this.isPaused) {
      this.last = t;
      this.opts.onRender(this.isPaused ? 0 : this.acc / STEP_MS);
      return;
    }
    this.acc += (t - this.last) * this.scale;
    this.last = t;
    let n = 0;
    while (this.acc >= STEP_MS && n < MAX_TICKS_PER_FRAME) {
      this.opts.onTick();
      this.acc -= STEP_MS;
      n++;
      if (this.isPaused) break;
    }
    if (this.acc >= STEP_MS) this.acc %= STEP_MS;
    this.opts.onRender(this.isPaused ? 0 : this.acc / STEP_MS);
  }
}
