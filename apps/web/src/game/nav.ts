import { parseRoute, type Route, routeHash, sameRoute } from './routes';

interface NavState {
  /** How many in-app entries sit behind this one. */
  br: number;
}

const depthOf = (state: unknown): number | null => {
  const br = (state as Partial<NavState> | null)?.br;
  return typeof br === 'number' ? br : null;
};

/**
 * Hash routes with a working browser back button. The app moves itself and
 * records the route quietly; back, forward, typed URLs and links come in
 * through the handler.
 */
export class Nav {
  private current: Route = { name: 'title' };
  private depth = 0;

  constructor(private readonly onRoute: (r: Route) => void) {}

  get route(): Route {
    return this.current;
  }

  /** Reads the starting route and listens for history moves. Returns the first route. */
  start(): Route {
    this.depth = depthOf(history.state) ?? 0;
    history.replaceState({ br: this.depth } satisfies NavState, '');
    this.current = parseRoute(location.hash);
    addEventListener('popstate', () => this.arrive());
    addEventListener('hashchange', () => this.arrive());
    return this.current;
  }

  /** Records a move the app already made, as a new history entry. */
  push(r: Route): void {
    if (sameRoute(r, this.current)) return;
    this.depth++;
    history.pushState({ br: this.depth } satisfies NavState, '', routeHash(r));
    this.current = r;
  }

  /** Records a move the app already made, in place of the current entry. */
  replace(r: Route): void {
    history.replaceState({ br: this.depth } satisfies NavState, '', routeHash(r));
    this.current = r;
  }

  /** Goes back if the previous entry is ours; otherwise goes to the fallback. */
  back(fallback: Route): void {
    if (this.depth > 0) {
      history.back();
      return;
    }
    this.replace(fallback);
    this.onRoute(fallback);
  }

  private arrive(): void {
    const r = parseRoute(location.hash);
    const d = depthOf(history.state);
    if (d === null) {
      // a link or a typed hash: a new entry on top of ours
      this.depth++;
      history.replaceState({ br: this.depth } satisfies NavState, '');
    } else this.depth = d;
    if (sameRoute(r, this.current)) return;
    this.current = r;
    this.onRoute(r);
  }
}
