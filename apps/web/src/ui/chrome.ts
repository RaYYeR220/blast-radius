import { clamp } from '../render/drift/math';
import { q } from './dom';

export interface Escalation {
  /** Where the warmth comes from: the run on screen, the attract board behind the title, or nothing. */
  source: 'run' | 'title' | 'none';
  /** The run is in live play: the edges may pulse. */
  live: boolean;
  thr: number;
  stalling: boolean;
  reduced: boolean;
}

/** The page itself reacts to danger: the paper warms and the edges pulse as threat rises. */
export class Chrome {
  private readonly warm = q(document, '#warm');
  private readonly alarm = q(document, '#alarm');
  private lastWarm = -1;
  private lastAlarm = '';

  update(o: Escalation): void {
    const w = o.source === 'run' ? clamp(o.thr * 1.15, 0, 1) : o.source === 'title' ? o.thr * 0.4 : 0;
    if (Math.abs(w - this.lastWarm) > 0.01) {
      this.lastWarm = w;
      this.warm.style.opacity = w.toFixed(3);
    }
    const cls = o.live && !o.reduced ? (o.stalling || o.thr > 0.78 ? 'on fast' : o.thr > 0.55 ? 'on' : '') : '';
    if (cls !== this.lastAlarm) {
      this.lastAlarm = cls;
      this.alarm.className = `alarm ${cls}`;
    }
  }
}
