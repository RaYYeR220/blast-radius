import { VARIANT_UNLOCK, type Variant } from '@blast/sim';
import { type GlyphKind, svgGlyph } from '../render/drift/glyphs';
import { q } from './dom';

const VNAME: Readonly<Record<Variant, string>> = {
  plain: 'plain injection',
  fast: 'fast injection',
  stealth: 'stealth: looks like work',
  splitter: 'splitter: forks on infect',
  sleeper: 'sleeper: slow incubation',
  hunter: 'hunter: seeks the busiest agent',
};

/** The pill that drops in under the HUD: a big word, a line of context, and maybe a glyph. */
export class Toast {
  private readonly big: HTMLElement;
  private readonly small: HTMLElement;
  private readonly glyph: SVGSVGElement;
  private timer = 0;

  constructor(private readonly root: HTMLElement) {
    this.big = q(root, 'b');
    this.small = q(root, 'span');
    this.glyph = q<SVGSVGElement>(root, 'svg');
  }

  show(big: string, small = '', glyph: GlyphKind | null = null, ms = 2600): void {
    this.big.textContent = big;
    this.small.textContent = small;
    this.glyph.innerHTML = glyph ? svgGlyph(glyph) : '';
    this.glyph.style.display = glyph ? '' : 'none';
    this.root.classList.add('show');
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.hide(), ms);
  }

  hide(): void {
    clearTimeout(this.timer);
    this.root.classList.remove('show');
  }

  /** Announces a wave, naming the injection that first appears in it. */
  wave(wave: number): void {
    const nv = (Object.keys(VARIANT_UNLOCK) as Variant[]).find((v) => VARIANT_UNLOCK[v] === wave && wave > 1);
    if (nv) this.show(`Wave ${wave}`, `new · ${VNAME[nv]}`, nv);
    else this.show(`Wave ${wave}`, wave >= 3 ? 'more traffic · new peer links' : 'more traffic');
  }
}
