import type { Saved } from './persist';

export interface RunRecord {
  mode: 'endless' | 'daily';
  day: string;
  score: number;
  intercepts: number;
  shipped: number;
  wave: number;
  cleanWaves: number;
  payloads: number[];
}

export interface RunOutcome {
  newBest: boolean;
  unlocked: string[];
  newPayloads: number[];
}

/** Blade trails, unlocked by milestones. Cosmetic only, so leaderboards stay fair. */
export const TRAILS: ReadonlyArray<{ id: string; label: string; earned: (d: Saved, r: RunRecord) => boolean }> = [
  { id: 'spark', label: 'first interception', earned: (d) => d.stats.intercepts >= 1 },
  { id: 'ember', label: 'reach wave 6', earned: (_d, r) => r.wave >= 6 },
  { id: 'ribbon', label: '100 interceptions', earned: (d) => d.stats.intercepts >= 100 },
  { id: 'prism', label: 'four clean waves in one run', earned: (_d, r) => r.cleanWaves >= 4 },
];

export function showTutorial(d: Saved): boolean {
  return d.stats.intercepts === 0;
}

/** Folds a finished run into the save. Mutates `d`; call inside Store.update. */
export function recordRun(d: Saved, r: RunRecord): RunOutcome {
  d.stats.runs++;
  d.stats.intercepts += r.intercepts;
  d.stats.shipped += r.shipped;
  let newBest = false;
  if (r.mode === 'endless') {
    newBest = r.score > d.best.endless;
    if (newBest) d.best.endless = r.score;
  } else {
    newBest = r.score > (d.best.daily[r.day] ?? 0);
    if (newBest) d.best.daily[r.day] = r.score;
  }
  const newPayloads = r.payloads.filter((p) => !(p in d.archive));
  for (const p of newPayloads) d.archive[p] = { firstSeen: r.day, wave: r.wave };
  const unlocked: string[] = [];
  for (const t of TRAILS) {
    if (!d.trails.includes(t.id) && t.earned(d, r)) {
      d.trails.push(t.id);
      unlocked.push(t.id);
    }
  }
  return { newBest, unlocked, newPayloads };
}
