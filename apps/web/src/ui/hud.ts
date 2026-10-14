import { backlog, capacity, type GameState, quarantineCost, STALL_TICKS, TICK_HZ, UPGRADES, type UpgradeId } from '@blast/sim';
import { clamp } from '../render/drift/math';
import { Diff, el, nf, q, replay } from './dom';
import { muteButton, PAUSE_ICON } from './icons';
import { Toast } from './toast';

export interface HudActions {
  pause(): void;
}

/** Human in the Loop meter: shown only while the upgrade is owned. */
export interface SlowMeter {
  owned: boolean;
  meter: number;
  active: boolean;
  /** Ran dry and is refilling before it works again. */
  dry: boolean;
  phone: boolean;
}

const MARKUP = `
<section class="screen" id="hud" aria-label="Game" hidden>
  <div class="hud-tag"><span class="mono" data-seed></span><div class="ups" data-ups></div></div>
  <div class="toast" role="status" aria-live="polite"><svg viewBox="-10 -10 20 20" aria-hidden="true"></svg><b></b><span></span></div>
  <div class="hud-top">
    <span class="pill"><span class="k">Wave</span><span class="v" data-wave>1</span></span>
    <span class="pill main"><span class="k">Score</span><span class="v" data-score>0</span></span>
    <span class="pill" data-cred-pill><span class="k">Credits</span><span class="v" data-cred>0</span><span class="sub" data-q><i></i>quarantine 4</span></span>
    <span class="pill canary" data-canary hidden><span class="k">Canary</span><span class="v" data-canaries>0</span></span>
  </div>
  <div class="hud-ctl live">
    ${muteButton('')}
    <button class="btn neu round" type="button" data-act="pause" aria-label="Pause (Esc)">${PAUSE_ICON}</button>
  </div>
  <div class="pill back" data-back><span class="k">Backlog</span><div class="bar"><i data-fill></i><b data-cap></b></div><span class="n" data-backn>0/21</span><span class="stall" data-stall></span></div>
  <div class="stamp" data-stamp hidden><span class="mono" data-stamp-k>stall in</span><b data-stamp-v>5.0</b></div>
  <div class="hitl" data-hitl hidden><span data-hitl-k>human in the loop</span><div class="bar"><i data-hitl-fill></i></div><kbd data-hitl-key>Space</kbd></div>
</section>`;

const END_WORD: Record<string, [string, string]> = {
  leak: ['the key left through outbound', 'Leak'],
  stall: ['the swarm stopped shipping', 'Stall'],
};

/** Score, wave, credits and the backlog bar, in pills over the board. */
export class Hud {
  readonly root = el(MARKUP);
  readonly toast = new Toast(q(this.root, '.toast'));
  private readonly d = new Diff();
  private readonly $ = <T extends HTMLElement = HTMLElement>(sel: string) => q<T>(this.root, sel);
  private readonly back = this.$('[data-back]');
  private readonly score = this.$('[data-score]');
  private readonly hitl = this.$('[data-hitl]');
  private lastScore = -1;

  constructor(parent: HTMLElement, actions: HudActions) {
    parent.append(this.root);
    this.$('[data-act="pause"]').addEventListener('click', () => actions.pause());
  }

  show(): void {
    this.root.hidden = false;
  }

  hide(): void {
    this.root.hidden = true;
  }

  /** A new run: forget every cached value. */
  reset(): void {
    this.d.clear();
    this.lastScore = -1;
    this.toast.hide();
  }

  /** The credits pill shakes when a quarantine is refused for money. */
  deny(): void {
    const pill = this.$('[data-cred-pill]');
    replay(pill, 'deny');
    setTimeout(() => pill.classList.remove('deny'), 600);
  }

