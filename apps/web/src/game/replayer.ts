import { createGame, type Replay, runReplay } from '@blast/sim';
import { Session } from './session';

/**
 * Plays a recorded run back through an ordinary Session, so the board renders
 * exactly as it did live. Seeking re-simulates from the start without drawing.
 */
export class ReplayPlayer {
  readonly duration: number;
  session: Session;
  private idx = 0;
  private stuck = false;

  constructor(readonly replay: Replay) {
    this.duration = runReplay(replay).state.tick;
    this.session = this.fresh();
  }

  get done(): boolean {
    return this.stuck || this.session.state.phase === 'over';
  }

  private fresh(): Session {
    this.idx = 0;
    this.stuck = false;
    const o = { seed: this.replay.seed, mode: this.replay.mode };
    return new Session(o, createGame(o));
  }

  /** Advances one recorded step: a tick of play, or the shop choice made at this tick. */
  tick(): void {
    const s = this.session.state;
    if (this.done) return;
    const acts = this.replay.actions;
    const batch = [];
    while (this.idx < acts.length && acts[this.idx]!.tick === s.tick) batch.push(acts[this.idx++]!.a);
    if (s.phase === 'shop') {
      if (batch.length === 0) this.stuck = true;
      else this.session.act(batch);
      return;
    }
    this.session.act(batch);
    this.session.tick();
  }

  seek(target: number): void {
    this.session = this.fresh();
    let guard = 0;
    while (!this.done && this.session.state.tick < target && guard++ < 1_000_000) this.tick();
  }
}
