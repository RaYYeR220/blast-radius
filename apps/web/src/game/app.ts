import { type GameState, INJECTIONS, type Phase, quarantineCost, type SimEvent } from '@blast/sim';
import { type BotKind, makeBot } from '@blast/sim/bots';
import { AudioEngine } from '../audio/engine';
import { threatOf } from '../audio/threat';
import { Api, deviceKey } from '../net/client';
import { DriftRenderer, type Look } from '../render/drift/renderer';
import { Chrome } from '../ui/chrome';
import { nf, qa, shortDay } from '../ui/dom';
import type { Toggle } from '../ui/pause';
import { mountUi, type Ui, type UiHost } from '../ui/mount';
import type { Speed } from '../ui/replay';
import type { ReportData, Standing } from '../ui/report';
import type { TypeArea } from '../ui/title';
import { Camera, targetWindow } from './camera';
import { dailyDay } from './daily';
import { type KeyTarget, onKeyDown, onKeyUp, type Screen } from './keys';
import { GameLoop } from './loop';
import { Nav } from './nav';
import { Store } from './persist';
import { PointerInput } from './pointer';
import { recordRun, showTutorial } from './progress';
import { buildRunRecord } from './record';
import type { BoardName, Route } from './routes';
import { Attract, fastForward, Run } from './run';
import { localSeed, SeedBank, type Ticket } from './seeds';
import type { Session } from './session';
import { SlowMo } from './slowmo';
import { keepMine, Submission, type SubmitState } from './submit';

import { toBoard, type Rect, type View } from './view';
import { bestFit, grow, isPhone, playView, regionView, reportRegion, titleRegion } from './viewport';
import { Watch } from './watch';

const BOTS: readonly string[] = ['heuristic', 'sloppy', 'idle'];
const OVERLAYS: readonly Screen[] = ['board', 'agents', 'archive'];
/** How long the end of a run holds on the board before the report slides in. */
const reportDelay = (s: GameState) => (s.end === 'leak' ? 1900 : 1400);

/** The screen state machine and the run lifecycle: everything between the input and the pixels. */
export class App implements KeyTarget, UiHost {
  readonly store = new Store();
  readonly api = new Api({ owner: () => deviceKey() });
  readonly seeds = new SeedBank(this.api);
  readonly audio = new AudioEngine();
  readonly camera = new Camera();
  readonly renderer: DriftRenderer;
  readonly loop: GameLoop;
  readonly input: PointerInput;
  readonly nav = new Nav((r) => this.route(r));
  readonly watch: Watch;
  readonly ui: Ui;
  private readonly chrome = new Chrome();
  private slowmo = new SlowMo();
  screen: Screen = 'title';
  view: View;
  run: Run | null = null;
  attract: Attract | null = null;
  /** What the board pages are drawn over: the bot game, or the run whose report opened them. */
  private backdrop: 'attract' | 'run' = 'attract';
  private drawn: Session | null = null;
  private readonly heard = new WeakSet<Session>();
  private W = 1;
  private H = 1;
  private dpr = 1;
  private lastNow = performance.now();
  private lastPhase: Phase = 'play';
  private botShopAt = 0;
  private reportRect: Rect | null = null;
  private reportT0 = 0;
  private typeArea: TypeArea | null = null;
  private slowKey = false;
  private timeScale = 1;
  private woke = false;
  private tutorialSeen = false;
  /** Running the sim ahead for a debug screen: no effects, no sound. */
  private ffwd = false;
  private boardSeq = 0;
  private readonly systemReduced = matchMedia('(prefers-reduced-motion: reduce)');
  private readonly autoplay: BotKind | null;
  private readonly customSeed: string | null;

