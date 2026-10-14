import type { Job, Variant } from './types';

/** Bump whenever rules change after scores exist; old replays stop verifying. */
export const SIM_VERSION = 1;

export const TICK_HZ = 60;

// Board (canonical units; the renderer scales and rotates)
export const BOARD_W = 1600;
export const BOARD_H = 1000;
export const MARGIN = 80;
export const MIN_SPACING = 150;
export const MAX_CANDIDATES = 36;
export const MAX_AGENTS = 32;
export const START_AGENTS = 4;
export const AGENTS_PER_WAVE = 2;
export const MAX_DEGREE = 5;
export const NODE_CLEARANCE = 40;
export const SPECIAL_MIN_DIST = 600;

// Movement
export const PACKET_SPEED = 2.4;
export const FAST_MULT = 1.8;
export const RATE_LIMIT_MULT = 0.6;
export const PROCESS_TICKS = 36;
export const REROUTE_TICKS = 10;
export const DISPATCH_TICKS = 6;

// Waves
export const WAVE_TICKS = 1500;
export const TUTORIAL_INJECT_TICK = 360;

// Player tools
export const BLADE_HALF = 22;
export const BLADE_HALF_WIDE = 36;
export const SEVER_TICKS = 180;
export const SEVER_TICKS_FAST = 108;
export const QUARANTINE_TICKS = 300;
export const QUARANTINE_TICKS_SANDBOX = 180;
export const QUARANTINE_COST = 4;
export const QUARANTINE_COST_SANDBOX = 2;
export const REROLL_COST = 3;

// Infection
export const INCUBATION_TICKS = 90;
export const SLEEPER_INCUBATION_TICKS = 360;
export const EMIT_TICKS = 240;
export const ROLLBACK_DELAY = 180;
export const ROLLBACK_COOLDOWN = 900;

// Failure
export const STALL_TICKS = 300;
export const CAPACITY_BASE = 12;
export const CAPACITY_PER_AGENT = 1.5;
export const MAX_RUN_TICKS = 216_000;

// Scoring
export const SCORE_SHIP = 10;
export const SCORE_INTERCEPT = 25;
export const SCORE_COMBO = 50;
export const SCORE_CLEAN_WAVE = 200;
export const SCORE_LOST = -5;

export const taskRate = (wave: number): number => 0.9 + 0.25 * wave;
export const injectChance = (wave: number): number => Math.min(0.1 + 0.05 * wave, 0.45);

export const VARIANT_UNLOCK: Readonly<Record<Variant, number>> = {
  plain: 1,
  fast: 2,
  stealth: 3,
  splitter: 4,
  sleeper: 5,
  hunter: 6,
};
export const VARIANTS: readonly Variant[] = ['plain', 'fast', 'stealth', 'splitter', 'sleeper', 'hunter'];

export const JOB_MIX: Readonly<Record<Job, number>> = { compute: 0.6, research: 0.25, deploy: 0.15 };
export const JOB_MIX_LEAST_PRIV: Readonly<Record<Job, number>> = { compute: 0.67, research: 0.25, deploy: 0.08 };
