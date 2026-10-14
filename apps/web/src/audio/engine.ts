import type { SimEvent } from '@blast/sim';
import { Music } from './music';
import { Sfx } from './sfx';

const MASTER = 0.8;
const SHIP_PER_SECOND = 8;
const LADDER_WINDOW = 0.9;

/**
 * All sound is synthesised: no samples to download. Nothing plays until
 * `unlock()` runs inside a user gesture (the Play click).
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfx: Sfx | null = null;
  private music: Music | null = null;
  private muted = false;
  private musicOn = true;
  private threatLevel = 0;
  private shipTimes: number[] = [];
  private ladder = 0;
  private lastIntercept = -Infinity;

  constructor(private readonly create: () => AudioContext = () => new AudioContext()) {}

  get masterLevel(): number {
    return this.master?.gain.value ?? 0;
  }

  get threat(): number {
    return this.threatLevel;
  }

  unlock(): void {
    if (!this.ctx) {
      const ctx = this.create();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      const master = ctx.createGain();
      master.gain.value = this.muted ? 0 : MASTER;
      comp.connect(master);
      master.connect(ctx.destination);
      this.ctx = ctx;
      this.master = master;
      this.sfx = new Sfx(ctx, comp);
      this.music = new Music(ctx, comp);
      this.music.setEnabled(this.musicOn);
    }
    if (this.ctx.state !== 'running') void this.ctx.resume();
  }

  /** A hidden tab goes quiet: the context suspends, and the music's clock stops with it. */
  setHidden(hidden: boolean): void {
    if (!this.ctx) return;
    if (hidden) void this.ctx.suspend();
    else if (this.ctx.state !== 'running') void this.ctx.resume();
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : MASTER, this.ctx.currentTime, 0.02);
    if (this.master) this.master.gain.value = m ? 0 : MASTER;
  }

  setMusic(on: boolean): void {
    this.musicOn = on;
    this.music?.setEnabled(on);
  }

  startMusic(): void {
    this.music?.start();
  }

  stopMusic(): void {
    this.music?.stop();
  }

  setThreat(x: number): void {
    this.threatLevel = Math.max(0, Math.min(1, x));
    this.music?.setThreat(this.threatLevel);
  }

  onEvent(e: SimEvent): void {
    const ctx = this.ctx;
    const sfx = this.sfx;
    if (!ctx || !sfx) return;
    const now = ctx.currentTime;
    switch (e.e) {
      case 'ship': {
        this.shipTimes = this.shipTimes.filter((t) => now - t < 1);
        if (this.shipTimes.length >= SHIP_PER_SECOND) return;
        this.shipTimes.push(now);
        sfx.blip(this.shipTimes.length);
        return;
      }
      case 'intercept':
        this.ladder = now - this.lastIntercept < LADDER_WINDOW ? this.ladder + 1 : 0;
        this.lastIntercept = now;
        sfx.chime(this.ladder);
        return;
      case 'cut':
        if (e.t >= 0) sfx.whoosh();
        else sfx.breaker();
        return;
      case 'combo':
        sfx.sparkle(e.n);
        return;
      case 'incubate':
        sfx.tick();
        return;
      case 'infect':
        sfx.sting();
        return;
      case 'quarantine':
        sfx.thunk(e.auto);
        return;
      case 'secret':
        sfx.ping();
        return;
      case 'canary':
        sfx.chirp();
        return;
      case 'leak':
        sfx.siren();
        return;
      case 'stall':
        sfx.alarm();
        return;
      case 'shop':
        sfx.chord(true);
        return;
      case 'wave':
        sfx.chord(false);
        return;
      default:
    }
  }
}
