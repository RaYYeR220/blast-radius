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
  /** sha256 of seed + action log; a replay is ranked at most once. */
  replayHash: string;
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
  createdAt: string;
  updatedAt: string;
}

export interface Repo {
  insertRun(row: RunRow): Promise<void>;
  /** 1 + the number of runs on this board/day that beat `score` (ties go to the earlier run). */
  rankOf(board: Board, day: string | null, score: number, createdAt: string): Promise<number>;
  top(board: Board, day: string | null, limit: number): Promise<RunRow[]>;
  getRun(id: string): Promise<RunRow | null>;
  /** Is this replay, or (for endless) this seed, already on a board? */
  seen(replayHash: string, endlessSeed: string | null): Promise<boolean>;
  createSession(row: SessionRow): Promise<void>;
  getSession(id: string): Promise<SessionRow | null>;
  updateSession(id: string, patch: Partial<SessionRow>): Promise<void>;
  /** Counts a hit in the window; false when the limit is exceeded. */
  bumpRate(key: string, windowStart: number, limit: number): Promise<boolean>;
}

/** In-memory repository for tests and local development. */
export class MemoryRepo implements Repo {
  runs: RunRow[] = [];
  sessions = new Map<string, SessionRow>();
  rates = new Map<string, number>();

  async insertRun(row: RunRow): Promise<void> {
    this.runs.push(structuredClone(row));
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

  async seen(replayHash: string, endlessSeed: string | null): Promise<boolean> {
    return this.runs.some(
      (r) => r.replayHash === replayHash || (endlessSeed !== null && r.board === 'endless' && r.seed === endlessSeed),
    );
  }

  async createSession(row: SessionRow): Promise<void> {
    this.sessions.set(row.id, structuredClone(row));
  }

  async getSession(id: string): Promise<SessionRow | null> {
    const s = this.sessions.get(id);
    return s ? structuredClone(s) : null;
  }

  async updateSession(id: string, patch: Partial<SessionRow>): Promise<void> {
    const s = this.sessions.get(id);
    if (s) this.sessions.set(id, { ...s, ...structuredClone(patch) });
  }

  async bumpRate(key: string, windowStart: number, limit: number): Promise<boolean> {
    const k = `${key}|${windowStart}`;
    const n = (this.rates.get(k) ?? 0) + 1;
    this.rates.set(k, n);
    return n <= limit;
  }
}

export type { Action };
