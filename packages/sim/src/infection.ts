import {
  EMIT_TICKS,
  INCUBATION_TICKS,
  SLEEPER_INCUBATION_TICKS,
  VARIANTS,
  VARIANT_UNLOCK,
  injectChance,
} from './constants';
import { endGame } from './end';
import { newPacket } from './packets';
import { INJECTIONS } from './payloads';
import type { GameState, Packet, SimNode, Variant } from './types';

export function variantFor(s: GameState): Variant {
  const pool = VARIANTS.filter((v) => VARIANT_UNLOCK[v] <= s.wave);
  return s.rng.pick(pool);
}

function drawPayload(s: GameState): number {
  return s.rng.int(INJECTIONS.length);
}

/** Creates an injected packet sitting at `at`. */
export function spawnInject(s: GameState, at: number, variant: Variant, payload?: number): Packet {
  const p = newPacket(s, 'compute', -1, [], at);
  p.kind = 'inject';
  p.variant = variant;
  p.payload = payload ?? drawPayload(s);
  p.revealed = variant !== 'stealth';
  s.events.push({ tick: s.tick, e: 'spawn', packet: p.id });
  return p;
}

/** Turns a task into an injected packet where it stands. */
export function convertToInject(s: GameState, p: Packet, variant: Variant, payload?: number): void {
  if (p.kind === 'task') s.converted++;
  p.kind = 'inject';
  p.variant = variant;
  p.payload = payload ?? drawPayload(s);
  p.revealed = variant !== 'stealth';
  p.processing = false;
  p.waitUntil = s.tick;
  p.secret = false;
  p.trail = [p.node];
  s.events.push({ tick: s.tick, e: 'convert', packet: p.id, at: p.node });
}

/** The busiest reachable agent: highest degree, ties to the lowest id. */
export function huntTarget(s: GameState): number {
  let best = -1;
  let bestDeg = -1;
  for (const n of s.nodes) {
    if (!n.active || n.kind !== 'agent' || n.quarantinedUntil > s.tick) continue;
    if (n.degree > bestDeg) {
      best = n.id;
      bestDeg = n.degree;
    }
  }
  return best;
}

export function injectGoal(s: GameState, p: Packet): number {
  if (p.variant === 'hunter' && !p.hunterDone) {
    const hub = huntTarget(s);
    if (hub >= 0 && hub !== p.node) return hub;
    p.hunterDone = true;
  }
  return p.secret ? s.out : s.vault;
}

function startIncubation(s: GameState, n: SimNode, variant: Variant | null, payload: number): void {
  n.infection = 1;
  n.incubVariant = variant;
  n.incubPayload = payload;
  n.incubateUntil = s.tick + (variant === 'sleeper' ? SLEEPER_INCUBATION_TICKS : INCUBATION_TICKS);
  s.events.push({ tick: s.tick, e: 'incubate', node: n.id, variant });
}

function reveal(s: GameState, p: Packet): void {
  if (p.revealed) return;
  p.revealed = true;
  s.events.push({ tick: s.tick, e: 'reveal', packet: p.id });
}

function reachOut(s: GameState, p: Packet): void {
  if (s.canaries > 0) {
    s.canaries--;
    p.dead = true;
    s.events.push({ tick: s.tick, e: 'canary', packet: p.id });
    return;
  }
  s.leakPath = [...p.trail];
  s.rootPayload = p.payload;
  s.events.push({ tick: s.tick, e: 'leak', packet: p.id, path: s.leakPath });
  endGame(s, 'leak');
}

/** Called for every packet arriving at a node, before ordinary task handling. */
export function onArrive(s: GameState, p: Packet, node: number): void {
  const n = s.nodes[node]!;
  if (p.kind === 'task') {
    if (node === s.web && p.job === 'research' && p.stops[p.stopIdx] === s.web) {
      if (s.rng.chance(injectChance(s.wave))) convertToInject(s, p, variantFor(s));
      return;
    }
    if (n.kind === 'agent' && n.infection === 2) convertToInject(s, p, 'plain', n.payload);
    return;
  }
  if (p.variant === 'hunter' && !p.hunterDone && node === huntTarget(s)) p.hunterDone = true;
  if (n.kind === 'agent' && n.infection === 0) {
    startIncubation(s, n, p.variant, p.payload);
    if (p.variant === 'splitter') {
      spawnInject(s, node, 'plain', p.payload);
      spawnInject(s, node, 'plain', p.payload);
    }
    return;
  }
  if (node === s.vault && !p.secret) {
    p.secret = true;
    reveal(s, p);
    s.events.push({ tick: s.tick, e: 'secret', packet: p.id });
    return;
  }
  if (node === s.out && p.secret) reachOut(s, p);
}

/** Incubation timers and emission from infected agents. Runs before movement. */
export function infectionTick(s: GameState): void {
  for (const n of s.nodes) {
    if (!n.active || n.kind !== 'agent') continue;
    if (n.infection === 1 && s.tick >= n.incubateUntil) {
      n.infection = 2;
      n.infectedAt = s.tick;
      n.nextEmitAt = s.tick + EMIT_TICKS;
      n.payload = n.incubPayload;
      s.infectedTotal++;
      s.waveInfections++;
      s.events.push({ tick: s.tick, e: 'infect', node: n.id });
    }
    if (n.infection === 2 && n.quarantinedUntil <= s.tick && s.tick >= n.nextEmitAt) {
      spawnInject(s, n.id, 'plain', n.payload);
      n.nextEmitAt = s.tick + EMIT_TICKS;
    }
  }
}

/** Stealth packets show themselves once they are one hop from the vault. */
export function revealPass(s: GameState): void {
  for (const p of s.packets) {
    if (p.dead || p.kind !== 'inject' || p.revealed) continue;
    if (p.secret || p.node === s.vault || (p.edge >= 0 && p.to === s.vault)) reveal(s, p);
  }
}
