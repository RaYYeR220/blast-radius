import { createGame, Recorder } from '@blast/sim';
import { makeBot } from '@blast/sim/bots';
import { describe, expect, it } from 'vitest';
import { renderCard } from '../src/og/card';

describe('share card', () => {
  it('renders a 1200x630 PNG for a finished run', async () => {
    const s = createGame({ seed: 'daily-2026-10-15', mode: 'daily' });
    const rec = new Recorder(s);
    const bot = makeBot('sloppy', 'og');
    while (s.phase !== 'over') rec.step(bot(s));
    const png = await renderCard({ name: 'ada', replay: rec.replay() });
    expect([...png.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    const view = new DataView(png.buffer, png.byteOffset);
    expect(view.getUint32(16)).toBe(1200);
    expect(view.getUint32(20)).toBe(630);
    expect(png.length).toBeGreaterThan(10_000);
  });
});
