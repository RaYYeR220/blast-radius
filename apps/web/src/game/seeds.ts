import type { Mode } from '@blast/sim';
import type { Api } from '../net/client';
import { dailySeed } from './daily';

/** Server tokens live six hours; anything older than this is fetched again. */
const FRESH_MS = 5 * 60 * 60_000;

/** Why a run cannot go on the board. */
export type Unranked = 'offline' | 'custom' | 'autoplay';

/** Everything a run needs to start: its seed, and whether (and with what token) it can be ranked. */
export interface Ticket {
  mode: Extract<Mode, 'endless' | 'daily'>;
  seed: string;
  token?: string;
  unranked: Unranked | null;
}

interface Issued {
  seed: string;
  token: string;
  at: number;
}

export function localSeed(rand: () => number = Math.random, now: number = Date.now()): string {
  return `local-${now.toString(36)}-${Math.floor(rand() * 36 ** 4).toString(36).padStart(4, '0')}`;
}

/**
 * Keeps one server-issued endless seed ready, so Play never waits on the
 * network. When none is ready the run starts on a local seed and is unranked.
 */
export class SeedBank {
  private ready: Issued | null = null;
  private inFlight = false;

  constructor(
    private readonly api: Pick<Api, 'seed'>,
    private readonly now: () => number = Date.now,
  ) {}

  get hasSeed(): boolean {
    return !!this.ready && this.now() - this.ready.at < FRESH_MS;
  }

  prefetch(): void {
    if (this.inFlight || this.hasSeed) return;
    this.inFlight = true;
    void this.api.seed().then((r) => {
      this.inFlight = false;
      if (r.ok && typeof r.seed === 'string' && typeof r.token === 'string') this.ready = { seed: r.seed, token: r.token, at: this.now() };
    });
  }

  /** The ready seed, used once; starts fetching the next. */
  take(): { seed: string; token: string } | null {
    const got = this.hasSeed ? this.ready : null;
    this.ready = null;
    this.prefetch();
    return got && { seed: got.seed, token: got.token };
  }

  /** A ticket for a new run. `custom` (a ?seed= override) and autoplay runs are never ranked. */
  ticket(mode: Ticket['mode'], o: { custom?: string | null; autoplay?: boolean; now?: Date } = {}): Ticket {
    if (o.custom) return { mode, seed: o.custom, unranked: 'custom' };
    const unranked = o.autoplay ? 'autoplay' : null;
    if (mode === 'daily') return { mode, seed: dailySeed(o.now), unranked };
    const issued = o.autoplay ? null : this.take();
    if (issued) return { mode, seed: issued.seed, token: issued.token, unranked: null };
    return { mode, seed: localSeed(), unranked: unranked ?? 'offline' };
  }
}
