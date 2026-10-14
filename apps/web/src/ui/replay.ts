import type { GameState } from '@blast/sim';
import { mmss } from '../game/incident';
import type { StoredRun } from '../net/client';
import { Diff, el, focusSoon, nf, q, qa, shortDay } from './dom';
import { CLOSE_ICON, muteButton, PAUSE_ICON, PLAY_ICON } from './icons';

export type Speed = 1 | 2 | 4;

export interface ReplayActions {
  toggle(): void;
  speed(x: Speed): void;
  seek(tick: number): void;
  close(): void;
  board(): void;
}

export type ReplayWait = { k: 'loading' } | { k: 'offline' } | { k: 'missing'; error: string };

const MARKUP = `
<section class="screen rv" id="replay" aria-label="Replay" hidden>
  <div class="rv-tag"><span class="who" data-who></span><span class="mono" data-meta></span></div>
  <div class="hud-top">
    <span class="pill"><span class="k">Wave</span><span class="v" data-wave>1</span></span>
    <span class="pill main"><span class="k">Score</span><span class="v" data-score>0</span></span>
  </div>
  <div class="rv-ctl live">
    ${muteButton('sm')}
    <button class="btn neu round sm" type="button" data-act="close" aria-label="Close replay (Esc)">${CLOSE_ICON}</button>
  </div>
  <div class="rv-bar live" data-bar>
    <button class="btn ink" type="button" data-act="toggle" aria-label="Pause (Space)">${PAUSE_ICON}</button>
    <div class="tabs" role="radiogroup" aria-label="Speed">
      <button type="button" role="radio" aria-checked="true" data-speed="1">1×</button><button type="button" role="radio" aria-checked="false" data-speed="2">2×</button><button type="button" role="radio" aria-checked="false" data-speed="4">4×</button>
    </div>
    <input class="scrub" type="range" min="0" max="1" step="1" value="0" aria-label="Position in the run" data-scrub>
    <span class="n" data-time>0:00 / 0:00</span>
  </div>
  <div class="rv-wait" data-wait hidden role="dialog" aria-modal="true" aria-labelledby="rvWait" tabindex="-1">
    <span class="mono">replay</span>
    <h2 id="rvWait" data-wait-h>Loading the run…</h2>
    <p data-wait-p></p>
    <div class="acts"><button class="btn neu" type="button" data-act="board">Leaderboard</button><button class="btn quiet" type="button" data-act="close-wait">Title</button></div>
  </div>
</section>`;

/** Watching a ranked run: the same board, played back, with play/pause, speed and a scrub bar. */
export class ReplayScreen {
  readonly root = el(MARKUP);
  private readonly d = new Diff();
  private readonly scrub = q<HTMLInputElement>(this.root, '[data-scrub]');
  private dragging = false;

  constructor(parent: HTMLElement, actions: ReplayActions) {
    parent.append(this.root);
    q(this.root, '[data-act="toggle"]').addEventListener('click', () => actions.toggle());
    q(this.root, '[data-act="close"]').addEventListener('click', () => actions.close());
    q(this.root, '[data-act="close-wait"]').addEventListener('click', () => actions.close());
    q(this.root, '[data-act="board"]').addEventListener('click', () => actions.board());
    for (const b of qa(this.root, '[data-speed]')) b.addEventListener('click', () => actions.speed(Number(b.dataset.speed) as Speed));
    this.scrub.addEventListener('input', () => {
      this.dragging = true;
      actions.seek(Number(this.scrub.value));
    });
    this.scrub.addEventListener('change', () => {
      this.dragging = false;
      actions.seek(Number(this.scrub.value));
    });
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  get waiting(): boolean {
    return !q(this.root, '[data-wait]').hidden;
  }

  /** Loading, or why the run cannot be shown. */
  wait(w: ReplayWait): void {
    this.root.hidden = false;
    this.controls(false);
    const box = q(this.root, '[data-wait]');
    box.hidden = false;
    const [h, p] =
      w.k === 'loading' ? ['Loading the run…', 'Fetching the recorded moves. The board replays them exactly as they were played.']
      : w.k === 'offline' ? ['The board is offline.', 'This replay could not be loaded right now. Try the link again in a moment.']
      : ['That run is not on the board.', `The server said: ${w.error}.`];
    q(this.root, '[data-wait-h]').textContent = h;
    q(this.root, '[data-wait-p]').textContent = p;
    if (w.k !== 'loading') focusSoon(box);
  }

  show(run: StoredRun, duration: number): void {
    this.root.hidden = false;
    q(this.root, '[data-wait]').hidden = true;
    this.controls(true);
    this.d.clear();
    q(this.root, '[data-who]').textContent = run.name;
    const day = run.replay.seed.startsWith('daily-') ? ` · ${shortDay(run.replay.seed.slice(6))}` : '';
    const sum = run.summary;
    q(this.root, '[data-meta]').textContent = `replay · ${run.board}${day} · ${nf(sum.score)} · wave ${sum.wave} · ${sum.endedBy}`;
    this.scrub.max = String(Math.max(1, duration));
  }

  hide(): void {
    this.root.hidden = true;
  }

  /** Hides the live controls while the end-of-run report is up. */
  controls(on: boolean): void {
    for (const sel of ['.rv-tag', '.hud-top', '.rv-ctl', '[data-bar]']) q(this.root, sel).hidden = !on;
  }

  update(s: GameState, duration: number, playing: boolean, speed: Speed): void {
    const d = this.d;
    d.text(q(this.root, '[data-wave]'), 'wave', String(s.wave));
    d.text(q(this.root, '[data-score]'), 'score', nf(s.score));
    d.text(q(this.root, '[data-time]'), 'time', `${mmss(s.tick)} / ${mmss(duration)}`);
    if (!this.dragging && d.changed('pos', s.tick)) {
      this.scrub.value = String(s.tick);
      this.scrub.style.setProperty('--p', `${(s.tick / Math.max(1, duration)) * 100}%`);
    }
    if (d.changed('playing', playing)) {
      const b = q(this.root, '[data-act="toggle"]');
      b.innerHTML = playing ? PAUSE_ICON : PLAY_ICON;
      b.setAttribute('aria-label', playing ? 'Pause (Space)' : 'Play (Space)');
    }
    if (d.changed('speed', speed)) {
      for (const b of qa(this.root, '[data-speed]')) {
        const on = Number(b.dataset.speed) === speed;
        b.setAttribute('aria-checked', String(on));
      }
    }
  }
}
