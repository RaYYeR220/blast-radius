import { describe, expect, it } from 'vitest';
import { DEFAULTS, type Saved } from './persist';
import { recordRun } from './progress';
import { buildRunRecord } from './record';
import { Run } from './run';
import { hudTag, myRunId, reportOf, standingOf, youText } from './standing';
import { Submission } from './submit';

const today = '2026-10-14';
const fresh = (): Saved => structuredClone(DEFAULTS);

function finished(run: Run): Run {
  for (let i = 0; i < 100_000 && run.state.phase !== 'over'; i++) {
    if (run.state.phase === 'shop') run.session.act([{ type: 'skip' }]);
    else run.session.tick();
  }
  return run;
}

describe('hudTag', () => {
  it('says what kind of run is on screen', () => {
    expect(hudTag(new Run({ mode: 'daily', seed: 'daily-2026-10-14', unranked: null }, null, false), today)).toBe('daily · 2026-10-14');
    expect(hudTag(new Run({ mode: 'endless', seed: 'e-abc', token: 't', unranked: null }, null, false), today)).toBe('seed · e-abc');
    expect(hudTag(new Run({ mode: 'endless', seed: 'local-x', unranked: 'offline' }, null, false), today)).toBe('practice · the board is offline');
    expect(hudTag(new Run({ mode: 'endless', seed: 'shot-1', unranked: 'custom' }, null, false), today)).toBe('seed · shot-1 · practice');
    expect(hudTag(new Run({ mode: 'endless', seed: 'shot-1', unranked: 'autoplay' }, 'idle', false), today)).toBe('seed · shot-1 · autoplay');
  });
});

describe('standing and report', () => {
  it('offers the board only to a run that can be ranked', () => {
    const offline = new Run({ mode: 'endless', seed: 'local-x', unranked: 'offline' }, null, false);
    expect(standingOf(offline, 'ada')).toEqual({ k: 'unranked', why: 'offline' });
    const ranked = new Run({ mode: 'daily', seed: 'daily-2026-10-14', unranked: null }, null, false);
    expect(standingOf(ranked, 'ada')).toEqual({ k: 'unranked', why: 'custom' });
    ranked.submission = new Submission({ board: 'daily', replay: ranked.session.replay(), score: 0, day: today }, { submit: async () => ({ ok: false, offline: true }) }, () => {});
    expect(standingOf(ranked, 'ada')).toEqual({ k: 'submittable', board: 'daily', name: 'ada' });
  });

  it('reports the best, a new best, and what the run added to the archive', () => {
    const run = finished(new Run({ mode: 'endless', seed: 'e2e-leak', unranked: 'custom' }, null, false));
    const d = fresh();
    d.best.endless = 5;
    run.outcome = recordRun(d, buildRunRecord(run.state, 'endless', today, run.tally));
    const r = reportOf(run, d, today);
    expect(r.s.end).toBe('leak');
    expect(r.best).toEqual({ value: run.state.score, isNew: true });
    expect(r.archive).toEqual({ fresh: 1, have: 1, total: 44 });
    expect(r.standing).toEqual({ k: 'unranked', why: 'custom' });
    const again = reportOf(run, d, today);
    expect(again.best?.value).toBe(run.state.score);
  });

  it('leaves the best out of an autoplay report', () => {
    const run = finished(new Run({ mode: 'endless', seed: 'e2e-leak', unranked: 'autoplay' }, 'idle', false));
    expect(reportOf(run, fresh(), today).best).toBeNull();
    expect(reportOf(run, fresh(), today).archive).toBeNull();
  });
});

describe('board footer', () => {
  it('shows this device\'s best and finds its own ranked run', () => {
    const d = fresh();
    expect(youText('daily', d, today)).toBe('no daily run on this device today');
    expect(youText('endless', d, today)).toBe('no endless run on this device yet');
    expect(youText('agents', d, today)).toBe('agents rank on their own board');
    d.best.daily[today] = 6420;
    d.best.endless = 12;
    expect(youText('daily', d, today)).toBe('your best on this device · 6,420');
    expect(youText('endless', d, today)).toBe('your best on this device · 12');
    d.mine.daily = { id: 'd1', score: 6420, day: '2026-10-13' };
    d.mine.endless = { id: 'e1', score: 12, day: '' };
    expect(myRunId('daily', d, today)).toBeNull();
    expect(myRunId('endless', d, today)).toBe('e1');
    d.mine.daily.day = today;
    expect(myRunId('daily', d, today)).toBe('d1');
    expect(myRunId('agents', d, today)).toBeNull();
  });
});
