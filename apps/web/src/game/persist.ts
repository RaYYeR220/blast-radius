export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface Settings {
  sound: boolean;
  music: boolean;
  shake: boolean;
  reducedMotion: boolean;
  colorBlind: boolean;
  trail: string;
}

export interface Saved {
  v: 1;
  name: string;
  settings: Settings;
  best: { endless: number; daily: Record<string, number> };
  /** Injection payload index → when it was first met. */
  archive: Record<number, { firstSeen: string; wave: number }>;
  trails: string[];
  stats: { runs: number; intercepts: number; shipped: number };
  /** This device's best ranked run per human board, so the board can show where you stand. */
  mine: Partial<Record<'daily' | 'endless', MyRun>>;
}

export interface MyRun {
  id: string;
  score: number;
  /** UTC day of a daily run; '' for endless. */
  day: string;
}

export const DEFAULTS: Saved = {
  v: 1,
  name: '',
  settings: { sound: true, music: true, shake: true, reducedMotion: false, colorBlind: false, trail: 'plain' },
  best: { endless: 0, daily: {} },
  archive: {},
  trails: ['plain'],
  stats: { runs: 0, intercepts: 0, shipped: 0 },
  mine: {},
};

const KEY = 'blast-radius';

function fresh(): Saved {
  return structuredClone(DEFAULTS);
}

/** Settings and progress in localStorage. Every access survives a throwing or missing storage. */
export class Store {
  private data: Saved;

  constructor(private readonly storage: StorageLike | null = safeLocalStorage()) {
    this.data = this.read();
  }

  get(): Saved {
    return this.data;
  }

  update(fn: (d: Saved) => void): void {
    fn(this.data);
    try {
      this.storage?.setItem(KEY, JSON.stringify(this.data));
    } catch {
      // private mode or quota: keep playing from memory
    }
  }

  private read(): Saved {
    try {
      const raw = this.storage?.getItem(KEY);
      if (!raw) return fresh();
      const parsed = JSON.parse(raw) as Partial<Saved>;
      if (parsed?.v !== 1) return fresh();
      const base = fresh();
      return {
        ...base,
        ...parsed,
        settings: { ...base.settings, ...parsed.settings },
        best: { ...base.best, ...parsed.best, daily: { ...parsed.best?.daily } },
        stats: { ...base.stats, ...parsed.stats },
        archive: { ...parsed.archive },
        mine: { ...parsed.mine },
        trails: Array.isArray(parsed.trails) ? parsed.trails : base.trails,
        v: 1,
      };
    } catch {
      return fresh();
    }
  }
}

function safeLocalStorage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
