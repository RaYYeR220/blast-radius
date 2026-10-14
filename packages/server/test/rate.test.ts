import { describe, expect, it } from 'vitest';
import { hashKey, windowStart } from '../src/rate';

describe('rate limit helpers', () => {
  it('floors time into fixed windows', () => {
    const t = Date.parse('2026-10-14T18:47:31Z');
    expect(new Date(windowStart(t, 60)).toISOString()).toBe('2026-10-14T18:00:00.000Z');
    expect(new Date(windowStart(t, 15)).toISOString()).toBe('2026-10-14T18:45:00.000Z');
  });
  it('hashes keys with a salt so raw IPs are never stored', async () => {
    const a = await hashKey('1.2.3.4', 'runs', 'salt-a');
    const b = await hashKey('1.2.3.4', 'runs', 'salt-b');
    expect(a).not.toContain('1.2.3.4');
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
  });
});
