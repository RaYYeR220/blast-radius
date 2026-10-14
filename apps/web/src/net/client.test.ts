import { describe, expect, it, vi } from 'vitest';
import { Api, deviceKey } from './client';

const ok = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }));

describe('Api', () => {
  it('submits a run with the device key and returns the rank', async () => {
    const fetch = vi.fn((_u: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.owner).toBe('k'.repeat(24));
      return ok({ id: 'abc', rank: 3, score: 900 });
    });
    const api = new Api({ fetch: fetch as never, base: '', owner: () => 'k'.repeat(24) });
    const r = await api.submit({ v: 1, mode: 'daily', seed: 'daily-2026-10-15', actions: [] }, 900, 'ada');
    expect(r).toEqual({ ok: true, id: 'abc', rank: 3 });
  });

  it('reports offline instead of throwing when the network fails', async () => {
    const api = new Api({ fetch: (() => Promise.reject(new TypeError('Failed to fetch'))) as never, base: '', owner: () => 'k'.repeat(24) });
    expect(await api.submit({ v: 1, mode: 'daily', seed: 's', actions: [] }, 1, '')).toEqual({ ok: false, offline: true });
    expect(await api.board('daily')).toEqual({ ok: false, offline: true });
  });

  it('times out a hung request', async () => {
    vi.useFakeTimers();
    const api = new Api({
      fetch: ((_u: string, init?: RequestInit) =>
        new Promise((_res, rej) => init?.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError'))))) as never,
      base: '',
      owner: () => 'k'.repeat(24),
      timeoutMs: 8000,
    });
    const p = api.seed();
    await vi.advanceTimersByTimeAsync(8001);
    expect(await p).toEqual({ ok: false, offline: true });
    vi.useRealTimers();
  });

  it('passes the server\'s refusal through with its reason', async () => {
    const api = new Api({ fetch: (() => ok({ error: 'that name belongs to someone else; pick another' }, 409)) as never, base: '', owner: () => 'k'.repeat(24) });
    expect(await api.submit({ v: 1, mode: 'daily', seed: 's', actions: [] }, 1, 'ada')).toEqual({
      ok: false,
      status: 409,
      error: 'that name belongs to someone else; pick another',
    });
  });
});

describe('deviceKey', () => {
  it('creates a long random key once and keeps it', () => {
    const mem = new Map<string, string>();
    const store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    const a = deviceKey(store);
    expect(a).toMatch(/^[\w-]{24,}$/);
    expect(deviceKey(store)).toBe(a);
  });

  it('still returns a usable key when storage throws', () => {
    const broken = { getItem: () => { throw new Error('no'); }, setItem: () => { throw new Error('no'); } };
    expect(deviceKey(broken)).toMatch(/^[\w-]{24,}$/);
  });
});
