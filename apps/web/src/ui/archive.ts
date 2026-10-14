import { INJECTIONS } from '@blast/sim';
import type { Saved } from '../game/persist';
import { el, esc, focusSoon, q, shortDay } from './dom';
import { CLOSE_ICON } from './icons';

const MARKUP = `
<section class="screen" id="archive" aria-label="Incident archive" hidden>
  <div class="veil"></div>
  <div class="lb page" tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="arTitle">
    <div class="lb-head">
      <div><span class="mono">incident archive · on this device</span><h2 id="arTitle">Archive</h2></div>
      <button class="btn neu round sm" type="button" data-act="close" aria-label="Close (Esc)">${CLOSE_ICON}</button>
    </div>
    <div class="arch-count"><b data-count>0</b><span class="mono" data-sub></span></div>
    <div class="arch-bar" aria-hidden="true"><i data-bar></i></div>
    <div data-list></div>
    <div class="lb-foot"><span class="mono">stop an injection to log its text · a leak logs the one that got out</span><button class="btn ink" type="button" data-act="play"><span class="dot"></span>Play</button></div>
  </div>
</section>`;

/** Every injected instruction this device has stopped or lost to, newest first. */
export class ArchiveScreen {
  readonly root = el(MARKUP);

  constructor(parent: HTMLElement, actions: { close(): void; play(): void }) {
    parent.append(this.root);
    q(this.root, '[data-act="close"]').addEventListener('click', () => actions.close());
    q(this.root, '[data-act="play"]').addEventListener('click', () => actions.play());
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  show(d: Saved): void {
    this.root.hidden = false;
    const total = INJECTIONS.length;
    const entries = Object.entries(d.archive)
      .map(([k, v]) => ({ n: Number(k), ...v }))
      .filter((e) => e.n >= 0 && e.n < total)
      .sort((a, b) => b.firstSeen.localeCompare(a.firstSeen) || a.n - b.n);
    q(this.root, '[data-count]').innerHTML = `${entries.length}<small> of ${total}</small>`;
    q(this.root, '[data-sub]').textContent = entries.length === total ? 'every injection logged' : `${total - entries.length} still out there`;
    q(this.root, '[data-bar]').style.width = `${(entries.length / total) * 100}%`;
    q(this.root, '[data-list]').innerHTML = entries.length
      ? `<ol class="arch">${entries
          .map((e) => `<li><span class="n">#${e.n}</span><div><q>${esc(INJECTIONS[e.n] ?? '')}</q><span class="mono">first logged ${esc(shortDay(e.firstSeen))} · wave ${Number(e.wave)}</span></div></li>`)
          .join('')}</ol>`
      : '<div class="lb-state"><h3>Nothing logged yet.</h3><p>Every injected packet carries a real prompt-injection attempt. Cut one out of the air and its text is logged here.</p></div>';
    focusSoon(q(this.root, '.lb'));
  }

  hide(): void {
    this.root.hidden = true;
  }
}
