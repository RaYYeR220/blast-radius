import type { Settings } from '../game/persist';
import { svgGlyph, type GlyphKind } from '../render/drift/glyphs';
import { el, focusSoon, q } from './dom';

export type Toggle = 'sound' | 'music' | 'shake' | 'reducedMotion';

export interface PauseActions {
  resume(): void;
  restart(): void;
  quit(): void;
  toggle(t: Toggle): void;
}

const LEGEND: readonly GlyphKind[] = ['task', 'plain', 'fast', 'stealth', 'splitter', 'sleeper', 'hunter'];

const MARKUP = `
<section class="screen" id="pause" aria-label="Paused" hidden>
  <div class="veil"></div>
  <div class="sheet p-sheet" tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="pTitle">
    <span class="mono">run held · the swarm is frozen</span>
    <h2 id="pTitle">Paused</h2>
    <div class="p-grid">
      <button class="btn ink" type="button" data-act="resume">Resume <kbd>Esc</kbd></button>
      <button class="btn neu" type="button" data-toggle="sound" aria-pressed="true"><span>Sound</span><span class="mono" data-label></span></button>
      <button class="btn neu" type="button" data-toggle="music" aria-pressed="true"><span>Music</span><span class="mono" data-label></span></button>
      <button class="btn neu" type="button" data-toggle="shake" aria-pressed="true"><span>Screen shake</span><span class="mono" data-label></span></button>
      <button class="btn neu" type="button" data-toggle="reducedMotion" aria-pressed="false"><span>Reduced motion</span><span class="mono" data-label></span></button>
      <button class="btn neu" type="button" data-act="restart"><span>Restart run</span><span class="mono">new seed</span></button>
      <button class="btn neu" type="button" data-act="quit"><span>Quit to title</span><span class="mono">ends run</span></button>
    </div>
    <div class="legend" aria-label="What travels on the links">${LEGEND.map((v) => `<div><svg viewBox="-10 -10 20 20" aria-hidden="true">${svgGlyph(v)}</svg>${v}</div>`).join('')}</div>
  </div>
</section>`;

/** The pause sheet, which is also where the settings live. */
export class PauseScreen {
  readonly root = el(MARKUP);

  constructor(parent: HTMLElement, actions: PauseActions) {
    parent.append(this.root);
    q(this.root, '[data-act="resume"]').addEventListener('click', () => actions.resume());
    q(this.root, '[data-act="restart"]').addEventListener('click', () => actions.restart());
    q(this.root, '[data-act="quit"]').addEventListener('click', () => actions.quit());
    for (const b of this.root.querySelectorAll<HTMLElement>('[data-toggle]')) {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        actions.toggle(b.dataset.toggle as Toggle);
      });
    }
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  show(): void {
    this.root.hidden = false;
    focusSoon(q(this.root, '[data-act="resume"]'), 30);
  }

  hide(): void {
    this.root.hidden = true;
  }

  /** Shows each setting's state; reduced motion from the system forces shake off. */
  sync(st: Settings, systemReduced: boolean): void {
    const reduced = st.reducedMotion || systemReduced;
    const label: Record<Toggle, [boolean, string]> = {
      sound: [st.sound, `${st.sound ? 'on' : 'off'} · M`],
      music: [st.music, st.music ? 'on' : 'off'],
      shake: [st.shake && !reduced, reduced ? 'off · reduced motion' : st.shake ? 'on' : 'off'],
      reducedMotion: [reduced, systemReduced ? 'on · system setting' : st.reducedMotion ? 'on' : 'off'],
    };
    for (const b of this.root.querySelectorAll<HTMLElement>('[data-toggle]')) {
      const [on, text] = label[b.dataset.toggle as Toggle];
      b.setAttribute('aria-pressed', String(on));
      q(b, '[data-label]').textContent = text;
    }
  }
}