  update(s: GameState, tag: string, slow: SlowMeter): void {
    const d = this.d;
    d.text(this.$('[data-wave]'), 'wave', String(s.wave));
    if (this.lastScore >= 0 && s.score > this.lastScore + 20) replay(this.score, 'bump');
    this.lastScore = s.score;
    d.text(this.score, 'score', nf(s.score));
    d.text(this.$('[data-cred]'), 'cred', String(s.credits));
    const qc = quarantineCost(s);
    const qEl = this.$('[data-q]');
    if (d.changed('q', `${qc}:${s.credits >= qc}`)) {
      qEl.innerHTML = `<i></i>quarantine ${qc}`;
      qEl.classList.toggle('ready', s.credits >= qc);
    }
    this.updateBacklog(s);
    this.updateCanary(s);
    this.updateStamp(s);
    const ups = (Object.keys(s.up) as UpgradeId[]).filter((k) => s.up[k] && k !== 'canary').map((k) => UPGRADES[k].name);
    if (d.changed('ups', ups.join('|'))) {
      const box = this.$('[data-ups]');
      box.replaceChildren(...ups.map((n) => Object.assign(document.createElement('span'), { textContent: n })));
    }
    d.text(this.$('[data-seed]'), 'seed', tag);
    this.updateSlow(slow);
  }

  private updateBacklog(s: GameState): void {
    const d = this.d;
    const bl = backlog(s);
    const cap = capacity(s);
    const max = cap * 1.3;
    d.text(this.$('[data-backn]'), 'back', `${bl}/${cap}`);
    const fw = `${(clamp(bl / max, 0, 1) * 100).toFixed(1)}%`;
    if (d.changed('fw', fw)) this.$('[data-fill]').style.width = fw;
    const cp = `${((cap / max) * 100).toFixed(1)}%`;
    if (d.changed('cp', cp)) this.$('[data-cap]').style.left = cp;
    d.cls(this.back, 'warn', bl / cap > 0.82);
    d.cls(this.back, 'over', bl > cap);
    const stalling = s.stallTicks > 0 && s.phase === 'play';
    d.cls(this.back, 'stalling', stalling);
    if (stalling) d.text(this.$('[data-stall]'), 'stall', `stall in ${((STALL_TICKS - s.stallTicks) / TICK_HZ).toFixed(1)}s`);
  }

  private updateCanary(s: GameState): void {
    const owned = !!s.up.canary;
    const pill = this.$('[data-canary]');
    if (this.d.changed('can', owned)) pill.hidden = !owned;
    if (!owned) return;
    this.d.text(this.$('[data-canaries]'), 'canaries', `×${s.canaries}`);
    this.d.cls(pill, 'zero', s.canaries === 0);
  }

  /** The big stamp: the stall countdown while stalling, the incident word once it is over. */
  private updateStamp(s: GameState): void {
    const stalling = s.stallTicks > 0 && s.phase === 'play';
    const st = s.phase === 'over' ? `end:${s.end}` : stalling ? 'tick' : '';
    const stamp = this.$('[data-stamp]');
    if (this.d.changed('stamp', st)) {
      stamp.hidden = !st;
      stamp.className = `stamp${st === 'tick' ? ' tick' : st ? ` end${s.end === 'stall' ? ' stall' : ''}` : ''}`;
      if (st.startsWith('end')) {
        const [k, v] = END_WORD[s.end ?? ''] ?? ['shift over', 'Timeout'];
        this.$('[data-stamp-k]').textContent = k;
        this.$('[data-stamp-v]').textContent = v;
        this.toast.hide();
      } else if (st === 'tick') this.$('[data-stamp-k]').textContent = 'stall in';
    }
    if (st === 'tick') this.d.text(this.$('[data-stamp-v]'), 'stampv', ((STALL_TICKS - s.stallTicks) / TICK_HZ).toFixed(1));
  }

  private updateSlow(o: SlowMeter): void {
    const d = this.d;
    if (d.changed('hitl', o.owned)) this.hitl.hidden = !o.owned;
    if (!o.owned) return;
    const pct = Math.round(o.meter * 100);
    if (d.changed('hitlm', pct)) this.$('[data-hitl-fill]').style.transform = `scaleX(${pct / 100})`;
    d.cls(this.hitl, 'on', o.active);
    d.cls(this.hitl, 'dry', o.dry);
    d.text(this.$('[data-hitl-k]'), 'hitlk', o.active ? 'human in the loop · slowed' : o.dry ? 'human in the loop · refilling' : 'human in the loop');
    d.text(this.$('[data-hitl-key]'), 'hitlkey', o.phone ? 'two fingers' : 'hold Space');
  }
}
