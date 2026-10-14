/** Screen shake, white flash and hit-stop: the renderer's sense of impact. */
export class Feel {
  shakeAmp = 0;
  flashW = 0;
  flashT = 0;
  freezeUntil = 0;
  pendingFreeze = false;
  /** Player setting. */
  shake = true;
  /** Reduced motion (setting or system preference). */
  reduced = false;

  kick(a: number): void {
    if (!this.shake || this.reduced) return;
    this.shakeAmp = Math.max(this.shakeAmp, a);
  }

  flash(full: number, reduced: number, now: number): void {
    this.flashW = this.reduced ? reduced : full;
    this.flashT = now;
  }

  reset(): void {
    this.shakeAmp = 0;
    this.flashW = 0;
    this.freezeUntil = 0;
    this.pendingFreeze = false;
  }
}
