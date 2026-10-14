import type { Action, ReplayEntry } from '@blast/sim';

export type Board = 'daily' | 'endless' | 'agents';

export interface RunRow {
  id: string;
  board: Board;
  mode: string;
  seed: string;
  day: string | null;
  simVersion: number;
  playerKind: 'human' | 'agent';
  name: string;
  score: number;
  waves: number;
  shipped: number;
  intercepts: number;
  infected: number;
  endedBy: string;
  durationTicks: number;
  rootPayload: number | null;
  actions: ReplayEntry[];
  /** sha256 of seed + final game state; the same outcome is ranked at most once, however the log is written. */
  outcomeHash: string;
  createdAt: string;
}

export interface SessionRow {
  id: string;
  seed: string;
  mode: 'daily' | 'endless';
  actions: ReplayEntry[];
  tick: number;
  status: 'live' | 'over' | 'submitted';
  agentName: string | null;
  /** The game as it stands, so each call resumes in O(advance) instead of replaying the log. */
  snapshot: string;
  /** Bumped on every write; a write against a stale version is refused. */
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface Repo {
  /** 'duplicate' when the outcome (or the endless seed) is already ranked: the store enforces it, not just the caller. */
  insertRun(row: RunRow): Promise<'ok' | 'duplicate'>;
  /** 1 + the number of runs on this board/day that beat `score` (ties go to the earlier run). */
  rankOf(board: Board, day: string | null, score: number, createdAt: string): Promise<number>;
  top(board: Board, day: string | null, limit: number): Promise<RunRow[]>;
  getRun(id: string): Promise<RunRow | null>;
  /** Is this outcome, or (for endless) this seed, already on a board? */
  seen(outcomeHash: string, endlessSeed: string | null): Promise<boolean>;
  createSession(row: SessionRow): Promise<void>;
  getSession(id: string): Promise<SessionRow | null>;
  /** Applies `patch` only if the row is still at `expectedVersion`; returns whether it did. */
  updateSession(id: string, patch: Partial<SessionRow>, expectedVersion: number): Promise<boolean>;
  /** Counts a hit in the window; false when the limit is exceeded. */
  bumpRate(key: string, windowStart: number, limit: number): Promise<boolean>;
}

/** In-memory repository for tests and local development. */
export class MemoryRepo implements Repo {
  runs: RunRow[] = [];
  sessions = new Map<string, SessionRow>();
  rates = new Map<string, number>();

  async insertRun(row: RunRow): Promise<'ok' | 'duplicate'> {
    const clash = this.runs.some(
      (r) => r.outcomeHash === row.outcomeHash || (row.board === 'endless' && r.board === 'endless' && r.seed === row.seed),
    );
    if (clash) return 'duplicate';
    this.runs.push(structuredClone(row));
    return 'ok';
  }

  private board(board: Board, day: string | null): RunRow[] {
    return this.runs
      .filter((r) => r.board === board && r.day === day)
      .sort((a, b) => b.score - a.score || a.createdAt.localeCompare(b.createdAt));
  }

  async rankOf(board: Board, day: string | null, score: number, createdAt: string): Promise<number> {
    return (
      1 +
      this.runs.filter(
        (r) => r.board === board && r.day === day && (r.score > score || (r.score === score && r.createdAt < createdAt)),
      ).length
    );
  }

  async top(board: Board, day: string | null, limit: number): Promise<RunRow[]> {
    return structuredClone(this.board(board, day).slice(0, limit));
  }

  async getRun(id: string): Promise<RunRow | null> {
    const r = this.runs.find((x) => x.id === id);
    return r ? structuredClone(r) : null;
  }

  async seen(outcomeHash: string, endlessSeed: string | null): Promise<boolean> {
    return this.runs.some(
      (r) => r.outcomeHash === outcomeHash || (endlessSeed !== null && r.board === 'endless' && r.seed === endlessSeed),
    );
  }

  async createSession(row: SessionRow): Promise<void> {
    this.sessions.set(row.id, structuredClone(row));
  }

  async getSession(id: string): Promise<SessionRow | null> {
    const s = this.sessions.get(id);
    return s ? structuredClone(s) : null;
  }

  async updateSession(id: string, patch: Partial<SessionRow>, expectedVersion: number): Promise<boolean> {
    const s = this.sessions.get(id);
    if (!s || s.version !== expectedVersion) return false;
    this.sessions.set(id, { ...s, ...structuredClone(patch), version: expectedVersion + 1 });
    return true;
  }

  async bumpRate(key: string, windowStart: number, limit: number): Promise<boolean> {
    const k = `${key}|${windowStart}`;
    const n = (this.rates.get(k) ?? 0) + 1;
    this.rates.set(k, n);
    return n <= limit;
  }
}

export type { Action };
