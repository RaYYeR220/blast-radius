import type { Rng } from './rng';

export type NodeKind = 'user' | 'web' | 'vault' | 'out' | 'agent';
export type Variant = 'plain' | 'fast' | 'stealth' | 'splitter' | 'sleeper' | 'hunter';
export type PacketKind = 'task' | 'inject';
export type Job = 'compute' | 'research' | 'deploy';
export type Phase = 'play' | 'shop' | 'over';
export type EndReason = 'leak' | 'stall' | 'abandoned' | 'timeout';
export type Mode = 'endless' | 'daily' | 'agent';
export type UpgradeId =
  | 'sandbox'
  | 'rateLimit'
  | 'canary'
  | 'hitl'
  | 'allowlist'
  | 'breaker'
  | 'rollback'
  | 'leastPriv'
  | 'fastHeal'
  | 'wideBlade';

/** 0 = clean, 1 = incubating, 2 = infected */
export type Infection = 0 | 1 | 2;

export interface SimNode {
  id: number;
  kind: NodeKind;
  x: number;
  y: number;
  active: boolean;
  activatedAt: number;
  quarantinedUntil: number;
  infection: Infection;
  incubateUntil: number;
  incubVariant: Variant | null;
  infectedAt: number;
  nextEmitAt: number;
  degree: number;
  /** Injection text that infected this agent (−1 = none); copies inherit it. */
  payload: number;
  incubPayload: number;
}

/** Endpoints are stored with a < b; gapT is measured from a (−1 = no gap). */
export interface SimEdge {
  id: number;
  a: number;
  b: number;
  len: number;
  peer: boolean;
  removed: boolean;
  severedUntil: number;
  gapT: number;
}

export interface Packet {
  id: number;
  kind: PacketKind;
  variant: Variant | null;
  job: Job;
  agent: number;
  stops: number[];
  stopIdx: number;
  /** Node the packet sits on, or −1 while travelling. */
  node: number;
  /** Edge the packet travels on, or −1 while at a node. */
  edge: number;
  from: number;
  to: number;
  /** 0..1 along from→to. */
  progress: number;
  waitUntil: number;
  processing: boolean;
  secret: boolean;
  revealed: boolean;
  payload: number;
  spawnedAt: number;
  hunterDone: boolean;
  /** Node ids visited, used to draw the leak path. */
  trail: number[];
  /** Set when the packet leaves play; dead packets are swept at the end of a step. */
  dead: boolean;
}

export type Action =
  | { type: 'cut'; edge: number; t: number }
  | { type: 'quarantine'; node: number }
  | { type: 'pick'; slot: 0 | 1 | 2 }
  | { type: 'reroll' }
  | { type: 'skip' };

type EventBody =
  | { e: 'spawn'; packet: number }
  | { e: 'ship'; packet: number; job: Job }
  | { e: 'cut'; edge: number; t: number }
  | { e: 'intercept'; packet: number; edge: number; variant: Variant | null }
  | { e: 'combo'; n: number }
  | { e: 'lost'; packet: number }
  | { e: 'convert'; packet: number; at: number }
  | { e: 'incubate'; node: number; variant: Variant | null }
  | { e: 'infect'; node: number }
  | { e: 'quarantine'; node: number; auto: boolean }
  | { e: 'secret'; packet: number }
  | { e: 'reveal'; packet: number }
  | { e: 'canary'; packet: number }
  | { e: 'leak'; packet: number; path: number[] }
  | { e: 'stall' }
  | { e: 'grow'; node: number }
  | { e: 'edge'; edge: number }
  | { e: 'heal'; edge: number }
  | { e: 'wave'; wave: number }
  | { e: 'shop' }
  | { e: 'reject'; action: Action; reason: string }
  | { e: 'over'; reason: EndReason };

export type SimEvent = { tick: number } & EventBody;

export interface Offer {
  id: UpgradeId;
  price: number;
}

export interface GameOptions {
  seed: string;
  mode: Mode;
}

export interface GameState {
  v: number;
  seed: string;
  mode: Mode;
  rng: Rng;
  tick: number;
  phase: Phase;
  wave: number;
  waveStart: number;
  end: EndReason | null;
  nodes: SimNode[];
  edges: SimEdge[];
  packets: Packet[];
  nextPacketId: number;
  user: number;
  web: number;
  vault: number;
  out: number;
  queue: number;
  spawnAcc: number;
  nextDispatchAt: number;
  credits: number;
  score: number;
  shipped: number;
  spawned: number;
  converted: number;
  intercepts: number;
  lost: number;
  combos: number;
  infectedTotal: number;
  waveInfections: number;
  stallTicks: number;
  canaries: number;
  rollbackReadyAt: number;
  nextWebEmitAt: number;
  waveQuarantines: number;
  tutorialDone: boolean;
  up: Record<UpgradeId, boolean>;
  offers: Offer[];
  leakPath: number[] | null;
  rootPayload: number | null;
  events: SimEvent[];
  adjDirty: boolean;
  /** node id → incident edge ids, ascending */
  adj: number[][];
  /** Test-only hooks consumed by dispatch. */
  forceJob?: Job;
  forceAgent?: number;
}
