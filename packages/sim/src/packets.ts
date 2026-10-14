import {
  CAPACITY_BASE,
  CAPACITY_PER_AGENT,
  DISPATCH_TICKS,
  FAST_MULT,
  INJECT_SPEED_MULT,
  JOB_MIX,
  JOB_MIX_LEAST_PRIV,
  PACKET_SPEED,
  PROCESS_TICKS,
  RATE_LIMIT_MULT,
  REROUTE_TICKS,
  SCORE_INTERCEPT,
  SCORE_LOST,
  SCORE_SHIP,
  TICK_HZ,
  taskRate,
} from './constants';
import { otherEnd } from './graph';
import { nextHop } from './routing';
import type { GameState, Job, Packet } from './types';

export type DestroyCause = 'cut' | 'gap' | 'quarantine' | 'breaker';

/** Arrival hooks for injected packets live in infection.ts; they are wired in by step.ts. */
export interface FlowHooks {
  goalOf(s: GameState, p: Packet): number;
  onArrive(s: GameState, p: Packet, node: number): void;
}

export function newPacket(s: GameState, job: Job, agent: number, stops: number[], at: number): Packet {
  const p: Packet = {
    id: s.nextPacketId++,
    kind: 'task',
    variant: null,
    job,
    agent,
    stops,
    stopIdx: 0,
    node: at,
    edge: -1,
    from: at,
    to: at,
    progress: 0,
    waitUntil: s.tick,
    processing: false,
    secret: false,
    revealed: true,
    payload: 0,
    spawnedAt: s.tick,
    hunterDone: false,
    trail: [at],
    dead: false,
  };
  s.packets.push(p);
  return p;
}

export function activeAgentCount(s: GameState): number {
  let c = 0;
  for (const n of s.nodes) if (n.active && n.kind === 'agent') c++;
  return c;
}

export function capacity(s: GameState): number {
  return Math.floor(CAPACITY_BASE + CAPACITY_PER_AGENT * activeAgentCount(s));
}

export function backlog(s: GameState): number {
  let live = 0;
  for (const p of s.packets) if (!p.dead && p.kind === 'task') live++;
  return s.queue + live;
}

export function spawnTasks(s: GameState): void {
  s.spawnAcc += taskRate(s.wave) / TICK_HZ;
  while (s.spawnAcc >= 1) {
    s.spawnAcc -= 1;
    s.queue++;
    s.spawned++;
  }
}

function drawJob(s: GameState): Job {
  const mix = s.up.leastPriv ? JOB_MIX_LEAST_PRIV : JOB_MIX;
  const r = s.rng.next();
  if (r < mix.compute) return 'compute';
  if (r < mix.compute + mix.research) return 'research';
  return 'deploy';
}

function stopsFor(s: GameState, job: Job, agent: number): number[] {
  if (job === 'research') return [agent, s.web, agent, s.user];
  if (job === 'deploy') return [agent, s.vault, agent, s.user];
  return [agent, s.user];
}

/** Sends the next queued task out of the user node when a route exists. */
export function dispatch(s: GameState): void {
  if (s.queue <= 0 || s.tick < s.nextDispatchAt) return;
  s.nextDispatchAt = s.tick + DISPATCH_TICKS;
  const agents = s.nodes.filter((n) => n.active && n.kind === 'agent' && n.quarantinedUntil <= s.tick);
  if (agents.length === 0) return;
  const job = s.forceJob ?? drawJob(s);
  const agent = s.forceAgent ?? agents[s.rng.int(agents.length)]!.id;
  if (nextHop(s, s.user, agent) === -1) return;
  s.forceJob = undefined;
  s.forceAgent = undefined;
  s.queue--;
  const p = newPacket(s, job, agent, stopsFor(s, job, agent), s.user);
  s.events.push({ tick: s.tick, e: 'spawn', packet: p.id });
}

