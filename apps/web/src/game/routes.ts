export type BoardName = 'daily' | 'endless' | 'agents';

export type Route =
  | { name: 'title' }
  | { name: 'play' }
  | { name: 'daily' }
  | { name: 'board'; tab: BoardName | null }
  | { name: 'replay'; id: string }
  | { name: 'agents' }
  | { name: 'archive' };

const BOARDS: readonly string[] = ['daily', 'endless', 'agents'];
const RUN_ID = /^[0-9A-Za-z-]{1,64}$/;

/** Reads a location hash (`#/board/agents`, `#/replay/<id>`, …); anything unknown is the title. */
export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#?\/?/, '').split('/').filter(Boolean);
  const [head, arg] = parts;
  switch (head) {
    case 'play':
      return { name: 'play' };
    case 'daily':
      return { name: 'daily' };
    case 'board':
      return { name: 'board', tab: arg && BOARDS.includes(arg) ? (arg as BoardName) : null };
    case 'replay':
      return arg && RUN_ID.test(arg) ? { name: 'replay', id: arg } : { name: 'title' };
    case 'agents':
      return { name: 'agents' };
    case 'archive':
      return { name: 'archive' };
    default:
      return { name: 'title' };
  }
}

export function routeHash(r: Route): string {
  switch (r.name) {
    case 'title':
      return '#/';
    case 'board':
      return r.tab ? `#/board/${r.tab}` : '#/board';
    case 'replay':
      return `#/replay/${r.id}`;
    default:
      return `#/${r.name}`;
  }
}

export function sameRoute(a: Route, b: Route): boolean {
  return routeHash(a) === routeHash(b);
}

/** A share link (`/r/<id>`) opened on the static site becomes the replay route. */
export function shareRedirect(pathname: string): string | null {
  const m = /^\/r\/([0-9A-Za-z-]{1,64})\/?$/.exec(pathname);
  return m ? `#/replay/${m[1]}` : null;
}
