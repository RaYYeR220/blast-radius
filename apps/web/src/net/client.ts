import type { Replay, RunSummary } from '@blast/sim';

export type Offline = { ok: false; offline: true };
export type Refused = { ok: false; status: number; error: string };
export type Result<T> = ({ ok: true } & T) | Offline | Refused;

export interface BoardRow {
  rank: number;
  id: string;
  name: string;
  score: number;
  wave: number;
  endedBy: string;
  kind: 'human' | 'agent';
  createdAt: string;
}

export interface StoredRun {
  id: string;
  name: string;
  board: string;
  kind: string;
  createdAt: string;
  replay: Replay;
  summary: Omit<RunSummary, 'leakPath' | 'finalHash' | 'effectiveActions'>;
}

interface ApiOptions {
  fetch?: typeof fetch;
  base?: string;
  owner: () => string;
  timeoutMs?: number;
}

/** The game's server calls. Every failure comes back as a value; nothing here throws into the game. */
export class Api {
  private readonly f: typeof fetch;
  private readonly base: string;
  private readonly timeoutMs: number;

  constructor(private readonly o: ApiOptions) {
    this.f = o.fetch ?? ((...args) => fetch(...args));
    this.base = o.base ?? '';
    this.timeoutMs = o.timeoutMs ?? 8000;
  }

  private async call<T>(path: string, init?: RequestInit): Promise<Result<T>> {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), this.timeoutMs);
    try {
      const res = await this.f(`${this.base}${path}`, { ...init, signal: ctl.signal });
      const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      if (!res.ok) return { ok: false, status: res.status, error: String(body?.error ?? 'request failed') };
      // a 200 that is not JSON is a static host without the API behind it
      if (!body || typeof body !== 'object') return { ok: false, offline: true };
      return { ok: true, ...(body as T) };
    } catch {
      return { ok: false, offline: true };
    } finally {
      clearTimeout(timer);
    }
  }

  /** A server-issued endless seed, so the run can be ranked. */
  seed(): Promise<Result<{ seed: string; token: string }>> {
    return this.call('/api/seed', { method: 'POST' });
  }

  async submit(replay: Replay, score: number, name: string, token?: string): Promise<Result<{ id: string; rank: number }>> {
    const r = await this.call<{ id: string; rank: number }>('/api/runs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ replay, score, name, token, owner: this.o.owner() }),
    });
    return r.ok ? { ok: true, id: r.id, rank: r.rank } : r;
  }

  board(board: 'daily' | 'endless' | 'agents', around?: string): Promise<Result<{ rows: BoardRow[]; me: BoardRow | null; day: string | null }>> {
    const q = new URLSearchParams({ board });
    if (around) q.set('around', around);
    return this.call(`/api/leaderboard?${q}`);
  }

  run(id: string): Promise<Result<StoredRun>> {
    return this.call(`/api/run?id=${encodeURIComponent(id)}`);
  }
}

interface KeyStore {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

const KEY = 'blast-radius-device';
let memoryKey: string | null = null;

function freshKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** A random id for this browser: it proves a name is yours without an account. */
export function deviceKey(store: KeyStore | null = safeStorage()): string {
  try {
    const existing = store?.getItem(KEY);
    if (existing && /^[\w-]{24,}$/.test(existing)) return existing;
    const k = freshKey();
    store?.setItem(KEY, k);
    return k;
  } catch {
    memoryKey ??= freshKey();
    return memoryKey;
  }
}

function safeStorage(): KeyStore | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
