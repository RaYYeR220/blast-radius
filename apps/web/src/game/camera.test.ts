import { describe, expect, it } from 'vitest';
import { boardOf } from './fixtures';
import { Camera, MIN_WINDOW, PAD, targetWindow } from './camera';

const s = () =>
  boardOf(
    [[500, 400, 'user'], [700, 450, 'agent'], [620, 300, 'web'], [480, 520, 'vault'], [900, 500, 'out']],
    [],
  );

describe('camera', () => {
  it('frames every active node with padding', () => {
    const r = targetWindow(s());
    for (const n of s().nodes) {
      expect(n.x).toBeGreaterThanOrEqual(r.x + PAD - 1e-9);
      expect(n.x).toBeLessThanOrEqual(r.x + r.w - PAD + 1e-9);
      expect(n.y).toBeGreaterThanOrEqual(r.y + PAD - 1e-9);
      expect(n.y).toBeLessThanOrEqual(r.y + r.h - PAD + 1e-9);
    }
  });

  it('never zooms in past the minimum window', () => {
    const r = targetWindow(s());
    expect(r.w).toBeGreaterThanOrEqual(MIN_WINDOW.w);
    expect(r.h).toBeGreaterThanOrEqual(MIN_WINDOW.h);
  });

  it('ignores inactive candidates', () => {
    const st = s();
    st.nodes.push({ ...st.nodes[1]!, id: 5, x: 1500, y: 950, active: false });
    expect(targetWindow(st).x + targetWindow(st).w).toBeLessThan(1500);
  });

  it('snaps on the first frame, then eases toward a new target', () => {
    const cam = new Camera();
    const st = s();
    const first = cam.update(st);
    expect(first).toEqual(targetWindow(st));
    st.nodes.push({ ...st.nodes[1]!, id: 5, x: 1500, y: 950, active: true });
    const eased = cam.update(st);
    const target = targetWindow(st);
    expect(eased.w).toBeGreaterThan(first.w);
    expect(eased.w).toBeLessThan(target.w);
    for (let i = 0; i < 300; i++) cam.update(st);
    expect(cam.update(st).w).toBeCloseTo(target.w, 1);
  });
});