  constructor(private readonly params: URLSearchParams, canvas: HTMLCanvasElement, root: HTMLElement) {
    const bot = params.get('autoplay');
    this.autoplay = bot && BOTS.includes(bot) ? (bot as BotKind) : null;
    this.customSeed = params.get('seed');
    this.renderer = new DriftRenderer(canvas);
    this.view = playView(innerWidth, innerHeight, 1, targetWindow(this.ensureAttract().session.state));
    this.ui = mountUi(root, this);
    this.watch = new Watch(this.api, {
      attach: (sess, intro) => this.listen(sess, 'replay', intro),
      loaded: (run, duration) => this.ui.replay.show(run, duration),
      failed: (w) => this.ui.replay.wait(w),
    });
    this.input = new PointerInput(canvas, {
      wake: () => this.wake(),
      playable: () => this.playable(),
      state: () => this.run?.state ?? null,
      act: (a) => this.run?.session.act(a),
      denied: (t) => this.denied(t.node, t.denied),
      toBoard: (x, y) => toBoard(this.view, x, y),
    });
    this.loop = new GameLoop({
      onTick: () => this.tick(),
      onRender: (alpha) => this.frame(alpha),
      onAutoPause: () => {
        if (this.screen === 'play' && this.run?.state.phase === 'play') this.ui.pause.show();
      },
    });
  }

  /* ---------------------------------------------------------------- boot */

