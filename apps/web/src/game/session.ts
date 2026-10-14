import {
  type Action,
  backlog,
  capacity,
  type GameOptions,
  type GameState,
  type Packet,
  posFromA,
  Recorder,
  type Replay,
  type SimEvent,
} from '@blast/sim';

export interface Sample {
  tick: number;
  backlog: number;
  capacity: number;
  infected: number;
}

type Listener = (e: SimEvent) => void;

/** One run: the live state, its replay log, and what the renderer needs between ticks. */
export class Session {
  readonly state: GameState;
  private readonly rec: Recorder;
  private queued: Action[] = [];
  private readonly listeners = new Set<Listener>();
  /** Packet positions before the latest tick, for interpolation. */
  readonly prev = new Map<number, { x: number; y: number }>();
  /** Backlog and infection, sampled once a second for the postmortem chart. */
  readonly timeline: Sample[] = [];

  constructor(readonly options: GameOptions, state: GameState) {
    this.state = state;
    this.rec = new Recorder(state);
  }

  on(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Queues play actions for the next tick; shop actions apply at once (time is stopped). */
  act(actions: readonly Action[]): void {
    if (actions.length === 0) return;
    if (this.state.phase === 'shop') {
      this.emit(this.rec.step(actions));
      return;
    }
    this.queued.push(...actions);
  }

  tick(): void {
    const s = this.state;
    if (s.phase !== 'play') return;
    this.prev.clear();
    for (const p of s.packets) this.prev.set(p.id, packetXY(s, p));
    const actions = this.queued;
    this.queued = [];
    this.emit(this.rec.step(actions));
    if (s.tick % 60 === 0) {
      this.timeline.push({
        tick: s.tick,
        backlog: backlog(s),
        capacity: capacity(s),
        infected: s.nodes.filter((n) => n.active && n.infection === 2).length,
      });
    }
  }

  replay(): Replay {
    return this.rec.replay();
  }

  private emit(events: readonly SimEvent[]): void {
    for (const e of events) for (const fn of this.listeners) fn(e);
  }
}

/** Where a packet is on the board right now. Packets on a node fan out a little so they stay visible. */
export function packetXY(s: GameState, p: Packet): { x: number; y: number } {
  if (p.edge >= 0) {
    const e = s.edges[p.edge]!;
    const a = s.nodes[e.a]!;
    const b = s.nodes[e.b]!;
    const t = posFromA(s, p);
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }
  const n = s.nodes[p.node]!;
  const k = p.id % 6;
  return { x: n.x + [0, 9, -9, 5, -5, 0][k]!, y: n.y + [0, 4, 4, -8, -8, 10][k]! };
}
