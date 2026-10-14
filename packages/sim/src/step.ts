import { generateBoard } from './board';
import { SIM_VERSION, START_AGENTS } from './constants';
import { activateNode } from './graph';
import { Rng } from './rng';
import type { GameOptions, GameState, UpgradeId } from './types';

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
