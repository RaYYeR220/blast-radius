import { describe, expect, it, vi } from 'vitest';
import type { Api } from '../net/client';
import { DEFAULTS } from './persist';
import { type Finished, keepMine, nameProblem, Submission, type SubmitState } from './submit';

type SubmitFn = Api['submit'];

const run: Finished = { board: 'daily', replay: { v: 1, mode: 'daily', seed: 'daily-2026-10-14', actions: [] }, score: 900, day: '2026-10-14' };

describe('nameProblem', () => {
  it('accepts names the board will show as typed, and empty for anonymous', () => {
    for (const ok of ['', '  ', 'ada', 'quiet cut', 'red_team.ok', 'a-b', 'x'.repeat(16)]) expect(nameProblem(ok)).toBeNull();
  });

  it('explains names the board would not keep', () => {
    expect(nameProblem('ab')).toMatch(/at least 3/);
    expect(nameProblem('x'.repeat(17))).toMatch(/at most 16/);
    expect(nameProblem('héllo')).toMatch(/letters, digits/);
    expect(nameProblem('anon-1234')).toMatch(/anon-/);
  });
});

describe('Submission', () => {
  it('goes sending → ranked and reports each step', async () => {
    const seen: SubmitState['k'][] = [];
    const submit = vi.fn<SubmitFn>(async () => ({ ok: true, id: 'r1', rank: 4 }));
    const sub = new Submission({ ...run, token: 'tok' }, { submit }, (s) => seen.push(s.k));
    expect(await sub.send(' ada ')).toEqual({ k: 'ranked', id: 'r1', rank: 4, name: 'ada' });
    expect(seen).toEqual(['sending', 'ranked']);
    expect(submit).toHaveBeenCalledWith(run.replay, 900, 'ada', 'tok');
    await sub.send('ada');
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it('says offline when the network or the boards are down, and can retry', async () => {
    let calls = 0;
    const submit = vi.fn<SubmitFn>(async () => (++calls === 1 ? { ok: false, offline: true } : { ok: false, status: 503, error: 'down' }));
    const sub = new Submission(run, { submit }, () => {});
    expect((await sub.send('ada')).k).toBe('offline');
    expect((await sub.send('ada')).k).toBe('offline');
    expect(submit).toHaveBeenCalledTimes(2);
  });

  it('passes the server\'s refusal through word for word', async () => {
    const submit = vi.fn<SubmitFn>(async () => ({ ok: false, status: 409, error: 'that name belongs to someone else; pick another' }));
    const sub = new Submission(run, { submit }, () => {});
    expect(await sub.send('ada')).toEqual({ k: 'refused', error: 'that name belongs to someone else; pick another' });
  });

  it('refuses a bad name without calling the server', async () => {
    const submit = vi.fn<SubmitFn>();
    const sub = new Submission(run, { submit }, () => {});
    expect((await sub.send('ab')).k).toBe('refused');
    expect(submit).not.toHaveBeenCalled();
  });
});

describe('keepMine', () => {
  it('keeps the best ranked run per board and day', () => {
    const d = structuredClone(DEFAULTS);
    keepMine(d, run, 'a');
    keepMine(d, { ...run, score: 500 }, 'b');
    expect(d.mine.daily).toEqual({ id: 'a', score: 900, day: '2026-10-14' });
    keepMine(d, { ...run, score: 100, day: '2026-10-15' }, 'c');
    expect(d.mine.daily?.id).toBe('c');
    keepMine(d, { ...run, board: 'endless', score: 50 }, 'e');
    expect(d.mine.endless).toEqual({ id: 'e', score: 50, day: '' });
  });
});
