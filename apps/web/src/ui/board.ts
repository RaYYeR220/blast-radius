import type { BoardName } from '../game/routes';
import type { BoardRow } from '../net/client';
import { CLOSE_ICON } from './icons';
import { el, esc, focusSoon, nf, q, qa, shortDay } from './dom';

export interface BoardActions {
  close(): void;
  play(tab: BoardName): void;
  tab(t: BoardName): void;
  open(id: string): void;
  retry(): void;
}

export type BoardView =
  | { k: 'loading' }
  | { k: 'offline' }
  | { k: 'error'; error: string }
  | { k: 'rows'; rows: readonly BoardRow[]; me: BoardRow | null; day: string | null; mine: string | null };

const TABS: ReadonlyArray<[BoardName, string]> = [['daily', 'Daily'], ['endless', 'Endless'], ['agents', 'Agents']];

const MARKUP = `
<section class="screen" id="board" aria-label="Leaderboard" hidden>
  <div class="veil"></div>
  <div class="lb" tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="lbTitle">
    <div class="lb-head">
      <div><span class="mono" data-kicker>the board · shifts survived</span><h2 id="lbTitle">Leaderboard</h2></div>
      <button class="btn neu round sm" type="button" data-act="close" aria-label="Close leaderboard (Esc)">${CLOSE_ICON}</button>
    </div>
    <div class="tabs" role="tablist">${TABS.map(([id, label]) => `<button type="button" role="tab" aria-selected="false" data-tab="${id}">${label}</button>`).join('')}</div>
    <div data-body></div>
    <div class="lb-foot"><span class="mono" data-you></span><button class="btn ink" type="button" data-act="play"><span class="dot"></span><span data-play>Play</span></button></div>
  </div>
</section>`;

const EMPTY: Record<BoardName, [string, string, string]> = {
  daily: ["Nobody is on today's board yet.", "Today's daily is the same board for everyone until midnight UTC. Play it and take first place.", ''],
  endless: ['No ranked endless runs yet.', 'Every endless run is a fresh board. Finish one and it lands here.', ''],
  agents: ["No agent has finished today's board.", 'Point an agent at the MCP endpoint and it plays the same daily as everyone else.', 'Connect an agent'],
};

function rowHtml(r: BoardRow, you: boolean, agents: boolean): string {
  const tag = you ? '<span class="tag">you</span>' : agents ? '<span class="tag">agent</span>' : '';
  return `<tr data-id="${esc(r.id)}" tabindex="0" role="link" aria-label="Watch ${esc(r.name)}'s run, rank ${Number(r.rank)}"${you ? ' class="you"' : ''}>
    <td class="rk">${Number(r.rank)}</td><td class="nm">${esc(r.name)}${tag}</td><td class="mn hide-s">${Number(r.wave)}</td>
    <td class="mn hide-s${r.endedBy === 'leak' ? ' leak' : ''}">${esc(r.endedBy)}</td><td class="sc">${nf(r.score)}</td><td class="go" aria-hidden="true">›</td></tr>`;
}

/** The three boards, with your own row, and every row a way into its replay. */
export class BoardScreen {
  readonly root = el(MARKUP);
  private readonly body = q(this.root, '[data-body]');
  private tab: BoardName = 'daily';

  constructor(parent: HTMLElement, private readonly actions: BoardActions) {
    parent.append(this.root);
    q(this.root, '[data-act="close"]').addEventListener('click', () => actions.close());
    q(this.root, '[data-act="play"]').addEventListener('click', () => actions.play(this.tab));
    for (const b of qa(this.root, '[data-tab]')) b.addEventListener('click', () => actions.tab(b.dataset.tab as BoardName));
    this.body.addEventListener('click', (e) => this.onRow(e));
    this.body.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') this.onRow(e);
    });
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  get selected(): BoardName {
    return this.tab;
  }

  show(tab: BoardName, you: string): void {
    const wasOpen = this.open;
    this.root.hidden = false;
    this.tab = tab;
    for (const b of qa(this.root, '[data-tab]')) b.setAttribute('aria-selected', String(b.dataset.tab === tab));
    q(this.root, '[data-you]').textContent = you;
    q(this.root, '[data-play]').textContent = tab === 'daily' ? 'Play the daily' : 'Play';
    this.kicker(null);
    if (!wasOpen) focusSoon(q(this.root, '.lb'));
  }

  hide(): void {
    this.root.hidden = true;
  }

  render(v: BoardView): void {
    if (v.k === 'rows') this.kicker(v.day);
    this.body.innerHTML = v.k === 'rows' ? this.rows(v) : this.state(v);
    const btn = this.body.querySelector<HTMLElement>('[data-state-act]');
    btn?.addEventListener('click', () => {
      if (v.k === 'rows' && this.tab === 'agents') location.hash = '#/agents';
      else if (v.k === 'rows') this.actions.play(this.tab);
      else this.actions.retry();
    });
  }

  private kicker(day: string | null): void {
    const when = day ? ` · ${shortDay(day)}` : '';
    const text = this.tab === 'endless' ? 'the board · endless · all time' : this.tab === 'agents' ? `the board · agents · daily${when}` : `the board · daily${when}`;
    q(this.root, '[data-kicker]').textContent = text;
  }

  private onRow(e: Event): void {
    const tr = (e.target as HTMLElement).closest<HTMLElement>('tr[data-id]');
    if (!tr?.dataset.id) return;
    e.preventDefault();
    this.actions.open(tr.dataset.id);
  }

  private state(v: Exclude<BoardView, { k: 'rows' }>): string {
    if (v.k === 'loading') return '<div class="lb-state loading"><p><i></i>Loading the board…</p></div>';
    const [h, p] =
      v.k === 'offline'
        ? ['The board is offline.', 'Scores could not be loaded. The game still works, and your runs still count on this device.']
        : ['The board did not load.', v.error];
    return `<div class="lb-state"><h3>${h}</h3><p>${esc(p)}</p><button class="btn neu" type="button" data-state-act>Try again</button></div>`;
  }

  private rows(v: Extract<BoardView, { k: 'rows' }>): string {
    const agents = this.tab === 'agents';
    const note = agents
      ? '<p class="note"><b>Agents</b><span>Runs played by AI agents over MCP, on the same daily board. Agent and human scores are kept apart.</span><a class="link" href="#/agents">connect yours</a></p>'
      : '';
    if (!v.rows.length) {
      const [h, p, cta] = EMPTY[this.tab];
      // the footer already offers Play; only the agents board needs a way of its own
      const act = agents ? `<button class="btn neu" type="button" data-state-act>${cta}</button>` : '';
      return `${note}<div class="lb-state"><h3>${h}</h3><p>${p}</p>${act}</div>`;
    }
    const mine = v.me?.id ?? v.mine;
    const body = v.rows.map((r) => rowHtml(r, r.id === mine, agents)).join('');
    const tail = v.me && !v.rows.some((r) => r.id === v.me!.id) ? `<tr class="gap"><td colspan="6">···</td></tr>${rowHtml(v.me, true, agents)}` : '';
    return `${note}<table class="rows"><thead><tr><th>#</th><th>${agents ? 'agent' : 'name'}</th><th class="hide-s">wave</th><th class="hide-s">ended by</th><th class="r">score</th><th></th></tr></thead><tbody>${body}${tail}</tbody></table>`;
  }
}
