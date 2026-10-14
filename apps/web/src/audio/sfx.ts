/** Minor-pentatonic ladder in semitones above the base note. */
const LADDER = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22, 24, 27];
const BASE = 523.25; // C5

const semis = (f: number, n: number) => f * 2 ** (n / 12);

/** Short synthesised sound effects, each a few nodes that stop themselves. */
export class Sfx {
  private noiseBuf: AudioBuffer;

  constructor(private readonly ctx: AudioContext, private readonly out: AudioNode) {
    const len = Math.floor(ctx.sampleRate * 1.5);
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  private env(peak: number, attack: number, decay: number, at = this.ctx.currentTime): GainNode {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(peak, at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
    g.connect(this.out);
    return g;
  }

  private tone(type: OscillatorType, freq: number, gain: GainNode, at: number, dur: number, endFreq?: number): OscillatorNode {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.frequency.setValueAtTime(freq, at);
    if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, at + dur);
    o.connect(gain);
    o.start(at);
    o.stop(at + dur + 0.05);
    return o;
  }

  private noise(gain: AudioNode, at: number, dur: number, filter?: { type: BiquadFilterType; from: number; to: number; q?: number }): void {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    let node: AudioNode = src;
    if (filter) {
      const f = this.ctx.createBiquadFilter();
      f.type = filter.type;
      f.Q.value = filter.q ?? 1;
      f.frequency.setValueAtTime(filter.from, at);
      f.frequency.exponentialRampToValueAtTime(filter.to, at + dur);
      src.connect(f);
      node = f;
    }
    node.connect(gain);
    src.start(at);
    src.stop(at + dur + 0.05);
  }

  whoosh(): void {
    const t = this.ctx.currentTime;
    this.noise(this.env(0.32, 0.008, 0.16, t), t, 0.18, { type: 'bandpass', from: 3200, to: 500, q: 1.4 });
  }

  breaker(): void {
    const t = this.ctx.currentTime;
    this.tone('square', 180, this.env(0.12, 0.002, 0.12, t), t, 0.12, 90);
    this.noise(this.env(0.18, 0.002, 0.08, t), t, 0.1, { type: 'highpass', from: 2000, to: 2000 });
  }

  chime(step: number): void {
    const t = this.ctx.currentTime;
    const f = semis(BASE, LADDER[Math.min(step, LADDER.length - 1)]!);
    this.tone('sine', f, this.env(0.28, 0.004, 0.42, t), t, 0.45);
    this.tone('triangle', f * 2, this.env(0.07, 0.004, 0.25, t), t, 0.3);
    this.noise(this.env(0.08, 0.001, 0.05, t), t, 0.06, { type: 'highpass', from: 5000, to: 5000 });
  }

  sparkle(n: number): void {
    const t = this.ctx.currentTime;
    for (let i = 0; i < Math.min(n + 1, 5); i++) {
      const at = t + 0.05 + i * 0.045;
      this.tone('triangle', semis(BASE * 2, LADDER[i * 2]!), this.env(0.08, 0.003, 0.2, at), at, 0.22);
    }
  }

  blip(k: number): void {
    const t = this.ctx.currentTime;
    this.tone('sine', semis(880, LADDER[k % 5]!), this.env(0.035, 0.003, 0.05, t), t, 0.06);
  }

  tick(): void {
    const t = this.ctx.currentTime;
    this.tone('sine', 1400, this.env(0.07, 0.001, 0.03, t), t, 0.04);
  }

  sting(): void {
    const t = this.ctx.currentTime;
    const g = this.env(0.16, 0.01, 0.6, t);
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1400;
    f.connect(g);
    for (const hz of [220, 233.08]) {
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = hz;
      o.connect(f);
      o.start(t);
      o.stop(t + 0.7);
    }
  }

  thunk(auto: boolean): void {
    const t = this.ctx.currentTime;
    this.tone('sine', auto ? 140 : 110, this.env(0.4, 0.003, 0.22, t), t, 0.24, 38);
    this.noise(this.env(0.1, 0.001, 0.03, t), t, 0.04, { type: 'lowpass', from: 900, to: 300 });
  }

  ping(): void {
    const t = this.ctx.currentTime;
    for (const [hz, g] of [[1760, 0.12], [2637, 0.07], [3951, 0.04]] as const) {
      this.tone('sine', hz, this.env(g, 0.002, 0.7, t), t, 0.75);
    }
  }

  chirp(): void {
    const t = this.ctx.currentTime;
    for (let i = 0; i < 3; i++) this.tone('sine', 2400, this.env(0.08, 0.004, 0.06, t + i * 0.09), t + i * 0.09, 0.08, 3600);
  }

  siren(): void {
    const t = this.ctx.currentTime;
    const g = this.env(0.3, 0.02, 1.7, t);
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 2200;
    f.connect(g);
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = 880;
    o.frequency.setValueAtTime(880, t);
    o.frequency.exponentialRampToValueAtTime(70, t + 1.7);
    o.connect(f);
    o.start(t);
    o.stop(t + 1.8);
    this.noise(this.env(0.15, 0.01, 1.2, t), t, 1.2, { type: 'lowpass', from: 4000, to: 200 });
  }

  alarm(): void {
    const t = this.ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const at = t + i * 0.36;
      this.tone('square', i % 2 ? 262 : 330, this.env(0.12, 0.01, 0.3, at), at, 0.32);
    }
  }

  chord(open: boolean): void {
    const t = this.ctx.currentTime;
    const notes = open ? [0, 3, 7, 10] : [0, 7, 12];
    notes.forEach((n, i) => {
      const at = t + i * (open ? 0.03 : 0.06);
      this.tone('triangle', semis(261.63, n), this.env(0.06, 0.02, open ? 0.9 : 0.5, at), at, open ? 1 : 0.6);
    });
  }
}
