import { type GameState, REROLL_COST, UPGRADES } from '@blast/sim';
import { el, esc, focusSoon, q, replay } from './dom';
import { UPGRADE_ICONS } from './icons';

export interface ShopActions {
  pick(slot: 0 | 1 | 2): void;
  reroll(): void;
  skip(): void;
}

const MARKUP = `
<section class="screen" id="shop" aria-label="Shop" hidden>
  <div class="veil"></div>
  <div class="sheet" tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="shTitle">
    <div class="sh-head">
      <div><span class="chip"><i></i><span data-wave>Wave 1 held</span></span><h2 id="shTitle">Patch the swarm</h2></div>
      <div class="sh-cred"><div class="mono">credits</div><div class="v" data-cred>0</div><div class="mono" data-bonus></div></div>
    </div>
    <div class="cards" data-cards></div>
    <div class="sh-foot">
      <span class="mono">pick with 1 · 2 · 3</span>
      <div class="acts"><button class="btn neu" type="button" data-act="reroll">Reroll · ${REROLL_COST} credits <kbd>R</kbd></button><button class="btn ink" type="button" data-act="skip">Skip <kbd>Enter</kbd></button></div>
    </div>
  </div>
</section>`;

/** Between waves the swarm holds and the player buys one real defence. */
export class ShopScreen {
  readonly root = el(MARKUP);
  private readonly cards = q(this.root, '[data-cards]');
  private key = '';

  constructor(parent: HTMLElement, private readonly actions: ShopActions) {
    parent.append(this.root);
    q(this.root, '[data-act="reroll"]').addEventListener('click', () => actions.reroll());
    q(this.root, '[data-act="skip"]').addEventListener('click', () => actions.skip());
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  show(s: GameState): void {
    this.root.hidden = false;
    this.key = '';
    this.render(s);
    q(this.root, '[data-wave]').textContent = `Wave ${s.wave} held`;
    q(this.root, '[data-bonus]').textContent = s.waveInfections === 0 ? `clean wave +200` : `${s.waveInfections} infected this wave`;
    focusSoon(q(this.root, '.sheet'), 30);
  }

  hide(): void {
    this.root.hidden = true;
  }

  /** Redraws the cards when the offers or the credits change. */
  render(s: GameState): void {
    const key = `${s.offers.map((o) => o.id + o.price).join()}|${s.credits}`;
    if (key === this.key) return;
    this.key = key;
    q(this.root, '[data-cred]').textContent = String(s.credits);
    this.cards.replaceChildren(...s.offers.map((o, i) => this.card(s, i)));
    q<HTMLButtonElement>(this.root, '[data-act="reroll"]').disabled = s.credits < REROLL_COST;
  }

  /** A card the player cannot afford shakes instead of buying. */
  refuse(slot: number): void {
    const c = this.cards.children[slot];
    if (c instanceof HTMLElement) replay(c, 'deny');
  }

  private card(s: GameState, i: number): HTMLButtonElement {
    const o = s.offers[i]!;
    const u = UPGRADES[o.id];
    const ok = s.credits >= o.price;
    const owned = o.id === 'canary' && s.canaries > 0;
    const b = el<HTMLButtonElement>(`<button type="button" class="card">
      <span class="row"><span class="ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${UPGRADE_ICONS[o.id]}</svg></span><kbd>${i + 1}</kbd></span>
      <span class="nm">${esc(u.name)}</span><span class="bl">${esc(u.blurb)}</span>
      <span class="pr"><b>${o.price}</b><span>credits</span>${ok ? (owned ? `<em>own ×${s.canaries}</em>` : '') : `<em>need ${o.price - s.credits} more</em>`}</span>
    </button>`);
    b.disabled = !ok;
    b.setAttribute('aria-label', `${i + 1}: ${u.name}, ${o.price} credits. ${u.blurb}${ok ? '' : ' Not enough credits.'}`);
    b.addEventListener('click', () => this.actions.pick(i as 0 | 1 | 2));
    return b;
  }
}
