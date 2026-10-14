import type { BoardName } from '../game/routes';
import { AgentsScreen } from './agents';
import { ArchiveScreen } from './archive';
import { BoardScreen } from './board';
import { Hud } from './hud';
import { PauseScreen, type Toggle } from './pause';
import { ReplayScreen, type Speed } from './replay';
import { ReportScreen } from './report';
import { ShopScreen } from './shop';
import { TitleScreen } from './title';

/** What the screens ask of the game. */
export interface UiHost {
  play(mode: 'endless' | 'daily'): void;
  pause(on: boolean): void;
  restart(): void;
  quit(): void;
  toggle(t: Toggle): void;
  pick(slot: 0 | 1 | 2): void;
  reroll(): void;
  skip(): void;
  again(): void;
  close(): void;
  submit(name: string): void;
  reportBoard(): void;
  reportLeave(): void;
  openBoardTab(tab: BoardName): void;
  watchRun(id: string): void;
  retryBoard(): void;
  replayToggle(): void;
  replaySpeed(x: Speed): void;
  replaySeek(tick: number): void;
}

export interface Ui {
  title: TitleScreen;
  hud: Hud;
  shop: ShopScreen;
  pause: PauseScreen;
  report: ReportScreen;
  board: BoardScreen;
  replay: ReplayScreen;
  agents: AgentsScreen;
  archive: ArchiveScreen;
}

/** Builds every screen into the root, hidden, wired to the game. */
export function mountUi(root: HTMLElement, h: UiHost): Ui {
  const nav = (r: string) => {
    location.hash = r;
  };
  return {
    title: new TitleScreen(root, { play: () => h.play('endless'), daily: () => h.play('daily'), board: () => nav('#/board') }),
    hud: new Hud(root, { pause: () => h.pause(true) }),
    shop: new ShopScreen(root, { pick: (i) => h.pick(i), reroll: () => h.reroll(), skip: () => h.skip() }),
    pause: new PauseScreen(root, { resume: () => h.pause(false), restart: () => h.restart(), quit: () => h.quit(), toggle: (t) => h.toggle(t) }),
    report: new ReportScreen(root, {
      again: () => h.again(),
      board: () => h.reportBoard(),
      leave: () => h.reportLeave(),
      submit: (name) => h.submit(name),
      seeRank: () => h.reportBoard(),
    }),
    board: new BoardScreen(root, {
      close: () => h.close(),
      play: (tab) => h.play(tab === 'daily' || tab === 'agents' ? 'daily' : 'endless'),
      tab: (t) => h.openBoardTab(t),
      open: (id) => h.watchRun(id),
      retry: () => h.retryBoard(),
    }),
    replay: new ReplayScreen(root, {
      toggle: () => h.replayToggle(),
      speed: (x) => h.replaySpeed(x),
      seek: (t) => h.replaySeek(t),
      close: () => h.close(),
      board: () => nav('#/board'),
    }),
    agents: new AgentsScreen(root, { close: () => h.close() }),
    archive: new ArchiveScreen(root, { close: () => h.close(), play: () => h.play('endless') }),
  };
}
