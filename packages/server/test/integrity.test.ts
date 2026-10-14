import { describe, expect, it } from 'vitest';
import { issueSeed, submitRun } from '../src/runs';
import { deps, playToEnd } from './helpers';

const body = (o: object) => JSON.stringify(o);

describe('leaderboard integrity', () => {
  it('refuses the same replay twice', async () => {
    const d = deps();
    const t = (await issueSeed(d, '1.1.1.1')).body as { seed: string; token: string };
    const { replay, score } = playToEnd(t.seed);
    expect((await submitRun(d, '1.1.1.1', body({ replay, score, token: t.token }))).status).toBe(200);
    expect((await submitRun(d, '2.2.2.2', body({ replay, score, token: t.token }))).status).toBe(409);
  });

  it('only ranks endless seeds the server issued, while their token is fresh', async () => {
    const d = deps();
    const mine = playToEnd('my-favourite-seed');
    expect((await submitRun(d, '1.1.1.1', body({ ...mine }))).status).toBe(422);
    const t = (await issueSeed(d, '1.1.1.1')).body as { seed: string; token: string };
    expect(t.seed).toMatch(/^e-[0-9a-z]+$/);
    const other = playToEnd('another-seed');
    expect((await submitRun(d, '1.1.1.1', body({ ...other, token: t.token }))).status).toBe(422);
    const later = deps(Date.parse('2026-10-15T12:00:00Z') + 7 * 3600_000);
    later.repo = d.repo;
    const run = playToEnd(t.seed);
    expect((await submitRun(later, '1.1.1.1', body({ ...run, token: t.token }))).status).toBe(422);
  });

  it('daily runs need no token', async () => {
    const run = playToEnd('daily-2026-10-15', 'daily');
    expect((await submitRun(deps(), '1.1.1.1', body(run))).status).toBe(200);
  });
});
