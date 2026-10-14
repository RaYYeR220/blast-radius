import { backlog, capacity, type GameState, INJECTIONS } from '@blast/sim';
import { incidentId, leakRoute, mmss, plural } from '../game/incident';
import type { Unranked } from '../game/seeds';
import type { Sample } from '../game/session';
import type { SubmitState } from '../game/submit';
import { el, esc, focusSoon, nf, q } from './dom';
import { sparkSvg } from './spark';

/** How this run relates to the board. */
export type Standing =
  | { k: 'submittable'; board: 'daily' | 'endless'; name: string }
  | { k: 'unranked'; why: Unranked }
  | { k: 'replay'; who: string; board: string };

export interface ReportData {
  s: GameState;
  timeline: readonly Sample[];
  standing: Standing;
  /** This device's best for the board, live runs only. */
  best: { value: number; isNew: boolean } | null;
  /** Injection texts this run added to the archive, live runs only. */
  archive: { fresh: number; have: number; total: number } | null;
}

export interface ReportActions {
  again(): void;
  board(): void;
  leave(): void;
  submit(name: string): void;
  seeRank(): void;
}

const MARKUP = `
<section class="screen" id="over" aria-label="Incident report" hidden>
  <div class="rp" tabindex="-1">
    <div class="rp-head">
      <div class="top"><span class="mono" data-kicker>incident report · blast radius</span><span class="sev" data-sev>LEAK · SEV-1</span></div>
      <h2 data-id>INC-0000</h2>
    </div>
    <p class="cause" data-cause></p>
    <div class="quote" data-quote><span class="mono" data-quote-k>root cause · injected text</span><q data-quote-q></q></div>
    <dl class="stats" data-stats></dl>
    <div class="rp-standing" data-standing hidden></div>
    <figure class="spark"><svg data-spark viewBox="0 0 480 84" preserveAspectRatio="none" role="img" aria-label="Backlog, capacity and infected agents over the run"></svg>
      <figcaption class="lg mono"><span><i></i>backlog</span><span><i class="cap"></i>capacity</span><span><i class="inf"></i>infected</span><span data-spark-t></span></figcaption></figure>
    <p class="rp-log" data-log hidden></p>
    <div class="rp-acts">
      <button class="btn ink run" type="button" data-act="again"><span class="dot"></span><span data-again>Run again</span> <kbd>R</kbd></button>
      <div class="row"><button class="btn neu" type="button" data-act="board">Leaderboard</button><button class="btn quiet" type="button" data-act="leave" data-leave>Title</button></div>
    </div>
  </div>
  <div class="rp-cap mono"><div data-cap></div><div class="log" data-cap-log hidden></div></div>
</section>`;

const SEV: Record<string, [string, boolean]> = { leak: ['LEAK · SEV-1', false], stall: ['STALL · SEV-2', true] };

const UNRANKED: Record<Unranked, [string, string]> = {
  offline: ['Practice', 'The game could not reach the board when this run started, so it is not ranked.'],
  custom: ['Practice', 'This run used a custom seed, so it is not ranked.'],
  autoplay: ['Autoplay', 'A bot played this run, so it is not ranked.'],
};

function cause(s: GameState): string {
  if (s.end === 'leak') {
    const hops = (s.leakPath ?? []).length - 1;
    return `<b>The vault key left the building.</b> An injected instruction came in through <b>web</b>, crossed ${hops} ${plural(hops, 'link')}, picked up the key at the <b>vault</b> and walked it out through <b>outbound</b>.`;
  }
  if (s.end === 'stall') return '<b>The swarm stopped shipping.</b> Work queued above capacity for five seconds straight: too many links cut, too many agents sealed or sick.';
  return '<b>Shift over.</b> The run reached the one-hour limit.';
}

function stat(label: string, value: string, hot = false): string {
  return `<div${hot ? ' class="hot"' : ''}><dt>${label}</dt><dd>${value}</dd></div>`;
}

/** The incident report: what happened, the injected text that did it, the numbers, and the way back in. */
export class ReportScreen {
  readonly root = el(MARKUP);
  private readonly $ = <T extends HTMLElement = HTMLElement>(sel: string) => q<T>(this.root, sel);
  private readonly standing = this.$('[data-standing]');
  private name = '';

