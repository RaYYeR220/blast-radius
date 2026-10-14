// Plays every bot over many seeds and prints the balance table used in the README.
import { type BotKind, runBot } from '@blast/sim/bots';

const SEEDS = Number(process.argv[2] ?? 200);
const KINDS: BotKind[] = ['idle', 'denyAll', 'sloppy', 'heuristic'];
const pct = (n: number) => `${Math.round(n * 1000) / 10}%`;
const at = (xs: number[], q: number) => xs[Math.min(xs.length - 1, Math.floor(xs.length * q))]!;

const rows = ['| Bot | Leak | Stall | Wave p10 / median / p90 | Median run | Median score |', '|---|---|---|---|---|---|'];
for (const kind of KINDS) {
  const runs = Array.from({ length: SEEDS }, (_, i) => runBot(kind, `balance-${i}`));
  const waves = runs.map((r) => r.wave).sort((a, b) => a - b);
  const secs = runs.map((r) => r.durationTicks / 60).sort((a, b) => a - b);
  const scores = runs.map((r) => r.score).sort((a, b) => a - b);
  const leak = runs.filter((r) => r.endedBy === 'leak').length / SEEDS;
  const stall = runs.filter((r) => r.endedBy === 'stall').length / SEEDS;
  rows.push(
    `| \`${kind}\` | ${pct(leak)} | ${pct(stall)} | ${at(waves, 0.1)} / ${at(waves, 0.5)} / ${at(waves, 0.9)} | ${Math.round(at(secs, 0.5))} s | ${at(scores, 0.5)} |`,
  );
}
console.log(`Bots over ${SEEDS} seeds:\n`);
console.log(rows.join('\n'));
