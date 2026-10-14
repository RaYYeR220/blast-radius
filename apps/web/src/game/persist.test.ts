import { describe, expect, it } from 'vitest';
import { DEFAULTS, Store, type StorageLike } from './persist';

class MemStorage implements StorageLike {
  data = new Map<string, string>();
  getItem(k: string) { return this.data.get(k) ?? null; }
  setItem(k: string, v: string) { this.data.set(k, v); }
}
const throwing: StorageLike = {
  getItem() { throw new Error('SecurityError'); },
  setItem() { throw new Error('QuotaExceeded'); },
};

describe('Store', () => {
  it('returns defaults when storage throws, and keeps working in memory', () => {
    const st = new Store(throwing);
    expect(st.get()).toEqual(DEFAULTS);
    st.update((d) => { d.settings.shake = false; });
    expect(st.get().settings.shake).toBe(false);
  });

  it('returns defaults for corrupt JSON', () => {
    const mem = new MemStorage();
    mem.setItem('blast-radius', '{not json');
    expect(new Store(mem).get()).toEqual(DEFAULTS);
  });

  it('resets a save from an unknown version', () => {
    const mem = new MemStorage();
    mem.setItem('blast-radius', JSON.stringify({ v: 99, settings: { sound: false } }));
    expect(new Store(mem).get()).toEqual(DEFAULTS);
  });

  it('round-trips and fills fields missing from older saves', () => {
    const mem = new MemStorage();
    const a = new Store(mem);
    a.update((d) => { d.best.endless = 1234; d.archive[3] = { firstSeen: '2026-10-14', wave: 2 }; });
    const raw = JSON.parse(mem.getItem('blast-radius')!);
    delete raw.trails;
    mem.setItem('blast-radius', JSON.stringify(raw));
    const b = new Store(mem).get();
    expect(b.best.endless).toBe(1234);
    expect(b.archive[3]).toEqual({ firstSeen: '2026-10-14', wave: 2 });
    expect(b.trails).toEqual(DEFAULTS.trails);
  });

  it('never lets one store mutate another through shared defaults', () => {
    const a = new Store(throwing);
    a.update((d) => { d.stats.runs = 5; });
    expect(new Store(throwing).get().stats.runs).toBe(0);
  });
});