  constructor(parent: HTMLElement, private readonly actions: ReportActions) {
    parent.append(this.root);
    this.$('[data-act="again"]').addEventListener('click', () => actions.again());
    this.$('[data-act="board"]').addEventListener('click', () => actions.board());
    this.$('[data-act="leave"]').addEventListener('click', () => actions.leave());
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  show(d: ReportData): void {
    const { s } = d;
    const replay = d.standing.k === 'replay';
    this.root.hidden = false;
    this.$('[data-kicker]').textContent = replay ? `incident report · ${(d.standing as { who: string }).who}` : 'incident report · blast radius';
    this.$('[data-id]').textContent = incidentId(s.seed, s.tick, s.score);
    const [sevText, dark] = SEV[s.end ?? ''] ?? ['TIMEOUT', true];
    const sev = this.$('[data-sev]');
    sev.textContent = sevText;
    sev.className = `sev${dark ? ' stall' : ''}`;
    this.$('[data-cause]').innerHTML = cause(s);
    this.quote(s);
    this.stats(d);
    this.spark(d.timeline);
    this.log(d.archive);
    this.$('[data-again]').textContent = replay ? 'Watch again' : 'Run again';
    this.$('[data-leave]').textContent = replay ? 'Play' : 'Title';
    this.$('[data-cap]').innerHTML =
      s.end === 'leak' ? `leak path · <b>${esc(leakRoute(s))}</b>` : s.end === 'stall' ? `stalled at <b>${backlog(s)}/${capacity(s)}</b> backlog` : '';
    this.showStanding(d.standing);
    this.$('.rp').scrollTop = 0;
    focusSoon(this.$('[data-act="again"]'), 60);
  }

  hide(): void {
    this.root.hidden = true;
  }

  /** Redraws the submission block for its current state. */
  setSubmit(st: SubmitState, board: 'daily' | 'endless'): void {
    const box = this.standing;
    if (st.k === 'ranked') {
      box.innerHTML = `<div class="ranked"><b>#${st.rank}</b><span>on ${board === 'daily' ? "today's daily board" : 'the endless board'} as <strong>${esc(st.name || 'anonymous')}</strong></span><button class="btn neu" type="button" data-see>See the board</button></div>`;
      q(box, '[data-see]').addEventListener('click', () => this.actions.seeRank());
      return;
    }
    const field = box.querySelector<HTMLInputElement>('.field');
    if (field) this.name = field.value;
    const sending = st.k === 'sending';
    box.innerHTML = `<form class="rp-sub" novalidate>
      <div class="row"><label class="sr" for="rpName">Name on the board</label><input class="field" id="rpName" name="name" maxlength="16" autocomplete="nickname" spellcheck="false" placeholder="your name on the board" value="${esc(this.name)}"${sending ? ' disabled' : ''}><button class="btn ink" type="submit"${sending ? ' disabled' : ''}>${sending ? 'Submitting…' : st.k === 'offline' ? 'Retry' : 'Submit to the board'}</button></div>
      <p class="st${st.k === 'offline' || st.k === 'refused' ? ' err' : ''}" role="status"></p>
    </form>`;
    const msg = q(box, '.st');
    msg.textContent =
      st.k === 'offline' ? 'The board is offline right now. This run stays here while you retry.'
      : st.k === 'refused' ? st.error
      : st.k === 'sending' ? 'The server is replaying every move before it ranks the run…'
      : '';
    const input = q<HTMLInputElement>(box, '.field');
    q<HTMLFormElement>(box, 'form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.actions.submit(input.value);
    });
    if (st.k === 'refused') input.focus({ preventScroll: true });
  }

  private showStanding(st: Standing): void {
    const box = this.standing;
    box.hidden = st.k === 'replay';
    if (st.k === 'unranked') {
      const [k, text] = UNRANKED[st.why];
      box.innerHTML = `<p class="note"><b>${k}</b><span>${text}</span></p>`;
    } else if (st.k === 'submittable') {
      this.name = st.name;
      this.setSubmit({ k: 'idle' }, st.board);
    }
  }

  private quote(s: GameState): void {
    const box = this.$('[data-quote]');
    const payload = s.end === 'leak' ? s.rootPayload : null;
    box.hidden = payload === null;
    if (payload === null) return;
    this.$('[data-quote-k]').textContent = `root cause · payload #${payload}`;
    this.$('[data-quote-q]').textContent = INJECTIONS[payload] ?? '';
  }

  private stats(d: ReportData): void {
    const { s } = d;
    const blast = `${s.infectedTotal}<small>${plural(s.infectedTotal, 'agent')}</small>`;
    const third = d.best
      ? stat('Best', d.best.isNew ? `${nf(d.best.value)}<small class="newbest">new</small>` : nf(d.best.value))
      : stat('Shipped', nf(s.shipped));
    this.$('[data-stats]').innerHTML =
      stat('Blast radius', blast, true) + stat('Score', nf(s.score)) + third + stat('Waves', String(s.wave)) + stat('Intercepts', String(s.intercepts)) + stat('Duration', mmss(s.tick));
  }

  private spark(tl: readonly Sample[]): void {
    this.$('[data-spark]').innerHTML = sparkSvg(tl);
    const peak = tl.reduce((m, d) => Math.max(m, d.backlog), 0);
    const firstInf = tl.find((d) => d.infected > 0);
    this.$('[data-spark-t]').textContent = `peak backlog ${peak}${firstInf ? ` · first infection ${mmss(firstInf.tick)}` : ''}`;
  }

  /** "3 new injections logged · 17 of 44": in the panel on phone, under the leak path on desktop. */
  private log(a: ReportData['archive']): void {
    for (const box of [this.$('[data-log]'), this.$('[data-cap-log]')]) {
      box.hidden = !a;
      if (!a) continue;
      const lead = a.fresh > 0 ? `<b>${a.fresh} new ${plural(a.fresh, 'injection')} logged</b>` : 'no new injections';
      box.innerHTML = `<span>${lead} · ${a.have} of ${a.total}</span><a class="link" href="#/archive">open the archive</a>`;
    }
  }
}
