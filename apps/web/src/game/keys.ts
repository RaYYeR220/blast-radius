import type { Phase } from '@blast/sim';

export type Screen = 'title' | 'play' | 'over' | 'board' | 'replay' | 'agents' | 'archive';

/** What the keyboard can do, depending on the screen. */
export interface KeyTarget {
  readonly screen: Screen;
  /** The live run's phase while playing. */
  readonly phase: Phase | null;
  readonly paused: boolean;
  wake(): void;
  mute(): void;
  pause(on: boolean): void;
  pick(slot: 0 | 1 | 2): void;
  reroll(): void;
  skip(): void;
  /** R: a fresh run (or, in a replay, watch it again). Never waits on anything. */
  again(): void;
  slow(on: boolean): void;
  /** Esc on a page or a replay. */
  close(): void;
  replayToggle(): void;
}

const typing = (t: EventTarget | null): boolean =>
  t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || (t instanceof HTMLElement && t.isContentEditable);

function playKey(t: KeyTarget, e: KeyboardEvent): void {
  const k = e.key;
  if (k === 'Escape') {
    if (t.paused) t.pause(false);
    else if (t.phase === 'play') t.pause(true);
    e.preventDefault();
    return;
  }
  if (t.phase === 'shop') {
    if (k === '1' || k === '2' || k === '3') t.pick((Number(k) - 1) as 0 | 1 | 2);
    else if (k === 'r' || k === 'R') t.reroll();
    else if (k === 'Enter' && !(e.target instanceof HTMLButtonElement)) t.skip();
    else return;
    e.preventDefault();
    return;
  }
  if (t.phase === 'over' && (k === 'r' || k === 'R')) {
    e.preventDefault();
    t.again();
    return;
  }
  if (k === ' ' && t.phase === 'play' && !t.paused) {
    t.slow(true);
    e.preventDefault();
  }
}

export function onKeyDown(t: KeyTarget, e: KeyboardEvent): void {
  if (typing(e.target)) return;
  t.wake();
  const k = e.key;
  if (e.repeat && k !== ' ') return;
  if (k === 'm' || k === 'M') {
    t.mute();
    return;
  }
  switch (t.screen) {
    case 'play':
      playKey(t, e);
      return;
    case 'over':
      if (k === 'r' || k === 'R') {
        e.preventDefault();
        t.again();
      }
      return;
    case 'replay':
      if (k === ' ' && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        if (!e.repeat) t.replayToggle();
      } else if (k === 'r' || k === 'R') t.again();
      else if (k === 'Escape') t.close();
      return;
    case 'board':
    case 'agents':
    case 'archive':
      if (k === 'Escape') t.close();
      return;
    default:
  }
}

export function onKeyUp(t: KeyTarget, e: KeyboardEvent): void {
  if (e.key === ' ') t.slow(false);
}
