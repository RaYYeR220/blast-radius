import { describe, expect, it } from 'vitest';
import { SlowMo } from './slowmo';

describe('SlowMo', () => {
  it('does nothing without the upgrade', () => {
    const m = new SlowMo();
    m.hold(true);
    expect(m.update(100, false)).toBe(1);
  });

  it('slows time to a quarter while held and the meter lasts', () => {
    const m = new SlowMo();
    m.hold(true);
    expect(m.update(16, true)).toBe(0.25);
    expect(m.meter).toBeLessThan(1);
  });

  it('runs out after four seconds of real time, then recovers', () => {
    const m = new SlowMo();
    m.hold(true);
    for (let t = 0; t < 4100; t += 16) m.update(16, true);
    expect(m.update(16, true)).toBe(1);
    expect(m.meter).toBeLessThan(0.05); // empty, and only just starting to refill
    m.hold(false);
    for (let t = 0; t < 20_000; t += 16) m.update(16, true);
    expect(m.meter).toBe(1);
  });

  it('needs a short recharge before it can be used again', () => {
    const m = new SlowMo();
    m.hold(true);
    for (let t = 0; t < 4100; t += 16) m.update(16, true);
    m.hold(false);
    m.update(16, true);
    m.hold(true);
    expect(m.update(16, true)).toBe(1);
  });
});
