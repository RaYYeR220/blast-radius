import { describe, expect, it } from 'vitest';
import { dailySeed, msToNextDaily } from './daily';

describe('daily seed', () => {
  it('uses the UTC date', () => {
    expect(dailySeed(new Date('2026-10-14T23:59:59Z'))).toBe('daily-2026-10-14');
    expect(dailySeed(new Date('2026-10-15T00:00:00Z'))).toBe('daily-2026-10-15');
    expect(dailySeed(new Date('2026-10-15T01:30:00+02:00'))).toBe('daily-2026-10-14');
  });

  it('counts down to the next UTC midnight', () => {
    expect(msToNextDaily(new Date('2026-10-14T23:59:00Z'))).toBe(60_000);
  });
});
