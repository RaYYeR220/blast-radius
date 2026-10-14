// Regenerates test/fixtures/golden.json. Run only when the rules change on purpose.
import { writeFileSync } from 'node:fs';
import { stateHash } from '../src/hash';
import { Recorder, runReplay } from '../src/replay';
import { Rng } from '../src/rng';
import { createGame } from '../src/step';
import { randomPolicy } from './policy';

const out = [];
for (const seed of ['golden-a', 'golden-b', 'golden-c', 'daily-2026-10-16', 'golden-e']) {
  const s = createGame({ seed, mode: 'endless' });
  const rec = new Recorder(s);
  const pol = new Rng(`golden-policy-${seed}`);
  for (let i = 0; i < 200_000 && s.phase !== 'over'; i++) rec.step(randomPolicy(s, pol, true));
  const replay = rec.replay();
  const r = runReplay(replay);
  out.push({ replay, hash: stateHash(r.state), score: r.state.score, end: r.state.end, ticks: r.state.tick });
}
writeFileSync(new URL('./fixtures/golden.json', import.meta.url), JSON.stringify(out) + '\n');
console.log(out.map((g) => `${g.replay.seed}: ${g.end} @${g.ticks} score ${g.score} actions ${g.replay.actions.length}`).join('\n'));
