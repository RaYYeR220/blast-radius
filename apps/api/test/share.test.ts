import { describe, expect, it } from 'vitest';
import { sharePage } from '../src/routes/share';

const run = {
  id: '6f1c2a9e-1111-4222-8333-444455556666',
  name: 'ada <script>',
  board: 'daily',
  kind: 'human',
  createdAt: '2026-10-15T10:00:00.000Z',
  summary: { score: 12345, wave: 5, shipped: 300, intercepts: 40, infected: 3, endedBy: 'leak', durationTicks: 9000, rootPayload: 0 },
};

describe('share page', () => {
  it('describes the incident in its preview tags and escapes player text', () => {
    const html = sharePage(run, 'https://blast.test');
    expect(html).toContain('<meta property="og:title"');
    expect(html).toContain('wave 5');
    expect(html).toContain('12,345');
    expect(html).toContain('og:image');
    expect(html).toContain('https://blast.test/#/replay/6f1c2a9e-1111-4222-8333-444455556666');
    expect(html).not.toContain('<script>"');
    expect(html).not.toContain('ada <script>');
    expect(html).toContain('ada &lt;script&gt;');
  });

  it('names a stall plainly', () => {
    const html = sharePage({ ...run, summary: { ...run.summary, endedBy: 'stall', rootPayload: null } }, 'https://blast.test');
    expect(html).toMatch(/stall/i);
  });
});
