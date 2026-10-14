import { describe, expect, it, vi } from 'vitest';
import type { Api } from '../net/client';
import { localSeed, SeedBank } from './seeds';

type SeedFn = Api['seed'];

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('SeedBank', () => {
  it('hands out a prefetched server seed once, with its token, and fetches the next', async () => {
    let n = 0;
    const seed = vi.fn<SeedFn>(async () => ({ ok: true, seed: `e-${++n}`, token: `t${n}` }));
    const bank = new SeedBank({ seed });
    bank.prefetch();
    bank.prefetch();
    await flush();
    expect(seed).toHaveBeenCalledTimes(1);
    expect(bank.ticket('endless')).toEqual({ mode: 'endless', seed: 'e-1', token: 't1', unranked: null });
    await flush();
    expect(seed).toHaveBeenCalledTimes(2);
    expect(bank.ticket('endless').seed).toBe('e-2');
  });

  it('plays a local, unranked seed when the server is offline or not back yet', async () => {
    const bank = new SeedBank({ seed: async () => ({ ok: false, offline: true }) });
    bank.prefetch();
    await flush();
    const t = bank.ticket('endless');
    expect(t.seed).toMatch(/^local-/);
    expect(t.unranked).toBe('offline');
    expect(t.token).toBeUndefined();
  });

  it('ignores a malformed answer', async () => {
    const bank = new SeedBank({ seed: async () => ({ ok: true }) as never });
    bank.prefetch();
    await flush();
    expect(bank.hasSeed).toBe(false);
  });

  it('refetches a seed whose token would have expired', async () => {
    let now = 0;
    const seed = vi.fn<SeedFn>(async () => ({ ok: true, seed: 'e-old', token: 't' }));
    const bank = new SeedBank({ seed }, () => now);
    bank.prefetch();
    await flush();
    now = 6 * 60 * 60_000;
    expect(bank.hasSeed).toBe(false);
    expect(bank.ticket('endless').unranked).toBe('offline');
  });

  it('uses the UTC daily seed, and never ranks custom seeds or autoplay', () => {
    const bank = new SeedBank({ seed: async () => ({ ok: false, offline: true }) });
    const now = new Date('2026-10-14T23:30:00-05:00');
    expect(bank.ticket('daily', { now })).toEqual({ mode: 'daily', seed: 'daily-2026-10-15', unranked: null });
    expect(bank.ticket('daily', { custom: 'e2e', now }).unranked).toBe('custom');
    expect(bank.ticket('daily', { autoplay: true, now }).unranked).toBe('autoplay');
    expect(bank.ticket('endless', { autoplay: true }).unranked).toBe('autoplay');
  });

  it('makes local seeds the server would accept', () => {
    expect(localSeed(() => 0.5, 1_760_000_000_000)).toMatch(/^[\w.-]{1,64}$/);
  });
});
