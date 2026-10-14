import type { Api } from '../net/client';
import type { BoardScreen } from '../ui/board';
import { dailyDay } from './daily';
import type { Store } from './persist';
import type { BoardName } from './routes';
import { myRunId } from './standing';

/** Fetches a board into the leaderboard screen; a newer request always wins over an older one. */
export class BoardFeed {
  private seq = 0;

  constructor(
    private readonly api: Pick<Api, 'board'>,
    private readonly store: Store,
    private readonly screen: BoardScreen,
  ) {}

  async load(tab: BoardName): Promise<void> {
    const seq = ++this.seq;
    this.screen.render({ k: 'loading' });
    const mine = myRunId(tab, this.store.get(), dailyDay());
    const r = await this.api.board(tab, mine ?? undefined);
    if (seq !== this.seq || !this.screen.open) return;
    if (r.ok && Array.isArray(r.rows)) this.screen.render({ k: 'rows', rows: r.rows, me: r.me ?? null, day: r.day ?? null, mine });
    else if (r.ok || 'offline' in r || r.status === 503) this.screen.render({ k: 'offline' });
    else this.screen.render({ k: 'error', error: r.error });
  }

  /** Drops any answer still on its way (the board was closed). */
  cancel(): void {
    this.seq++;
  }
}
