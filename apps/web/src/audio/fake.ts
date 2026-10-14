/** Minimal AudioContext stand-in for tests: records what gets created and scheduled. */
export class FakeParam {
  value = 0;
  events: Array<[string, number, number]> = [];
  setValueAtTime(v: number, t: number) { this.events.push(['set', v, t]); this.value = v; return this; }
  linearRampToValueAtTime(v: number, t: number) { this.events.push(['lin', v, t]); this.value = v; return this; }
  exponentialRampToValueAtTime(v: number, t: number) { this.events.push(['exp', v, t]); this.value = v; return this; }
  setTargetAtTime(v: number, t: number) { this.events.push(['target', v, t]); this.value = v; return this; }
  cancelScheduledValues() { return this; }
}

class FakeNode {
  connect(n: unknown) { return n; }
  disconnect() {}
}

export class FakeOsc extends FakeNode {
  type = 'sine';
  frequency = new FakeParam();
  detune = new FakeParam();
  started = -1;
  start(t = 0) { this.started = t; }
  stop() {}
  onended: (() => void) | null = null;
}

export class FakeContext {
  state: 'suspended' | 'running' = 'suspended';
  currentTime = 0;
  sampleRate = 48000;
  destination = new FakeNode();
  oscillators: FakeOsc[] = [];
  sources = 0;
  gains: Array<{ gain: FakeParam }> = [];
  resume() { this.state = 'running'; return Promise.resolve(); }
  suspend() { this.state = 'suspended'; return Promise.resolve(); }
  createGain() { const g = Object.assign(new FakeNode(), { gain: new FakeParam() }); g.gain.value = 1; this.gains.push(g); return g; }
  createOscillator() { const o = new FakeOsc(); this.oscillators.push(o); return o; }
  createBiquadFilter() { return Object.assign(new FakeNode(), { type: 'lowpass', frequency: new FakeParam(), Q: new FakeParam() }); }
  createBuffer(_c: number, len: number) { return { getChannelData: () => new Float32Array(len) }; }
  createBufferSource() { this.sources++; return Object.assign(new FakeNode(), { buffer: null, start() {}, stop() {}, playbackRate: new FakeParam(), loop: false, onended: null }); }
  createDynamicsCompressor() { return Object.assign(new FakeNode(), { threshold: new FakeParam(), ratio: new FakeParam(), knee: new FakeParam(), attack: new FakeParam(), release: new FakeParam() }); }
  createStereoPanner() { return Object.assign(new FakeNode(), { pan: new FakeParam() }); }
}
