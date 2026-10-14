import { describe, expect, it } from 'vitest';
import { GameLoop } from './loop';

function harness(opts: { scale?: number } = {}) {
  let t = 0;
  let ticks = 0;
  const alphas: number[] = [];
  let hiddenCb: ((hidden: boolean) => void) | null = null;
  let autoPaused = 0;
  const loop = new GameLoop({
    onTick: () => ticks++,
    onRender: (a) => alphas.push(a),
    onAutoPause: () => autoPaused++,
    deps: {
      now: () => t,
      raf: () => 1,
      caf: () => {},
      onVisibility: (cb) => {
        hiddenCb = cb;
        return () => {};
      },
    },
  });
  if (opts.scale) loop.setTimeScale(opts.scale);
  loop.start();
  return {
    loop,
    advance(ms: number, fps = 60) {
      const dt = 1000 / fps;
      for (let x = 0; x < ms; x += dt) {
        t += dt;
        loop.frame(t);
      }
    },
    jump(ms: number) {
      t += ms;
      loop.frame(t);
    },
    hide: () => hiddenCb?.(true),
    get ticks() { return ticks; },
    get autoPaused() { return autoPaused; },
    alphas,
  };
}

describe('GameLoop', () => {
  it('runs 60 ticks per second at 60 fps', () => {
    const h = harness();
    h.advance(1000);
    expect(h.ticks).toBeGreaterThanOrEqual(59);
    expect(h.ticks).toBeLessThanOrEqual(60);
  });

  it('runs 60 ticks per second on a 120 Hz display', () => {
    const h = harness();
    h.advance(1000, 120);
    expect(h.ticks).toBeGreaterThanOrEqual(59);
    expect(h.ticks).toBeLessThanOrEqual(60);
  });

  it('caps a long stall at five ticks instead of fast-forwarding', () => {
    const h = harness();
    h.advance(100);
    const before = h.ticks;
    h.jump(10_000);
    expect(h.ticks - before).toBe(5);
    h.advance(1000);
    expect(h.ticks - before).toBeLessThanOrEqual(5 + 60);
  });

  it('slows the sim with a time scale', () => {
    const h = harness({ scale: 0.25 });
    h.advance(1000);
    expect(h.ticks).toBeGreaterThanOrEqual(14);
    expect(h.ticks).toBeLessThanOrEqual(15);
  });

  it('pauses itself when the tab is hidden and does not resume on its own', () => {
    const h = harness();
    h.advance(200);
    h.hide();
    const before = h.ticks;
    h.advance(1000);
    expect(h.loop.paused).toBe(true);
    expect(h.autoPaused).toBe(1);
    expect(h.ticks).toBe(before);
  });

  it('does not burst after resuming from a long pause', () => {
    const h = harness();
    h.loop.pause();
    h.advance(5000);
    h.loop.resume();
    const before = h.ticks;
    h.advance(100);
    expect(h.ticks - before).toBeLessThanOrEqual(7);
  });

  it('keeps the interpolation factor in [0, 1)', () => {
    const h = harness();
    h.advance(777, 144);
    for (const a of h.alphas) {
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThan(1);
    }
  });
});
