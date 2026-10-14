import { INJECTIONS } from '@blast/sim';
import { nf } from '../ui/dom';
import type { ReportData, Standing } from '../ui/report';
import type { Saved } from './persist';
import type { BoardName } from './routes';
import type { Run } from './run';

/** The small line under the HUD that says what this run is: its seed, the daily, or why it is practice. */
export function hudTag(run: Run, today: string): string {
  const t = run.ticket;
  if (run.bot) return `seed · ${t.seed} · autoplay`;
  if (t.mode === 'daily' && !t.unranked) return `daily · ${run.day(today)}`;
  if (t.unranked === 'offline') return 'practice · the board is offline';
  if (t.unranked === 'custom') return `seed · ${t.seed} · practice`;
  return `seed · ${t.seed}`;
}

/** Whether a finished run can go on the board, and if not, why. */
export function standingOf(run: Run, name: string): Standing {
  if (run.ticket.unranked) return { k: 'unranked', why: run.ticket.unranked };
  if (!run.submission) return { k: 'unranked', why: 'custom' };
  return { k: 'submittable', board: run.submission.run.board, name };
}

/** Everything the incident report shows for a live run, after its progress has been saved. */
export function reportOf(run: Run, d: Saved, today: string): ReportData {
  const s = run.state;
  const day = run.day(today);
  const bestNow = run.ticket.mode === 'daily' ? (d.best.daily[day] ?? 0) : d.best.endless;
  const o = run.outcome;
  return {
    s,
    timeline: run.session.timeline,
    standing: standingOf(run, d.name),
    best: run.bot ? null : { value: Math.max(bestNow, s.score), isNew: !!o?.newBest && s.score > 0 },
    archive: o ? { fresh: o.newPayloads.length, have: Object.keys(d.archive).length, total: INJECTIONS.length } : null,
  };
}

/** The board footer: this device's best on that board. */
export function youText(tab: BoardName, d: Saved, today: string): string {
  if (tab === 'agents') return 'agents rank on their own board';
  const best = tab === 'daily' ? (d.best.daily[today] ?? 0) : d.best.endless;
  if (best) return `your best on this device · ${nf(best)}`;
  return tab === 'daily' ? 'no daily run on this device today' : 'no endless run on this device yet';
}

/** This device's ranked run on a board, if it is still on today's board. */
export function myRunId(tab: BoardName, d: Saved, today: string): string | null {
  if (tab === 'daily') return d.mine.daily?.day === today ? d.mine.daily.id : null;
  if (tab === 'endless') return d.mine.endless?.id ?? null;
  return null;
}
