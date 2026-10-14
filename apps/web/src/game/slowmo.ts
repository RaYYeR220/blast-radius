const FULL_MS = 4000;
const RECHARGE_MS = 12_000;
/** After running dry, the meter must refill this far before it works again. */
const RESTART_AT = 0.25;
export const SLOW_SCALE = 0.25;

/**
 * Human in the Loop: holding Space (or two fingers) slows time while a
 * four-second meter lasts. This is presentation only: the simulation runs the
 * same ticks either way, so replays stay exact.
 */
export class SlowMo {
  meter = 1;
  private held = false;
  private exhausted = false;

  /** Ran dry and is refilling before it works again. */
  get dry(): boolean {
    return this.exhausted;
  }

  hold(on: boolean): void {
    this.held = on;
  }

  /** Advances the meter by `dtMs` of real time and returns the time scale to use. */
  update(dtMs: number, owned: boolean): number {
    const active = owned && this.held && !this.exhausted && this.meter > 0;
    if (active) {
      this.meter = Math.max(0, this.meter - dtMs / FULL_MS);
      if (this.meter === 0) this.exhausted = true;
      return this.meter > 0 ? SLOW_SCALE : 1;
    }
    this.meter = Math.min(1, this.meter + dtMs / RECHARGE_MS);
    if (this.exhausted && this.meter >= RESTART_AT) this.exhausted = false;
    return 1;
  }
}
