import { describe, expect, it } from 'vitest';
import { actRun, startRun, submitAgentRun } from '../src/agent';
import { submitRun } from '../src/runs';
import { deps, playToEnd } from './helpers';

const OWNER_A = 'device-aaaaaaaaaaaaaaaa';
const OWNER_B = 'device-bbbbbbbbbbbbbbbb';
const daily = () => playToEnd('daily-2026-10-15', 'daily');
const send = (d: ReturnType<typeof deps>, run: object, name: string, owner: string) =>
  submitRun(d, '1.1.1.1', JSON.stringify({ ...run, name, owner }));

describe('names belong to whoever claimed them first', () => {
  it('refuses a name another device already holds', async () => {
    const d = deps();
    expect((await send(d, daily(), 'ada', OWNER_A)).status).toBe(200);
    const r = await send(d, playToEnd('daily-2026-10-15', 'daily', 'sloppy'), 'ada', OWNER_B);
    expect(r.status).toBe(409);
    expect((r.body as { error: string }).error).toMatch(/name/);
  });

  it('lets two players with identical outcomes both rank', async () => {
    const d = deps();
    expect((await send(d, daily(), 'ada', OWNER_A)).status).toBe(200);
    expect((await send(d, daily(), 'bob', OWNER_B)).status).toBe(200);
  });

  it('still refuses the same player resubmitting the same outcome', async () => {
    const d = deps();
    expect((await send(d, daily(), 'ada', OWNER_A)).status).toBe(200);
    expect((await send(d, daily(), 'ada', OWNER_A)).status).toBe(409);
  });

  it('requires a device key from human clients', async () => {
    const r = await submitRun(deps(), '1.1.1.1', JSON.stringify({ ...daily(), name: 'x' }));
    expect(r.status).toBe(400);
  });

  it('lets an agent keep its name across runs with a key', async () => {
    const d = deps();
    const finish = async (key?: string) => {
      const { run } = (await startRun(d, '1.1.1.1', { name: 'probe', key })).body as { run: string };
      for (let i = 0; i < 400; i++) if (((await actRun(d, '1.1.1.1', { run, actions: [], advance: 120 })).body as { over: boolean }).over) break;
      return submitAgentRun(d, '1.1.1.1', { run });
    };
    expect((await finish('agent-key-123456789')).status).toBe(200);
    // same outcome from the same owner: a duplicate, not a new run
    expect((await finish('agent-key-123456789')).status).toBe(409);
    // someone else cannot take the name
    expect((await finish('other-key-987654321')).status).toBe(409);
  });
});
