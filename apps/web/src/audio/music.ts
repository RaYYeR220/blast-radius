const BPM = 112;
const STEP = 60 / BPM / 4; // sixteenth notes
const LOOKAHEAD = 0.12;
const SCALE = [0, 3, 5, 7, 10, 12, 15]; // A minor pentatonic-ish
const ROOT = 110; // A2

const hz = (n: number) => ROOT * 2 ** (n / 12);

/**
 * Four generative layers whose levels follow the threat: a drone that is
 * always there, then a pulse, an arpeggio and hats as the board heats up.
 */
export class Music {
  private readonly bus: GainNode;
  private readonly drone: GainNode;
  private readonly droneFilter: BiquadFilterNode;
  private readonly pulse: GainNode;
  private readonly arp: GainNode;
  private readonly hats: GainNode;
  private readonly noise: AudioBuffer;
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextAt = 0;
  private step = 0;
  private note = 0;
  private droneOscs: OscillatorNode[] = [];

  constructor(private readonly ctx: AudioContext, out: AudioNode) {
    this.bus = ctx.createGain();
    this.bus.gain.value = 0.55;
    this.bus.connect(out);
    const layer = (g0: number) => {
      const g = ctx.createGain();
      g.gain.value = g0;
      g.connect(this.bus);
      return g;
    };
    this.droneFilter = ctx.createBiquadFilter();
    this.droneFilter.type = 'lowpass';
    this.droneFilter.frequency.value = 380;
    this.drone = layer(0.1);
    this.droneFilter.connect(this.drone);
    this.pulse = layer(0);
    this.arp = layer(0);
    this.hats = layer(0);
    this.noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.2), ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  setEnabled(on: boolean): void {
    this.bus.gain.setTargetAtTime(on ? 0.55 : 0, this.ctx.currentTime, 0.2);
  }

  setThreat(x: number): void {
    const t = this.ctx.currentTime;
    const ramp = (g: GainNode, v: number) => g.gain.setTargetAtTime(v, t, 0.6);
    ramp(this.drone, 0.08 + 0.06 * x);
    ramp(this.pulse, x > 0.2 ? 0.18 * Math.min(1, (x - 0.2) / 0.3) : 0);
    ramp(this.arp, x > 0.4 ? 0.07 * Math.min(1, (x - 0.4) / 0.3) : 0);
    ramp(this.hats, x > 0.6 ? 0.05 * Math.min(1, (x - 0.6) / 0.3) : 0);
    this.droneFilter.frequency.setTargetAtTime(380 + 1400 * x, t, 0.8);
  }

  start(): void {
    if (this.timer) return;
    for (const n of [0, 7]) {
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = hz(n - 12);
      o.detune.value = n ? 6 : -6;
      o.connect(this.droneFilter);
      o.start();
      this.droneOscs.push(o);
    }
    this.nextAt = this.ctx.currentTime + 0.05;
    this.timer = setInterval(() => this.schedule(), 25);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const o of this.droneOscs) o.stop();
    this.droneOscs = [];
  }

  private schedule(): void {
    while (this.nextAt < this.ctx.currentTime + LOOKAHEAD) {
      this.play(this.step, this.nextAt);
      this.nextAt += STEP;
      this.step = (this.step + 1) % 16;
    }
  }

  private play(step: number, at: number): void {
    const ctx = this.ctx;
    if (step % 4 === 0) {
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.9, at);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.22);
      g.connect(this.pulse);
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(95, at);
      o.frequency.exponentialRampToValueAtTime(42, at + 0.2);
      o.connect(g);
      o.start(at);
      o.stop(at + 0.25);
    }
    if (step % 2 === 0) {
      this.note = Math.max(0, Math.min(SCALE.length - 1, this.note + (Math.random() < 0.5 ? -1 : 1)));
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.7, at);
      g.gain.exponentialRampToValueAtTime(0.0001, at + STEP * 1.8);
      g.connect(this.arp);
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = hz(SCALE[this.note]! + 24);
      o.connect(g);
      o.start(at);
      o.stop(at + STEP * 2);
    }
    if (step % 4 === 2) {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      const f = ctx.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = 7000;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.8, at);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);
      src.connect(f);
      f.connect(g);
      g.connect(this.hats);
      src.start(at);
      src.stop(at + 0.06);
    }
  }
}
