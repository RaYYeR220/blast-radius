import { applyAction } from './actions';
import { generateBoard } from './board';
import {
  MAX_RUN_TICKS,
  SCORE_COMBO,
  SIM_VERSION,
  STALL_TICKS,
  START_AGENTS,
  TUTORIAL_INJECT_TICK,
} from './constants';
import { endGame } from './end';
import { infectionTick, injectGoal, onArrive, revealPass, spawnInject } from './infection';
import { activateNode } from './graph';
import {
  backlog,
  capacity,
  dispatch,
  type FlowHooks,
  movePackets,
  spawnTasks,
  sweepDead,
  taskGoal,
} from './packets';
import { Rng } from './rng';
import type { Action, GameOptions, GameState, SimEvent, UpgradeId } from './types';

export { endGame };

const NO_UPGRADES: Record<UpgradeId, boolean> = {
  sandbox: false,
  rateLimit: false,
  canary: false,
  hitl: false,
  allowlist: false,
  breaker: false,
  rollback: false,
  leastPriv: false,
  fastHeal: false,
  wideBlade: false,
};

export function createEmptyState(o: GameOptions): GameState {
  return {
    v: SIM_VERSION,
    seed: o.seed,
    mode: o.mode,
    rng: new Rng(o.seed),
    tick: 0,
    phase: 'play',
    wave: 1,
    waveStart: 0,
    end: null,
    nodes: [],
    edges: [],
    packets: [],
    nextPacketId: 1,
    user: -1,
    web: -1,
    vault: -1,
    out: -1,
    queue: 0,
    spawnAcc: 0,
    nextDispatchAt: 0,
    credits: 0,
    score: 0,
    shipped: 0,
    spawned: 0,
    converted: 0,
    intercepts: 0,
    lost: 0,
    combos: 0,
    infectedTotal: 0,
    waveInfections: 0,
    stallTicks: 0,
    canaries: 0,
    rollbackReadyAt: 0,
    tutorialDone: false,
    up: { ...NO_UPGRADES },
    offers: [],
    leakPath: null,
    rootPayload: null,
    events: [],
    adjDirty: true,
    adj: [],
  };
}

/** Builds the board and the wave-1 mesh: the user, four agents, then web, vault and out. */
export function createGame(o: GameOptions): GameState {
  const s = createEmptyState(o);
  s.nodes = generateBoard(s.rng);
  s.user = 0;
  s.web = 1;
  s.vault = 2;
  s.out = 3;
  activateNode(s, s.user);
  let agents = 0;
  for (let id = 4; id < s.nodes.length && agents < START_AGENTS; id++) {
    if (activateNode(s, id)) agents++;
  }
  for (const id of [s.web, s.vault, s.out]) {
    if (!activateNode(s, id)) throw new Error(`board ${o.seed}: special node ${id} could not join`);
  }
  s.events = [];
  return s;
}

const hooks: FlowHooks = {
  goalOf: (s, p) => (p.kind === 'task' ? taskGoal(p) : injectGoal(s, p)),
  onArrive,
};

function healEdges(s: GameState): void {
  for (const e of s.edges) {
    if (e.severedUntil === s.tick && !e.removed) {
      e.gapT = -1;
      s.events.push({ tick: s.tick, e: 'heal', edge: e.id });
    }
  }
}

function checkStall(s: GameState): void {
  if (backlog(s) > capacity(s)) s.stallTicks++;
  else s.stallTicks = 0;
  if (s.stallTicks >= STALL_TICKS) {
    s.events.push({ tick: s.tick, e: 'stall' });
    endGame(s, 'stall');
  }
}

function advance(s: GameState): void {
  healEdges(s);
  if (s.wave === 1 && !s.tutorialDone && s.tick === TUTORIAL_INJECT_TICK) {
    s.tutorialDone = true;
    spawnInject(s, s.web, 'plain');
  }
  spawnTasks(s);
  dispatch(s);
  infectionTick(s);
  movePackets(s, hooks);
  if (s.phase === 'play') revealPass(s);
  sweepDead(s);
  if (s.phase === 'play') checkStall(s);
  s.tick++;
  if (s.phase === 'play' && s.tick >= MAX_RUN_TICKS) endGame(s, 'timeout');
}

/**
 * Applies the actions for the current tick, then advances one tick if the
 * game is in play. Returns the events emitted by this call.
 */
export function step(s: GameState, actions: readonly Action[]): SimEvent[] {
  s.events = [];
  const before = s.intercepts;
  for (const a of actions) applyAction(s, a, () => false);
  const n = s.intercepts - before;
  if (n >= 2) {
    s.score += SCORE_COMBO * (n - 1);
    s.combos++;
    s.events.push({ tick: s.tick, e: 'combo', n });
  }
  if (s.phase === 'play') advance(s);
  return s.events;
}
