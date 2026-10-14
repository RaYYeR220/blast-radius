import { describe, expect, it } from 'vitest';
import { parseRoute, routeHash, sameRoute, shareRedirect } from './routes';

describe('routes', () => {
  it('reads every screen from the hash', () => {
    expect(parseRoute('')).toEqual({ name: 'title' });
    expect(parseRoute('#/')).toEqual({ name: 'title' });
    expect(parseRoute('#/play')).toEqual({ name: 'play' });
    expect(parseRoute('#/daily')).toEqual({ name: 'daily' });
    expect(parseRoute('#/board')).toEqual({ name: 'board', tab: null });
    expect(parseRoute('#/board/agents')).toEqual({ name: 'board', tab: 'agents' });
    expect(parseRoute('#/agents')).toEqual({ name: 'agents' });
    expect(parseRoute('#/archive')).toEqual({ name: 'archive' });
    const id = '3f2b8c1e-9d4a-4c55-8f1e-0a1b2c3d4e5f';
    expect(parseRoute(`#/replay/${id}`)).toEqual({ name: 'replay', id });
  });

  it('falls back to the title for anything it does not know', () => {
    expect(parseRoute('#/nope')).toEqual({ name: 'title' });
    expect(parseRoute('#/replay')).toEqual({ name: 'title' });
    expect(parseRoute('#/replay/<script>')).toEqual({ name: 'title' });
    expect(parseRoute('#/board/everyone')).toEqual({ name: 'board', tab: null });
  });

  it('writes the same hash it reads', () => {
    for (const h of ['#/', '#/play', '#/daily', '#/board', '#/board/endless', '#/agents', '#/archive', '#/replay/abc-123']) {
      expect(routeHash(parseRoute(h))).toBe(h);
    }
    expect(sameRoute(parseRoute('#/board'), { name: 'board', tab: null })).toBe(true);
    expect(sameRoute(parseRoute('#/board'), { name: 'board', tab: 'daily' })).toBe(false);
  });

  it('turns share links into replays', () => {
    expect(shareRedirect('/r/3f2b8c1e-9d4a-4c55-8f1e-0a1b2c3d4e5f')).toBe('#/replay/3f2b8c1e-9d4a-4c55-8f1e-0a1b2c3d4e5f');
    expect(shareRedirect('/r/abc/')).toBe('#/replay/abc');
    expect(shareRedirect('/')).toBeNull();
    expect(shareRedirect('/r/')).toBeNull();
  });
});
