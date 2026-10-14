import { type Replay, SIM_VERSION, verifyReplay } from '@blast/sim';
import { cleanName } from './names';
import { hashKey, windowStart } from './rate';
import type { Board, Repo, RunRow } from './repo';

export interface Deps {
  repo: Repo;
  now(): number;
  salt: string;
}

export interface ApiResult {
  status: number;
  body: unknown;
}

export const MAX_BODY_BYTES = 256 * 1024;
const RUNS_PER_HOUR = 30;
const DAY_MS = 86_400_000;
const GRACE_MS = 60 * 60_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SEED = /^[\w.-]{1,64}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

const fail = (status: number, error: string): ApiResult => ({ status, body: { error } });
const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10);

export async function limited(d: Deps, ip: string, route: string, perHour: number): Promise<boolean> {
  const key = await hashKey(ip, route, d.salt);
  return !(await d.repo.bumpRate(key, windowStart(d.now(), 60), perHour));
}

/** A daily seed is today's (UTC), or yesterday's within the first hour after midnight. */
export function dailyAllowed(seed: string, now: number): boolean {
  if (seed === `daily-${isoDay(now)}`) return true;
  const sinceMidnight = now - Math.floor(now / DAY_MS) * DAY_MS;
  return sinceMidnight < GRACE_MS && seed === `daily-${isoDay(now - DAY_MS)}`;
}

function parseSubmission(raw: string): { replay: Replay; score: number; name: string } | null {
  let b: unknown;
  try {
    b = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!b || typeof b !== 'object') return null;
  const { replay, score, name } = b as { replay?: Replay; score?: unknown; name?: unknown };
  if (!replay || typeof replay !== 'object' || !Array.isArray(replay.actions)) return null;
  if (typeof replay.seed !== 'string' || !SEED.test(replay.seed)) return null;
  if (replay.mode !== 'endless' && replay.mode !== 'daily') return null;
  if (typeof score !== 'number' || !Number.isInteger(score)) return null;
  return { replay, score, name: typeof name === 'string' ? name : '' };
}

/** Verifies a finished run by re-simulating it, then records it on its board. */
export async function submitRun(d: Deps, ip: string, raw: string): Promise<ApiResult> {
  if (raw.length > MAX_BODY_BYTES) return fail(413, 'replay too large');
  if (await limited(d, ip, 'runs', RUNS_PER_HOUR)) return fail(429, 'slow down');
  const sub = parseSubmission(raw);
  if (!sub) return fail(400, 'malformed submission');
  const { replay } = sub;
  if (replay.mode === 'daily' && !dailyAllowed(replay.seed, d.now())) return fail(422, 'that daily has closed');
  const verdict = verifyReplay(replay, { score: sub.score });
  if (!verdict.ok) return fail(422, verdict.reason);
  const id = crypto.randomUUID();
  const board: Board = replay.mode;
  const day = board === 'daily' ? replay.seed.slice('daily-'.length) : null;
  const createdAt = new Date(d.now()).toISOString();
  const s = verdict.summary;
  const row: RunRow = {
    id,
    board,
    mode: replay.mode,
    seed: replay.seed,
    day,
    simVersion: SIM_VERSION,
    playerKind: 'human',
    name: cleanName(sub.name, id.slice(0, 4)),
    score: s.score,
    waves: s.wave,
    shipped: s.shipped,
    intercepts: s.intercepts,
    infected: s.infected,
    endedBy: s.endedBy,
    durationTicks: s.durationTicks,
    rootPayload: s.rootPayload,
    actions: replay.actions,
    createdAt,
  };
  await d.repo.insertRun(row);
  const rank = await d.repo.rankOf(board, day, s.score, createdAt);
  return { status: 200, body: { id, score: s.score, rank, board, day, name: row.name } };
}

function publicRow(r: RunRow, rank: number) {
  return { rank, id: r.id, name: r.name, score: r.score, wave: r.waves, endedBy: r.endedBy, kind: r.playerKind, createdAt: r.createdAt };
}

export async function leaderboard(d: Deps, q: URLSearchParams): Promise<ApiResult> {
  const board = q.get('board') ?? 'daily';
  if (board !== 'daily' && board !== 'endless' && board !== 'agents') return fail(400, 'unknown board');
  const dayParam = q.get('day');
  if (dayParam && !DAY.test(dayParam)) return fail(400, 'day must be YYYY-MM-DD');
  const day = board === 'endless' ? null : (dayParam ?? isoDay(d.now()));
  const limit = Math.max(1, Math.min(50, Number(q.get('limit') ?? 50) || 50));
  const rows = await d.repo.top(board, day, limit);
  const out = rows.map((r, i) => publicRow(r, i + 1));
  let me: ReturnType<typeof publicRow> | null = null;
  const around = q.get('around');
  if (around && UUID.test(around)) {
    const r = await d.repo.getRun(around);
    if (r && r.board === board && r.day === day) me = publicRow(r, await d.repo.rankOf(board, day, r.score, r.createdAt));
  }
  return { status: 200, body: { board, day, rows: out, me } };
}

export async function getRun(d: Deps, id: string): Promise<ApiResult> {
  if (!UUID.test(id)) return fail(400, 'bad id');
  const r = await d.repo.getRun(id);
  if (!r) return fail(404, 'no such run');
  const replay: Replay = { v: r.simVersion, mode: r.mode as Replay['mode'], seed: r.seed, actions: r.actions };
  return {
    status: 200,
    body: {
      id: r.id,
      board: r.board,
      name: r.name,
      kind: r.playerKind,
      createdAt: r.createdAt,
      replay,
      summary: {
        score: r.score,
        wave: r.waves,
        shipped: r.shipped,
        intercepts: r.intercepts,
        infected: r.infected,
        endedBy: r.endedBy,
        durationTicks: r.durationTicks,
        rootPayload: r.rootPayload,
      },
    },
  };
}