/** Removes a packet from play. Lost tasks go back into the queue; cut injects score. */
export function destroy(s: GameState, p: Packet, cause: DestroyCause): void {
  if (p.dead) return;
  p.dead = true;
  if (p.kind === 'task') {
    s.queue++;
    s.lost++;
    if (cause === 'cut' || cause === 'gap') s.score += SCORE_LOST;
    s.events.push({ tick: s.tick, e: 'lost', packet: p.id });
    return;
  }
  if (!p.revealed) {
    p.revealed = true;
    s.events.push({ tick: s.tick, e: 'reveal', packet: p.id });
  }
  if (cause !== 'quarantine') {
    s.intercepts++;
    s.score += SCORE_INTERCEPT;
    s.events.push({ tick: s.tick, e: 'intercept', packet: p.id, edge: p.edge, variant: p.variant });
  }
}

function ship(s: GameState, p: Packet): void {
  p.dead = true;
  s.shipped++;
  s.score += Math.round(SCORE_SHIP * (1 + 0.1 * s.wave));
  s.credits += p.job === 'compute' ? 1 : 2;
  s.events.push({ tick: s.tick, e: 'ship', packet: p.id, job: p.job });
}

/** Position along the edge measured from its lower-id endpoint `a`. */
export function posFromA(s: GameState, p: Packet): number {
  const e = s.edges[p.edge]!;
  return p.from === e.a ? p.progress : 1 - p.progress;
}

function speedOn(s: GameState, p: Packet): number {
  const e = s.edges[p.edge]!;
  let v = PACKET_SPEED;
  if (p.kind === 'inject') v *= INJECT_SPEED_MULT;
  if (p.variant === 'fast') v *= FAST_MULT;
  if (s.up.rateLimit && (e.a === s.vault || e.b === s.vault)) v *= RATE_LIMIT_MULT;
  return v;
}

function arriveTask(s: GameState, p: Packet, node: number): void {
  const goal = p.stops[p.stopIdx]!;
  if (node !== goal) return;
  if (node === s.user && p.stopIdx === p.stops.length - 1) {
    ship(s, p);
    return;
  }
  if (s.nodes[node]!.kind === 'agent') {
    p.processing = true;
    p.waitUntil = s.tick + PROCESS_TICKS;
    return;
  }
  p.stopIdx++;
}

function arrive(s: GameState, p: Packet, node: number, hooks: FlowHooks): void {
  p.edge = -1;
  p.node = node;
  p.progress = 0;
  p.trail.push(node);
  if (s.nodes[node]!.quarantinedUntil > s.tick) {
    destroy(s, p, 'quarantine');
    return;
  }
  hooks.onArrive(s, p, node);
  if (p.dead || p.kind !== 'task') return;
  arriveTask(s, p, node);
}

export function taskGoal(p: Packet): number {
  return p.stops[p.stopIdx]!;
}

/** Advances every packet by one tick, in ascending id order. */
export function movePackets(s: GameState, hooks: FlowHooks): void {
  const tick = s.tick;
  for (const p of s.packets) {
    if (p.dead) continue;
    if (p.edge === -1) {
      if (p.waitUntil > tick) continue;
      if (p.processing) {
        p.processing = false;
        p.stopIdx++;
      }
      const goal = hooks.goalOf(s, p);
      if (goal === p.node) continue;
      const eid = nextHop(s, p.node, goal);
      if (eid === -1) {
        p.waitUntil = tick + REROUTE_TICKS;
        continue;
      }
      const e = s.edges[eid]!;
      p.edge = eid;
      p.from = p.node;
      p.to = otherEnd(e, p.node);
      p.progress = 0;
      p.node = -1;
    }
    const e = s.edges[p.edge]!;
    const before = posFromA(s, p);
    p.progress += speedOn(s, p) / e.len;
    if (p.progress > 1) p.progress = 1;
    const after = posFromA(s, p);
    if (e.severedUntil > tick && e.gapT >= 0) {
      const lo = Math.min(before, after);
      const hi = Math.max(before, after);
      if (e.gapT >= lo && e.gapT <= hi) {
        destroy(s, p, 'gap');
        continue;
      }
    }
    if (p.progress >= 1) arrive(s, p, p.to, hooks);
  }
}

export function sweepDead(s: GameState): void {
  if (s.packets.some((p) => p.dead)) s.packets = s.packets.filter((p) => !p.dead);
}
