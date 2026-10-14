import { expect, type Page, test } from '@playwright/test';

const RUN_ID = '3f2b8c1e-9d4a-4c55-8f1e-0a1b2c3d4e5f';

/** The preview server has no API behind it; failed /api/ calls are expected and mocked where a test needs them. */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.location().url.includes('/api/')) errors.push(m.text());
  });
  return errors;
}

const storedRun = {
  id: RUN_ID,
  name: 'ada',
  board: 'endless',
  kind: 'human',
  createdAt: '2026-10-14T10:00:00.000Z',
  // an empty log on this seed leaks in wave one, about twenty seconds in
  replay: { v: 1, mode: 'endless', seed: 'e2e-leak', actions: [] },
  summary: { score: 110, wave: 1, shipped: 11, intercepts: 0, infected: 2, endedBy: 'leak', durationTicks: 1100, rootPayload: 4 },
};

test('every page opens cleanly while the boards are offline', async ({ page }) => {
  const errors = watchErrors(page);
  await page.route('**/api/**', (r) => r.abort());
  await page.goto('/#/board');
  await expect(page.getByText('The board is offline.')).toBeVisible();
  await page.goto('/#/agents');
  await expect(page.getByRole('heading', { name: 'Agents' })).toBeVisible();
  await expect(page.getByText('https://blast-radius-game.vercel.app/api/mcp').first()).toBeVisible();
  await page.goto('/#/archive');
  await expect(page.getByText('Nothing logged yet.')).toBeVisible();
  await page.goto(`/#/replay/${RUN_ID}`);
  await expect(page.getByRole('heading', { name: 'The board is offline.' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('the back button leaves a run for the title', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page).toHaveURL(/#\/play$/);
  await expect(page.locator('#hud')).toBeVisible();
  await page.goBack();
  await expect(page.locator('#title')).toBeVisible();
  await expect(page.locator('#hud')).toBeHidden();
});

test('a finished run is submitted, a refusal is shown word for word, and R never waits', async ({ page }) => {
  const errors = watchErrors(page);
  await page.route('**/api/seed', (r) => r.fulfill({ json: { seed: 'e2e-leak', token: 'issued-token' } }));
  let refuse = true;
  await page.route('**/api/runs', async (r) => {
    const body = r.request().postDataJSON() as { token: string; name: string; replay: { seed: string } };
    expect(body.token).toBe('issued-token');
    expect(body.replay.seed).toBe('e2e-leak');
    if (refuse) await r.fulfill({ status: 409, json: { error: 'that name belongs to someone else; pick another' } });
    else await r.fulfill({ json: { id: RUN_ID, rank: 3, score: 110 } });
  });
  await page.goto('/?debug=1');
  await page.waitForFunction(() => !!window.__blast);
  await page.waitForTimeout(500); // the title fetches its seed
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.locator('[data-seed]')).toHaveText('seed · e2e-leak');
  await expect(page.locator('#over .rp')).toBeVisible({ timeout: 45_000 });
  await page.locator('#rpName').fill('kettle');
  await page.getByRole('button', { name: 'Submit to the board' }).click();
  await expect(page.locator('.rp-sub .st')).toHaveText('that name belongs to someone else; pick another');
  refuse = false;
  await page.locator('#rpName').fill('ada');
  await page.getByRole('button', { name: 'Submit to the board' }).click();
  await expect(page.locator('.ranked')).toContainText('#3');
  await expect(page.locator('.ranked')).toContainText('ada');
  await page.keyboard.press('r');
  await expect.poll(() => page.evaluate(() => window.__blast!.session.state.phase)).toBe('play');
  expect(errors).toEqual([]);
});

test('leaderboard rows open their replay, which plays, seeks and ends in its report', async ({ page }) => {
  const errors = watchErrors(page);
  await page.route('**/api/leaderboard**', (r) =>
    r.fulfill({
      json: {
        board: 'daily',
        day: '2026-10-14',
        rows: [{ rank: 1, id: RUN_ID, name: 'ada', score: 110, wave: 1, endedBy: 'leak', kind: 'human', createdAt: storedRun.createdAt }],
        me: null,
      },
    }),
  );
  await page.route('**/api/run?**', (r) => r.fulfill({ json: storedRun }));
  await page.goto('/#/board');
  await page.getByRole('link', { name: /Watch ada's run/ }).click();
  await expect(page).toHaveURL(new RegExp(`#/replay/${RUN_ID}$`));
  await expect(page.locator('#replay [data-bar]')).toBeVisible();
  await page.getByRole('radio', { name: '4×' }).click();
  await expect(page.getByRole('radio', { name: '4×' })).toHaveAttribute('aria-checked', 'true');
  await page.evaluate(() => {
    const r = document.querySelector<HTMLInputElement>('[data-scrub]')!;
    r.value = r.max;
    r.dispatchEvent(new Event('change'));
  });
  await expect(page.locator('#over .rp')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('#over [data-kicker]')).toHaveText('incident report · ada');
  await expect(page.getByRole('button', { name: /Watch again/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/#\/board$/);
  expect(errors).toEqual([]);
});

const oneRowBoard = {
  board: 'endless',
  day: null,
  rows: [{ rank: 1, id: RUN_ID, name: 'ada', score: 110, wave: 1, endedBy: 'leak', kind: 'human', createdAt: storedRun.createdAt }],
  me: null,
};

test('a run paused and left with the back button does not freeze the replay viewer', async ({ page }) => {
  await page.route('**/api/run?**', (r) => r.fulfill({ json: storedRun }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.locator('#hud')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#pause')).toBeVisible();
  await page.goBack();
  await expect(page.locator('#title')).toBeVisible();
  await page.evaluate((id) => (location.hash = `#/replay/${id}`), RUN_ID);
  const scrub = page.locator('[data-scrub]');
  await expect(scrub).toBeVisible();
  const at = async () => Number(await scrub.inputValue());
  const start = await at();
  await expect.poll(at, { timeout: 5000 }).toBeGreaterThan(start);
});

test('closing the board after watching a replay goes back to the report, not a new run', async ({ page }) => {
  await page.route('**/api/seed', (r) => r.fulfill({ json: { seed: 'e2e-leak', token: 'issued-token' } }));
  await page.route('**/api/leaderboard**', (r) => r.fulfill({ json: oneRowBoard }));
  await page.route('**/api/run?**', (r) => r.fulfill({ json: storedRun }));
  await page.goto('/?debug=1');
  await page.waitForFunction(() => !!window.__blast);
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.locator('#over .rp')).toBeVisible({ timeout: 45_000 });
  const finished = await page.evaluate(() => window.__blast!.session.state.tick);
  await page.locator('#over [data-act="board"]').click();
  await page.getByRole('link', { name: /Watch ada's run/ }).click();
  await expect(page).toHaveURL(new RegExp(`#/replay/${RUN_ID}$`));
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/#\/board/);
  await page.keyboard.press('Escape');
  await expect(page.locator('#over .rp')).toBeVisible();
  await expect(page.locator('#rpName')).toBeVisible();
  expect(await page.evaluate(() => window.__blast!.session.state.tick)).toBe(finished);
});

test('Play straight from a link still waits for the server seed that is on its way', async ({ page }) => {
  await page.route('**/api/seed', async (r) => {
    await new Promise((done) => setTimeout(done, 700));
    await r.fulfill({ json: { seed: 'e2e-late', token: 'issued-token' } });
  });
  await page.goto('/#/play');
  await expect(page.locator('[data-seed]')).toHaveText('seed · e2e-late');
});
