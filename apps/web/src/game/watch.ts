import { MAX_REPLAY_ENTRIES, type Replay } from '@blast/sim';
import type { Api, StoredRun } from '../net/client';
import type { ReplayWait, Speed } from '../ui/replay';
import { ReplayPlayer } from './replayer';
import type { Session } from './session';

export interface WatchHooks {
  /** A session to draw: a fresh one after loading or seeking. Events are muted while `quiet()` is true. */
  attach(sess: Session, intro: boolean): void;
  loaded(run: StoredRun, duration: number): void;
  failed(w: ReplayWait): void;
}

function wellFormed(r: unknown): r is Replay {
  const x = r as Partial<Replay> | null;
  return !!x && typeof x.seed === 'string' && (x.mode === 'daily' || x.mode === 'endless' || x.mode === 'agent') &&
    Array.isArray(x.actions) && x.actions.length <= MAX_REPLAY_ENTRIES;
}

/** Plays a stored run back through the live renderer: load, play/pause, speed, and seeking. */
export class Watch {
  player: ReplayPlayer | null = null;
  run: StoredRun | null = null;
  playing = true;
  speed: Speed = 1;
  /** When the replayed run ended (performance.now ms). */
  overAt = 0;
  reported = false;
  /** True while seeking forward, so skipped ticks make no sound or effects. */
  quiet = false;
  private seq = 0;
  private seekTo: number | null = null;

  constructor(private readonly api: Pick<Api, 'run'>, private readonly hooks: WatchHooks) {}

  get session(): Session | null {
    return this.player?.session ?? null;
  }

  get duration(): number {
    return this.player?.duration ?? 0;
  }

  get done(): boolean {
    return !!this.player?.done;
  }

  async load(id: string): Promise<void> {
    this.stop();
    const seq = ++this.seq;
    this.hooks.failed({ k: 'loading' });
    const r = await this.api.run(id);
    if (seq !== this.seq) return;
    if (!r.ok) {
      this.hooks.failed('offline' in r || r.status === 503 ? { k: 'offline' } : { k: 'missing', error: r.error });
      return;
    }
    if (!wellFormed(r.replay)) {
      this.hooks.failed({ k: 'missing', error: 'the recorded moves could not be read' });
      return;
    }
    let player: ReplayPlayer;
    try {
      player = new ReplayPlayer(r.replay);
    } catch {
      this.hooks.failed({ k: 'missing', error: 'the recorded moves could not be replayed' });
      return;
    }
    this.player = player;
    this.run = r;
    this.playing = true;
    this.hooks.attach(player.session, true);
    this.hooks.loaded(r, player.duration);
  }

  /** Forgets the current replay, and any load still in flight. */
  stop(): void {
    this.seq++;
    this.player = null;
    this.run = null;
    this.overAt = 0;
    this.reported = false;
    this.seekTo = null;
    this.speed = 1;
  }

  tick(): void {
    if (this.playing && this.player && !this.player.done) this.player.tick();
  }

  toggle(): void {
    if (!this.player) return;
    if (this.player.done) this.again();
    else this.playing = !this.playing;
  }

  again(): void {
    this.seek(0);
    this.playing = true;
  }

  /** Queues a seek; applied once per frame so dragging the scrub bar stays smooth. */
  seek(tick: number): void {
    this.seekTo = Math.max(0, Math.min(this.duration, Math.round(tick)));
  }

  /** Applies a queued seek. Forward seeks run on from here; backward ones re-simulate from the start. */
  applySeek(): void {
    const p = this.player;
    const to = this.seekTo;
    this.seekTo = null;
    if (!p || to === null) return;
    const cur = p.session.state.tick;
    if (to === cur) return;
    if (to > cur && !p.done) {
      this.quiet = true;
      let guard = 0;
      while (!p.done && p.session.state.tick < to && guard++ < 1_000_000) p.tick();
      this.quiet = false;
      this.hooks.attach(p.session, false);
    } else {
      p.seek(to);
      this.hooks.attach(p.session, false);
    }
    this.reported = false;
    this.overAt = p.done ? performance.now() : 0;
  }
}