  boot(): Route {
    this.resize();
    this.applySettings();
    addEventListener('resize', () => this.resize());
    addEventListener('keydown', (e) => onKeyDown(this, e));
    addEventListener('keyup', (e) => onKeyUp(this, e));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.loop.paused && !this.ui.pause.open) this.loop.resume();
    });
    this.systemReduced.addEventListener('change', () => this.applySettings());
    for (const b of qa(document, '[data-mute]')) {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        this.wake();
        this.mute();
      });
    }
    void document.fonts?.ready.then(() => this.measureType());
    const first = this.nav.start();
    this.loop.start();
    return first;
  }

  /** Arrivals from the address bar, links, back and forward. */
  route(r: Route): void {
    switch (r.name) {
      case 'title':
        return this.showTitle();
      case 'play':
      case 'daily': {
        const mode = r.name === 'daily' ? 'daily' : 'endless';
        if (this.run?.reported && this.run.ticket.mode === mode && this.backdrop === 'run' && OVERLAYS.includes(this.screen)) return this.showReport(this.run);
        return this.startRun(mode);
      }
      case 'board':
        return this.openBoard(r.tab ?? this.defaultTab());
      case 'replay':
        return this.openReplay(r.id);
      case 'agents':
      case 'archive':
        return this.openPage(r.name);
    }
  }

  /* ---------------------------------------------------------------- what the player can do */

  get phase(): Phase | null {
    return this.screen === 'play' && this.run ? this.run.state.phase : null;
  }

  get paused(): boolean {
    return this.loop.paused;
  }

  get session(): Session | null {
    return this.drawn;
  }

  wake(): void {
    this.audio.unlock();
    if (this.woke) return;
    this.woke = true;
    this.audio.startMusic();
  }

  /** Play from the title or a page: a new endless or daily run, recorded as a route. */
  play(mode: 'endless' | 'daily'): void {
    this.wake();
    this.startRun(mode);
    this.nav.push({ name: mode === 'daily' ? 'daily' : 'play' });
  }

  mute(): void {
    this.toggle('sound');
  }

  toggle(t: Toggle): void {
    this.store.update((d) => {
      d.settings[t] = !d.settings[t];
    });
    this.applySettings();
  }

  pause(on: boolean): void {
    if (this.screen !== 'play' || !this.run) return;
    if (on && this.run.state.phase !== 'play') return;
    if (on) {
      this.loop.pause();
      this.slowKey = false;
      this.input.reset();
      this.ui.pause.show();
    } else {
      this.loop.resume();
      this.ui.pause.hide();
    }
  }

  restart(): void {
    this.ui.pause.hide();
    this.loop.resume();
    this.startRun(this.run?.ticket.mode ?? 'endless');
  }

  quit(): void {
    this.ui.pause.hide();
    this.loop.resume();
    this.showTitle();
    this.nav.push({ name: 'title' });
  }

  pick(slot: 0 | 1 | 2): void {
    const s = this.run?.state;
    if (!s || s.phase !== 'shop') return;
    const o = s.offers[slot];
    if (!o || s.credits < o.price) {
      this.ui.shop.refuse(slot);
      return;
    }
    this.run!.session.act([{ type: 'pick', slot }]);
  }

  reroll(): void {
    const s = this.run?.state;
    if (!s || s.phase !== 'shop' || s.credits < 3) return;
    this.run!.session.act([{ type: 'reroll' }]);
    this.ui.shop.render(s);
  }

  skip(): void {
    if (this.run?.state.phase === 'shop') this.run.session.act([{ type: 'skip' }]);
  }

  /** R and Run again: always instant, whatever the board is doing with the last run. */
  again(): void {
    this.wake();
    if (this.screen === 'replay') {
      this.watchAgain();
      return;
    }
    this.startRun(this.run?.ticket.mode ?? 'endless');
  }

  slow(on: boolean): void {
    this.slowKey = on;
  }

  close(): void {
    if (this.screen === 'replay') return this.nav.back({ name: 'title' });
    const run = this.run;
    const fallback: Route = this.backdrop === 'run' && run ? { name: run.ticket.mode === 'daily' ? 'daily' : 'play' } : { name: 'title' };
    this.nav.back(fallback);
  }

  replayToggle(): void {
    if (this.watch.reported) return;
    this.watch.toggle();
  }

  replaySpeed(x: Speed): void {
    this.watch.speed = x;
  }

  replaySeek(tick: number): void {
    this.watch.seek(tick);
  }

  submit(name: string): void {
    const sub = this.run?.submission;
    if (!sub) return;
    this.store.update((d) => {
      d.name = name.trim();
    });
    void sub.send(name);
  }

  /** From a report: the board this run belongs to. */
  reportBoard(): void {
    const tab: BoardName = this.screen === 'replay' ? ((this.watch.run?.board as BoardName) ?? 'daily') : (this.run?.ticket.mode ?? 'daily');
    this.openBoard(tab);
    this.nav.push({ name: 'board', tab });
  }

  /** The report's quiet button: back to the title after a run, or into a game after a replay. */
  reportLeave(): void {
    if (this.screen === 'replay') return this.play('endless');
    this.quit();
  }

  openBoardTab(tab: BoardName): void {
    this.openBoard(tab);
    this.nav.replace({ name: 'board', tab });
  }

  watchRun(id: string): void {
    this.openReplay(id);
    this.nav.push({ name: 'replay', id });
  }

  retryBoard(): void {
    void this.loadBoard(this.ui.board.selected);
  }

  /* ---------------------------------------------------------------- screens */

  private hideAll(): void {
    for (const s of Object.values(this.ui)) s.hide();
  }

  private showTitle(): void {
    this.endRun();
    this.watch.stop();
    this.screen = 'title';
    this.backdrop = 'attract';
    this.hideAll();
    this.present(this.ensureAttract().session);
    const d = this.store.get();
    this.ui.title.show(shortDay(dailyDay()), Object.keys(d.archive).length, INJECTIONS.length);
    this.seeds.prefetch();
    this.measureType();
  }

  private startRun(mode: 'endless' | 'daily'): void {
    this.begin(this.seeds.ticket(mode, { custom: this.customSeed, autoplay: !!this.autoplay }), this.autoplay);
  }

  private begin(ticket: Ticket, bot: BotKind | null): Run {
    this.endRun();
    this.watch.stop();
    const run = new Run(ticket, bot, showTutorial(this.store.get()) && !this.tutorialSeen);
    this.run = run;
    this.slowmo = new SlowMo();
    this.listen(run.session, 'run', true);
    this.screen = 'play';
    this.backdrop = 'run';
    this.hideAll();
    this.ui.hud.reset();
    this.ui.hud.show();
    this.renderer.calm();
    this.input.reset();
    this.lastPhase = 'play';
    this.botShopAt = 0;
    this.reportRect = null;
    if (this.loop.paused) this.loop.resume();
    const hint = 'keep the work flowing · cut what turns orange';
    if (ticket.mode === 'daily') this.ui.hud.toast.show(`Daily · ${shortDay(run.day(dailyDay()))}`, hint);
    else this.ui.hud.toast.show('Wave 1', hint);
    return run;
  }

  /** Leaving a run behind: nothing about it waits on the network. */
  private endRun(): void {
    this.ui.pause.hide();
    this.ui.shop.hide();
  }

  private showReport(run: Run): void {
    const s = run.state;
    run.reported = true;
    this.screen = 'over';
    this.backdrop = 'run';
    this.reportT0 = performance.now();
    this.reportRect = grow(targetWindow(s), 1.04);
    this.hideAll();
    this.present(run.session);
    const d = this.store.get();
    const day = run.day(dailyDay());
    const bestNow = run.ticket.mode === 'daily' ? (d.best.daily[day] ?? 0) : d.best.endless;
    const data: ReportData = {
      s,
      timeline: run.session.timeline,
      standing: this.standing(run),
      best: run.bot ? null : { value: Math.max(bestNow, s.score), isNew: !!run.outcome?.newBest && s.score > 0 },
      archive: run.outcome ? { fresh: run.outcome.newPayloads.length, have: Object.keys(d.archive).length, total: INJECTIONS.length } : null,
    };
    this.ui.report.show(data);
    const sub = run.submission;
    if (sub && sub.state.k !== 'idle') this.ui.report.setSubmit(sub.state, sub.run.board);
  }

  private standing(run: Run): Standing {
    if (run.ticket.unranked) return { k: 'unranked', why: run.ticket.unranked };
    if (!run.submission) return { k: 'unranked', why: 'custom' };
    return { k: 'submittable', board: run.submission.run.board, name: this.store.get().name };
  }

  private openBoard(tab: BoardName): void {
    this.overlay('board');
    this.ui.board.show(tab, this.youText(tab));
    void this.loadBoard(tab);
  }

  private openPage(page: 'agents' | 'archive'): void {
    this.overlay(page);
    if (page === 'agents') this.ui.agents.show();
    else this.ui.archive.show(this.store.get());
  }

  /** A page over the board: over the ended run if its report opened it, otherwise over the bot game. */
  private overlay(screen: Screen): void {
    const overRun = !!this.run?.reported && (this.screen === 'over' || (this.backdrop === 'run' && OVERLAYS.includes(this.screen)));
    this.watch.stop();
    this.screen = screen;
    this.backdrop = overRun ? 'run' : 'attract';
    this.hideAll();
    this.present(overRun && this.run ? this.run.session : this.ensureAttract().session);
  }

  private openReplay(id: string): void {
    this.screen = 'replay';
    this.backdrop = 'attract';
    this.hideAll();
    this.present(this.ensureAttract().session);
    void this.watch.load(id);
  }

  private watchAgain(): void {
    this.ui.report.hide();
    this.ui.replay.controls(true);
    this.watch.again();
  }

  private defaultTab(): BoardName {
    return this.backdrop === 'run' && this.run ? this.run.ticket.mode : 'daily';
  }

  private youText(tab: BoardName): string {
    if (tab === 'agents') return 'agents rank on their own board';
    const d = this.store.get();
    const best = tab === 'daily' ? (d.best.daily[dailyDay()] ?? 0) : d.best.endless;
    if (best) return `your best on this device · ${nf(best)}`;
    return tab === 'daily' ? 'no daily run on this device today' : 'no endless run on this device yet';
  }

  private async loadBoard(tab: BoardName): Promise<void> {
    const seq = ++this.boardSeq;
    this.ui.board.render({ k: 'loading' });
    const mine = this.store.get().mine;
    const today = dailyDay();
    const my = tab === 'daily' ? (mine.daily?.day === today ? mine.daily.id : null) : tab === 'endless' ? (mine.endless?.id ?? null) : null;
    const r = await this.api.board(tab, my ?? undefined);
    if (seq !== this.boardSeq || this.screen !== 'board') return;
    if (r.ok && Array.isArray(r.rows)) this.ui.board.render({ k: 'rows', rows: r.rows, me: r.me ?? null, day: r.day ?? null, mine: my });
    else if (r.ok || 'offline' in r || r.status === 503) this.ui.board.render({ k: 'offline' });
    else this.ui.board.render({ k: 'error', error: r.error });
  }

  /* ---------------------------------------------------------------- sessions and their events */

  private ensureAttract(): Attract {
    if (this.attract && this.attract.session.state.phase !== 'over') return this.attract;
    const a = new Attract();
    this.attract = a;
    a.session.on((e) => {
      if (this.drawn === a.session) this.renderer.onEvent(a.session, e, false);
    });
    return a;
  }

  /** Draws this session from now on; a switch resets the camera and the renderer's memory. */
  private present(sess: Session, intro = false, force = false): void {
    if (sess === this.drawn && !force) return;
    this.drawn = sess;
    this.camera.reset();
    this.renderer.reset(sess, intro);
  }

  private listen(sess: Session, kind: 'run' | 'replay', intro: boolean): void {
    this.present(sess, intro, true);
    if (this.heard.has(sess)) return;
    this.heard.add(sess);
    sess.on((e) => {
      if (this.drawn !== sess || this.ffwd) return;
      if (kind === 'run') this.onRunEvent(e);
      else this.onReplayEvent(e);
    });
  }

  private onRunEvent(e: SimEvent): void {
    const run = this.run;
    if (!run) return;
    this.audio.onEvent(e);
    this.renderer.onEvent(run.session, e, true);
    if (e.e === 'intercept' && run.tutorial) {
      run.tutorial = false;
      this.tutorialSeen = true;
    } else if (e.e === 'wave') this.ui.hud.toast.wave(e.wave);
    else if (e.e === 'over') {
      run.overAt = performance.now();
      this.finish(run);
    }
  }

  private onReplayEvent(e: SimEvent): void {
    const sess = this.watch.session;
    if (!sess || this.watch.quiet) return;
    this.audio.onEvent(e);
    this.renderer.onEvent(sess, e, true);
    if (e.e === 'over') this.watch.overAt = performance.now();
  }

  /** Game over: progress is saved at once, and a rankable run is readied for the board. */
  private finish(run: Run): void {
    if (run.bot) return;
    const s = run.state;
    const day = run.day(dailyDay());
    const rec = buildRunRecord(s, run.ticket.mode, day, run.tally);
    this.store.update((d) => {
      run.outcome = recordRun(d, rec);
    });
    if (run.ticket.unranked || (s.end !== 'leak' && s.end !== 'stall')) return;
    const board = run.ticket.mode;
    run.submission = new Submission({ board, replay: run.session.replay(), score: s.score, token: run.ticket.token, day }, this.api, (st) => this.onSubmit(run, st));
  }

  private onSubmit(run: Run, st: SubmitState): void {
    const sub = run.submission;
    if (!sub) return;
    if (st.k === 'ranked') this.store.update((d) => keepMine(d, sub.run, st.id));
    if (this.screen === 'over' && this.run === run) this.ui.report.setSubmit(st, sub.run.board);
    else if (st.k === 'ranked' && this.screen === 'play') {
      this.ui.hud.toast.show(`#${st.rank}`, `your last run, on the ${sub.run.board} board`);
    }
  }

  private denied(node: number, why: 'credits' | 'quarantined'): void {
    const s = this.run?.state;
    const n = s?.nodes[node];
    if (!s || !n) return;
    this.renderer.scene.addFx({ k: 'deny', t0: 0, dur: 1000, bx: n.x, by: n.y, text: why === 'credits' ? `need ${quarantineCost(s)} credits` : 'already sealed' });
    if (why === 'credits') this.ui.hud.deny();
  }

  /* ---------------------------------------------------------------- loop */

  private playable(): boolean {
    return this.screen === 'play' && !this.loop.paused && this.run?.state.phase === 'play';
  }

  private tick(): void {
    if (this.screen === 'replay' && this.watch.session) {
      this.watch.tick();
      this.renderer.onTick(this.watch.session);
      return;
    }
    if (this.screen === 'play' && this.run) {
      const { session, bot } = this.run;
      if (bot && session.state.phase === 'play') session.act(bot(session.state));
      session.tick();
      this.renderer.onTick(session);
      return;
    }
    const a = this.attract;
    if (!a || this.drawn !== a.session) return;
    const s = a.session.state;
    if (s.phase === 'play') a.session.act(a.bot(s));
    a.session.tick();
    this.renderer.onTick(a.session);
  }

  /** Phase changes that the screens follow: shop, end of run, report, the attract board starting over. */
  private follow(now: number): void {
    const run = this.run;
    if (this.screen === 'play' && run) {
      const s = run.state;
      if (s.phase === 'shop' && this.lastPhase !== 'shop') this.ui.shop.show(s);
      else if (s.phase === 'shop') this.ui.shop.render(s);
      else if (this.lastPhase === 'shop') this.ui.shop.hide();
      if (s.phase === 'shop' && run.bot) {
        this.botShopAt ||= now + 900;
        if (now > this.botShopAt) {
          this.botShopAt = 0;
          run.session.act(run.bot(s));
        }
      }
      this.lastPhase = s.phase;
      if (s.phase === 'over' && !run.reported && run.overAt && now - run.overAt > reportDelay(s)) this.showReport(run);
      return;
    }
    if (this.screen === 'replay' && this.watch.session) {
      this.watch.applySeek();
      const s = this.watch.session.state;
      if (this.watch.done && !this.watch.reported && now - (this.watch.overAt || now) > reportDelay(s)) this.showReplayReport();
      else if (!this.watch.done && this.watch.reported) {
        this.watch.reported = false;
        this.ui.report.hide();
        this.ui.replay.controls(true);
      }
      return;
    }
    const a = this.attract;
    if (!a || this.drawn !== a.session) return;
    const s = a.session.state;
    if (s.phase === 'shop') a.session.act(a.bot(s));
    if (s.phase === 'over') {
      a.overAt ||= now;
      if (now - a.overAt > 2600) this.present(this.ensureAttract().session);
    }
  }

  private showReplayReport(): void {
    const w = this.watch;
    const sess = w.session;
    if (!sess || !w.run) return;
    w.reported = true;
    this.reportT0 = performance.now();
    this.reportRect = grow(targetWindow(sess.state), 1.04);
    this.ui.replay.controls(false);
    this.ui.report.show({ s: sess.state, timeline: sess.timeline, standing: { k: 'replay', who: w.run.name, board: w.run.board }, best: null, archive: null });
  }

  private look(): Look {
    switch (this.screen) {
      case 'title':
        return 'title';
      case 'play':
        return 'play';
      case 'over':
        return 'over';
      case 'replay':
        return !this.watch.session ? 'backdrop' : this.watch.reported ? 'over' : 'play';
      default:
        return 'backdrop';
    }
  }

  private frame(alpha: number): void {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.lastNow) / 1000);
    this.lastNow = now;
    this.follow(now);
    const sess = this.drawn;
    if (!sess) return;
    const s = sess.state;
    const look = this.look();
    const playing = this.screen === 'play';
    const live = playing && s.phase === 'play' && !this.loop.paused;
    const replaying = this.screen === 'replay' && look === 'play' && this.watch.playing;
    const attract = this.attract?.session === sess;
    const threat = live || replaying ? threatOf(s) : playing && s.phase === 'over' ? 1 : attract ? threatOf(s) * 0.3 : 0;
    this.audio.setThreat(live || replaying ? threatOf(s) : 0);
    this.renderer.advance(dt, look, { threat, frozen: playing && s.phase === 'over' && s.end === 'stall' });
    this.chrome.update({
      source: playing ? 'run' : this.screen === 'title' ? 'title' : 'none',
      live: playing && s.phase === 'play',
      thr: this.renderer.thr,
      stalling: playing && s.phase === 'play' && s.stallTicks > 0,
      reduced: this.renderer.feel.reduced,
    });
    if (playing && this.run) this.ui.hud.update(s, this.tag(this.run), this.slowMeter(dt, s));
    if (this.screen === 'title') this.ui.title.live(s, now);
    if (look === 'play' && this.screen === 'replay') this.ui.replay.update(s, this.watch.duration, this.watch.playing, this.watch.speed);
    this.loop.setTimeScale(this.screen === 'replay' ? this.watch.speed : playing ? this.timeScale : 1);
    this.view = this.computeView(s, look);
    const moving = (s.phase === 'play' && !this.loop.paused) && (this.screen !== 'replay' || this.watch.playing);
    this.renderer.draw({
      sess,
      look,
      view: this.view,
      alpha: moving ? alpha : 1,
      now,
      interactive: playing && !this.loop.paused,
      tutorial: playing && !!this.run?.tutorial,
      hover: isPhone(this.W) ? null : this.input.hover,
      trail: this.input.trail,
      overAt: this.screen === 'replay' ? this.watch.overAt : (this.run?.overAt ?? 0),
      reportT0: this.reportT0,
      clearing: this.screen === 'title' ? this.typeArea : null,
    });
  }

  private slowMeter(dt: number, s: GameState) {
    const owned = !!s.up.hitl;
    this.slowmo.hold(this.slowKey || this.input.twoFingers);
    this.timeScale = this.slowmo.update(dt * 1000, owned && s.phase === 'play' && !this.loop.paused);
    return { owned, meter: this.slowmo.meter, active: this.timeScale < 1, dry: this.slowmo.dry, phone: isPhone(this.W) };
  }

  private tag(run: Run): string {
    const t = run.ticket;
    if (run.bot) return `seed · ${t.seed} · autoplay`;
    if (t.mode === 'daily' && !t.unranked) return `daily · ${run.day(dailyDay())}`;
    if (t.unranked === 'offline') return 'practice · the board is offline';
    if (t.unranked === 'custom') return `seed · ${t.seed} · practice`;
    return `seed · ${t.seed}`;
  }

  private computeView(s: GameState, look: Look): View {
    const { W, H, dpr } = this;
    if (look === 'play') return playView(W, H, dpr, this.camera.update(s), this.screen === 'replay');
    if (look === 'over') return regionView(reportRegion(W, H), this.reportRect ?? grow(targetWindow(s), 1.04), isPhone(W) && H > W, W, H, dpr);
    return bestFit(titleRegion(W, H, this.typeArea?.top ?? 0), grow(this.camera.update(s), 1.12, 900, 600), W, H, dpr);
  }

  /* ---------------------------------------------------------------- debug screens */

  /** ?screen=play|shop|over|board (with ?ff=ticks for play) under ?debug=1: straight to a screen, for screenshots. */
  jump(screen: string, ff: number): boolean {
    if (screen === 'board') {
      this.openBoard('daily');
      this.nav.replace({ name: 'board', tab: null });
      return true;
    }
    if (screen !== 'play' && screen !== 'shop' && screen !== 'over') return false;
    if (screen === 'over') {
      const base = this.customSeed ?? localSeed();
      for (let tries = 0; tries < 6; tries++) {
        const run = this.begin({ mode: 'endless', seed: tries ? `${base}-${tries}` : base, unranked: this.customSeed ? 'custom' : null }, null);
        run.tutorial = false;
        this.ahead(run, 'idle', (s) => s.phase === 'over', 60_000);
        if (run.state.end === 'leak') break;
      }
      const run = this.run!;
      run.overAt = performance.now() - 5000;
      this.finish(run);
      this.showReport(run);
    } else {
      this.play('endless');
      const run = this.run!;
      run.tutorial = false;
      if (screen === 'shop') this.ahead(run, 'heuristic', (s) => s.phase === 'shop', 20_000);
      else if (ff > 0) this.ahead(run, this.autoplay ?? 'heuristic', (s) => s.tick >= ff, ff + 4000);
      this.ui.hud.toast.hide();
    }
    this.nav.replace({ name: 'play' });
    return true;
  }

  private ahead(run: Run, bot: BotKind, until: (s: GameState) => boolean, max: number): void {
    this.ffwd = true;
    try {
      fastForward(run.session, makeBot(bot, run.ticket.seed), until, max, () => this.renderer.onTick(run.session));
    } finally {
      this.ffwd = false;
    }
    this.renderer.scene.clearBirths();
    this.camera.reset();
  }

  /* ---------------------------------------------------------------- environment */

  private resize(): void {
    this.dpr = Math.min(devicePixelRatio || 1, 2);
    this.W = innerWidth;
    this.H = innerHeight;
    this.renderer.resize(this.W, this.H, this.dpr);
    this.measureType();
  }

  private measureType(): void {
    const t = this.ui.title.measure(this.W);
    if (t) this.typeArea = t;
  }

  private applySettings(): void {
    const st = this.store.get().settings;
    const sys = this.systemReduced.matches;
    this.audio.setMuted(!st.sound);
    this.audio.setMusic(st.music);
    this.renderer.feel.shake = st.shake;
    this.renderer.feel.reduced = st.reducedMotion || sys;
    document.documentElement.classList.toggle('rm', st.reducedMotion);
    for (const b of qa(document, '[data-mute]')) b.setAttribute('aria-pressed', String(st.sound));
    this.ui.pause.sync(st, sys);
  }
}
