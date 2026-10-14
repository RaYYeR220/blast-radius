import { expect, type Page, test } from '@playwright/test';

declare global {
  interface Window {
    __blast?: {
      session: { state: { tick: number; phase: string; intercepts: number; packets: Array<{ kind: string; edge: number; progress: number; from: number; revealed: boolean; id: number }>; edges: Array<{ a: number; b: number }>; nodes: Array<{ x: number; y: number }> } };
      toScreen(bx: number, by: number): { x: number; y: number };
      start?(): void;
    };
  }
}

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('requestfailed', (r) => {
    if (!r.url().includes('/api/')) errors.push(`request failed: ${r.url()}`);
  });
  return errors;
}

async function startGame(page: Page) {
  await page.goto('/?debug=1&seed=e2e-tutorial');
  await page.waitForFunction(() => !!window.__blast);
  await page.evaluate(() => window.__blast?.start?.());
}

test('cold load has no errors', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  await page.waitForTimeout(1500);
  expect(errors).toEqual([]);
});

test('a real swipe across the tutorial injection intercepts it', async ({ page, isMobile }) => {
  const errors = watchErrors(page);
  await startGame(page);
  const target = await page.waitForFunction(
    () => {
      const s = window.__blast!.session.state;
      const p = s.packets.find((q) => q.kind === 'inject' && q.revealed && q.edge >= 0 && q.progress > 0.15 && q.progress < 0.5);
      if (!p) return null;
      const e = s.edges[p.edge]!;
      const A = s.nodes[e.a]!;
      const B = s.nodes[e.b]!;
      const len = Math.hypot(B.x - A.x, B.y - A.y);
      // aim a little ahead of the packet along its path, so the gap catches it even if the stroke is slow
      const ahead = Math.min(1, p.progress + 90 / len);
      const t = p.from === e.a ? ahead : 1 - ahead;
      const x = A.x + (B.x - A.x) * t;
      const y = A.y + (B.y - A.y) * t;
      const nx = -(B.y - A.y) / len;
      const ny = (B.x - A.x) / len;
      const a = window.__blast!.toScreen(x - nx * 70, y - ny * 70);
      const b = window.__blast!.toScreen(x + nx * 70, y + ny * 70);
      return { a, b };
    },
    null,
    { timeout: 30_000, polling: 16 },
  );
  const { a, b } = (await target.jsonValue())!;
  if (isMobile) {
    const cdp = await page.context().newCDPSession(page);
    const pts = (k: number) => [{ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts(0) });
    for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts(i / 8) });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else {
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(a.x + ((b.x - a.x) * i) / 8, a.y + ((b.y - a.y) * i) / 8);
    await page.mouse.up();
  }
  await expect.poll(() => page.evaluate(() => window.__blast!.session.state.intercepts)).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('losing shows the end of the run, and R starts a new one', async ({ page }) => {
  await page.goto('/?debug=1&seed=e2e-leak&autoplay=idle');
  await page.waitForFunction(() => !!window.__blast);
  await page.evaluate(() => window.__blast?.start?.());
  await page.waitForFunction(() => window.__blast!.session.state.phase === 'over', null, { timeout: 45_000 });
  const before = await page.evaluate(() => window.__blast!.session.state.tick);
  expect(before).toBeGreaterThan(0);
  await page.keyboard.press('r');
  await expect.poll(() => page.evaluate(() => window.__blast!.session.state.phase)).toBe('play');
});
