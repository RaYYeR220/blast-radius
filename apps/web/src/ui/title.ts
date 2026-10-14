import type { GameState } from '@blast/sim';
import { isPhone } from '../game/viewport';
import { el, nf, q } from './dom';
import { muteButton } from './icons';

export interface TitleActions {
  play(): void;
  daily(): void;
  board(): void;
}

/** Where the type sits, so the board can clear a space behind it and stay above it on phone. */
export interface TypeArea {
  x: number;
  y: number;
  r: number;
  top: number;
}

const MARKUP = `
<section class="screen" id="title" aria-label="Title" hidden>
  <div class="t-top">
    <span class="t-brand live" aria-hidden="true"><i></i>Blast Radius</span>
    <div class="t-right live">
      <button class="btn neu" type="button" data-act="board">Leaderboard</button>
      ${muteButton('sm')}
    </div>
  </div>
  <div class="t-col">
    <span class="chip"><i></i>an arcade game about prompt injection</span>
    <h1 class="wm" aria-label="Blast Radius"><span aria-hidden="true">Blast</span><span aria-hidden="true">Radius</span></h1>
    <p class="claim"><b>Your agents read the internet.</b> <em>The internet reads back.</em></p>
    <div class="cta live">
      <button class="btn ink play" type="button" data-act="play"><span class="dot"></span>Play</button>
      <button class="btn quiet daily" type="button" data-act="daily">Daily <span class="mono" data-day></span></button>
    </div>
    <nav class="t-links live" aria-label="More">
      <a class="link" href="#/archive" data-archive>incident archive</a>
      <a class="link" href="#/agents">agents can play too</a>
    </nav>
  </div>
  <div class="t-foot">
    <span class="mono" data-live><span class="live-dot"></span>live · bot on shift</span>
    <span class="mono">swipe to cut a link · tap an agent to quarantine it</span>
    <span class="mono">sound starts on your first click</span>
  </div>
</section>`;

/** The landing: wordmark, one claim, Play, a quiet Daily, over a live attract-mode board. */
export class TitleScreen {
  readonly root = el(MARKUP);
  private readonly col = q(this.root, '.t-col');
  private readonly liveLine = q(this.root, '[data-live]');
  private liveAt = 0;

  constructor(parent: HTMLElement, actions: TitleActions) {
    parent.append(this.root);
    q(this.root, '[data-act="play"]').addEventListener('click', () => actions.play());
    q(this.root, '[data-act="daily"]').addEventListener('click', () => actions.daily());
    q(this.root, '[data-act="board"]').addEventListener('click', () => actions.board());
  }

  show(dayLabel: string, archived: number, total: number): void {
    q(this.root, '[data-day]').textContent = dayLabel;
    q(this.root, '[data-archive]').textContent = archived > 0 ? `incident archive · ${archived} of ${total}` : 'incident archive';
    this.root.hidden = false;
  }

  hide(): void {
    this.root.hidden = true;
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  measure(W: number): TypeArea | null {
    if (this.root.hidden) return null;
    const r = this.col.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, r: Math.max(r.width, r.height) * (isPhone(W) ? 0.95 : 0.78), top: r.top };
  }

  /** The footer reports on the bot playing behind the title, twice a second. */
  live(s: GameState, now: number): void {
    if (now - this.liveAt < 500) return;
    this.liveAt = now;
    this.liveLine.innerHTML = `<span class="live-dot"></span>live · bot on wave ${s.wave} · ${nf(s.score)} · ${s.intercepts} intercepts`;
  }
}
