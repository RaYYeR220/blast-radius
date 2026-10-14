import { createGame, type GameOptions, type GameState } from '@blast/sim';
import { type Bot, type BotKind, makeBot } from '@blast/sim/bots';
import type { RunOutcome } from './progress';
import { Tally } from './record';
import type { Ticket } from './seeds';
import { Session } from './session';
import type { Submission } from './submit';

/** One live run: its session, how it can be ranked, and what it has collected so far. */
export class Run {
  readonly session: Session;
  readonly tally = new Tally();
  readonly bot: Bot | null;
  /** Show the ghost blade until the first intercept. */
  tutorial: boolean;
  /** When the run ended (performance.now ms); 0 while it is going. */
  overAt = 0;
  reported = false;
  outcome: RunOutcome | null = null;
  submission: Submission | null = null;

  constructor(readonly ticket: Ticket, bot: BotKind | null, tutorial: boolean) {
    const opts: GameOptions = { seed: ticket.seed, mode: ticket.mode };
    this.session = new Session(opts, createGame(opts));
    this.bot = bot ? makeBot(bot, ticket.seed) : null;
    this.tutorial = tutorial && !bot;
    this.session.on((e) => this.tally.onEvent(this.session.state, e));
  }

  get state(): GameState {
    return this.session.state;
  }

  /** The UTC day this run counts for: the daily's own day, or today for endless. */
  day(today: string): string {
    return this.ticket.mode === 'daily' ? this.ticket.seed.slice('daily-'.length) : today;
  }
}

/** Runs a session synchronously with a bot, no drawing or sound: for the attract board and debug screens. */
export function fastForward(sess: Session, bot: Bot, until: (s: GameState) => boolean, maxTicks: number, onTick?: () => void): boolean {
  for (let i = 0; i < maxTicks; i++) {
    const s = sess.state;
    if (until(s)) return true;
    if (s.phase === 'over') return false;
    if (s.phase === 'shop') {
      sess.act(bot(s));
      continue;
    }
    sess.act(bot(s));
    sess.tick();
    onTick?.();
  }
  return until(sess.state);
}

/** The bot game behind the title, already a few waves in. */
export class Attract {
  readonly session: Session;
  readonly bot: Bot;
  overAt = 0;

  constructor(seed = `attract-${(Date.now() / 86_400_000) | 0}-${(Math.random() * 1e4) | 0}`) {
    const opts: GameOptions = { seed, mode: 'endless' };
    this.session = new Session(opts, createGame(opts));
    this.bot = makeBot('heuristic', seed);
    fastForward(this.session, this.bot, (s) => s.tick > 6200 && s.phase === 'play', 14_000);
  }
}
