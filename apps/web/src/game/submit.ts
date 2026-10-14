import type { Replay } from '@blast/sim';
import type { Api } from '../net/client';
import type { MyRun, Saved } from './persist';

export type SubmitState =
  | { k: 'idle' }
  | { k: 'sending' }
  | { k: 'ranked'; id: string; rank: number; name: string }
  | { k: 'offline' }
  | { k: 'refused'; error: string };

/** Mirrors the server's rule: 3–16 letters, digits, spaces, _ . or -; empty means anonymous. */
export function nameProblem(raw: string): string | null {
  const name = raw.trim();
  if (!name) return null;
  if (/[^A-Za-z0-9 _.-]/.test(name)) return 'Names use letters, digits, spaces, _ . and - only.';
  if (name.length < 3) return 'Names need at least 3 characters.';
  if (name.length > 16) return 'Names are at most 16 characters.';
  if (name.toLowerCase().startsWith('anon-')) return 'Names starting with anon- are kept for anonymous runs.';
  return null;
}

export interface Finished {
  board: 'daily' | 'endless';
  replay: Replay;
  score: number;
  token?: string;
  /** UTC day for a daily run. */
  day: string;
}

/** Remembers a ranked run as this device's own when it beats the one kept for that board. */
export function keepMine(d: Saved, run: Finished, id: string): void {
  const cur = d.mine[run.board];
  const day = run.board === 'daily' ? run.day : '';
  if (cur && cur.day === day && cur.score >= run.score) return;
  const mine: MyRun = { id, score: run.score, day };
  d.mine[run.board] = mine;
}

/**
 * One finished run on its way to the board. Sending never blocks anything
 * else; the state says where it got to, and a refusal keeps the server's words.
 */
export class Submission {
  state: SubmitState = { k: 'idle' };

  constructor(
    readonly run: Finished,
    private readonly api: Pick<Api, 'submit'>,
    private readonly onChange: (s: SubmitState) => void,
  ) {}

  async send(name: string): Promise<SubmitState> {
    if (this.state.k === 'sending' || this.state.k === 'ranked') return this.state;
    const problem = nameProblem(name);
    if (problem) return this.set({ k: 'refused', error: problem });
    this.set({ k: 'sending' });
    const r = await this.api.submit(this.run.replay, this.run.score, name.trim(), this.run.token);
    if (r.ok) return this.set({ k: 'ranked', id: r.id, rank: r.rank, name: name.trim() });
    if ('offline' in r || r.status === 503) return this.set({ k: 'offline' });
    return this.set({ k: 'refused', error: r.error });
  }

  private set(s: SubmitState): SubmitState {
    this.state = s;
    this.onChange(s);
    return s;
  }
}
