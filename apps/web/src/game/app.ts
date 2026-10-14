import { type GameState, INJECTIONS, type Phase, quarantineCost, type SimEvent } from '@blast/sim';
import { type BotKind, makeBot } from '@blast/sim/bots';
import { AudioEngine } from '../audio/engine';
import { threatOf } from '../audio/threat';
import { Api, deviceKey } from '../net/client';
import type { Look } from '../render/drift/renderer';
import { qa, shortDay } from '../ui/dom';
import type { SlowMeter } from '../ui/hud';
import { mountUi, type Ui, type UiHost } from '../ui/mount';
import type { Toggle } from '../ui/pause';
import type { Speed } from '../ui/replay';
import { BoardFeed } from './boards';
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
import { Stage } from './stage';
import { hudTag, reportOf, youText } from './standing';
import { keepMine, Submission, type SubmitState } from './submit';
import { toBoard, type View } from './view';
import { Watch } from './watch';

const BOTS: readonly string[] = ['heuristic', 'sloppy', 'idle'];
const OVERLAYS: readonly Screen[] = ['board', 'agents', 'archive'];
/** How long Play waits for an endless seed already on its way before starting unranked. */
const SEED_WAIT_MS = 1500;
/** How long the end of a run holds on the board before the report slides in. */
const reportDelay = (s: GameState) => (s.end === 'leak' ? 1900 : 1400);

/** The screen state machine and the run lifecycle: everything between the input and the pixels. */
export class App implements KeyTarget, UiHost {
  readonly store = new Store();
  readonly api = new Api({ owner: () => deviceKey() });
  readonly seeds = new SeedBank(this.api);
  readonly audio = new AudioEngine();
  readonly stage: Stage;
  readonly loop: GameLoop;
  readonly input: PointerInput;
  readonly nav = new Nav((r) => this.route(r));
  readonly watch: Watch;
  readonly ui: Ui;
  private readonly boards: BoardFeed;
  private slowmo = new SlowMo();
  screen: Screen = 'title';
  run: Run | null = null;
  attract: Attract | null = null;
  /** What the board pages are drawn over: the bot game, or the run whose report opened them. */
  private backdrop: 'attract' | 'run' = 'attract';
  /** Bumped by every screen change, so a run waiting on its seed doesn't start after the player has moved on. */
  private starting = 0;
  private readonly heard = new WeakSet<Session>();
  private lastNow = performance.now();
  private lastPhase: Phase = 'play';
  private botShopAt = 0;
  private slowKey = false;
  private timeScale = 1;
  private woke = false;
  private tutorialSeen = false;
  /** Running the sim ahead for a debug screen: no effects, no sound. */
  private ffwd = false;
  private readonly systemReduced = matchMedia('(prefers-reduced-motion: reduce)');
  private readonly autoplay: BotKind | null;
  private readonly customSeed: string | null;

  constructor(params: URLSearchParams, canvas: HTMLCanvasElement, root: HTMLElement) {
    const bot = params.get('autoplay');
    this.autoplay = bot && BOTS.includes(bot) ? (bot as BotKind) : null;
    this.customSeed = params.get('seed');
    this.stage = new Stage(canvas);
    this.ui = mountUi(root, this);
    this.boards = new BoardFeed(this.api, this.store, this.ui.board);
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
      toBoard: (x, y) => toBoard(this.stage.view, x, y),
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
    this.seeds.prefetch();
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
        const run = this.run;
        if (run?.reported && run.ticket.mode === mode && this.backdrop === 'run' && OVERLAYS.includes(this.screen)) return this.showReport(run);
        return this.startRun(mode);
      }
      case 'board':
        return this.openBoard(r.tab ?? (this.backdrop === 'run' && this.run ? this.run.ticket.mode : 'daily'));
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

  /** The session on screen (the debug hooks read it). */
  get session(): Session | null {
    return this.stage.drawn;
  }

  get view(): View {
    return this.stage.view;
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
    const run = this.run;
    const s = run?.state;
    if (!run || !s || s.phase !== 'shop') return;
    const o = s.offers[slot];
    if (!o || s.credits < o.price) this.ui.shop.refuse(slot);
    else run.session.act([{ type: 'pick', slot }]);
  }

  reroll(): void {
    const run = this.run;
    if (!run || run.state.phase !== 'shop' || run.state.credits < 3) return;
    run.session.act([{ type: 'reroll' }]);
    this.ui.shop.render(run.state);
  }

  skip(): void {
    if (this.run?.state.phase === 'shop') this.run.session.act([{ type: 'skip' }]);
  }

  /** R and Run again: always instant, whatever the board is doing with the last run. */
  again(): void {
    this.wake();
    if (this.screen === 'replay') this.watchAgain();
    else this.startRun(this.run?.ticket.mode ?? 'endless');
  }

  slow(on: boolean): void {
    this.slowKey = on;
  }

  close(): void {
    const run = this.run;
    const backToRun = this.screen !== 'replay' && this.backdrop === 'run' && run;
    this.nav.back(backToRun ? { name: run.ticket.mode === 'daily' ? 'daily' : 'play' } : { name: 'title' });
  }

  replayToggle(): void {
    if (!this.watch.reported) this.watch.toggle();
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
    const tab: BoardName = this.screen === 'replay' ? ((this.watch.run?.board as BoardName | undefined) ?? 'daily') : (this.run?.ticket.mode ?? 'daily');
    this.openBoard(tab);
    this.nav.push({ name: 'board', tab });
  }

  /** The report's quiet button: back to the title after a run, or into a game after a replay. */
  reportLeave(): void {
    if (this.screen === 'replay') this.play('endless');
    else this.quit();
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
    void this.boards.load(this.ui.board.selected);
  }

  /* ---------------------------------------------------------------- screens */

  private hideAll(): void {
    for (const s of Object.values(this.ui)) s.hide();
    this.boards.cancel();
    this.starting++;
  }

  private showTitle(): void {
    this.watch.stop();
    this.screen = 'title';
    this.backdrop = 'attract';
    this.hideAll();
    this.stage.present(this.ensureAttract().session);
    this.ui.title.show(shortDay(dailyDay()), Object.keys(this.store.get().archive).length, INJECTIONS.length);
    this.seeds.prefetch();
    this.measureType();
  }

  private startRun(mode: 'endless' | 'daily'): void {
    const go = () => this.begin(this.seeds.ticket(mode, { custom: this.customSeed, autoplay: !!this.autoplay }), this.autoplay);
    if (mode === 'daily' || this.customSeed || this.autoplay || this.seeds.hasSeed) return void go();
    // a seed still on its way is worth a moment: without it the run can't be ranked
    const ticket = ++this.starting;
    void this.seeds.settle(SEED_WAIT_MS).then(() => {
      if (ticket === this.starting) go();
    });
  }

  private begin(ticket: Ticket, bot: BotKind | null): Run {
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
    this.stage.renderer.calm();
    this.input.reset();
    this.lastPhase = 'play';
    this.botShopAt = 0;
    if (this.loop.paused) this.loop.resume();
    const hint = 'keep the work flowing · cut what turns orange';
    this.ui.hud.toast.show(ticket.mode === 'daily' ? `Daily · ${shortDay(run.day(dailyDay()))}` : 'Wave 1', hint);
    return run;
  }

  private showReport(run: Run): void {
    run.reported = true;
    this.screen = 'over';
    this.backdrop = 'run';
    this.hideAll();
    this.stage.present(run.session);
    this.stage.frameReport(run.state);
    this.ui.report.show(reportOf(run, this.store.get(), dailyDay()));
    const sub = run.submission;
    if (sub && sub.state.k !== 'idle') this.ui.report.setSubmit(sub.state, sub.run.board);
  }

  private openBoard(tab: BoardName): void {
    this.overlay('board');
    this.ui.board.show(tab, youText(tab, this.store.get(), dailyDay()));
    void this.boards.load(tab);
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
    this.stage.present(overRun && this.run ? this.run.session : this.ensureAttract().session);
  }

  private openReplay(id: string): void {
    this.screen = 'replay';
    this.backdrop = 'attract';
    this.hideAll();
    this.stage.present(this.ensureAttract().session);
    void this.watch.load(id);
  }

  private watchAgain(): void {
    this.ui.report.hide();
    this.ui.replay.controls(true);
    this.watch.again();
  }

  private showReplayReport(): void {
    const { session: sess, run } = this.watch;
    if (!sess || !run) return;
    this.watch.reported = true;
    this.stage.frameReport(sess.state);
    this.ui.replay.controls(false);
    this.ui.report.show({ s: sess.state, timeline: sess.timeline, standing: { k: 'replay', who: run.name, board: run.board }, best: null, archive: null });
  }

  /* ---------------------------------------------------------------- sessions and their events */

  private ensureAttract(): Attract {
    if (this.attract && this.attract.session.state.phase !== 'over') return this.attract;
    const a = new Attract();
    this.attract = a;
    a.session.on((e) => {
      if (this.stage.drawn === a.session) this.stage.renderer.onEvent(a.session, e, false);
    });
    return a;
  }

  private listen(sess: Session, kind: 'run' | 'replay', intro: boolean): void {
    this.stage.present(sess, intro, true);
    if (this.heard.has(sess)) return;
    this.heard.add(sess);
    sess.on((e) => {
      if (this.stage.drawn !== sess || this.ffwd) return;
      if (kind === 'run') this.onRunEvent(e);
      else this.onReplayEvent(e);
    });
  }

  private onRunEvent(e: SimEvent): void {
    const run = this.run;
    if (!run) return;
    this.audio.onEvent(e);
    this.stage.renderer.onEvent(run.session, e, true);
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
    this.stage.renderer.onEvent(sess, e, true);
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
    const finished = { board: run.ticket.mode, replay: run.session.replay(), score: s.score, token: run.ticket.token, day };
    run.submission = new Submission(finished, this.api, (st) => this.onSubmit(run, st));
  }

  private onSubmit(run: Run, st: SubmitState): void {
    const sub = run.submission;
    if (!sub) return;
    if (st.k === 'ranked') this.store.update((d) => keepMine(d, sub.run, st.id));
    if (this.screen === 'over' && this.run === run) this.ui.report.setSubmit(st, sub.run.board);
    else if (st.k === 'ranked' && this.screen === 'play') this.ui.hud.toast.show(`#${st.rank}`, `your last run, on the ${sub.run.board} board`);
  }

  private denied(node: number, why: 'credits' | 'quarantined'): void {
    const s = this.run?.state;
    const n = s?.nodes[node];
    if (!s || !n) return;
    const text = why === 'credits' ? `need ${quarantineCost(s)} credits` : 'already sealed';
    this.stage.renderer.scene.addFx({ k: 'deny', t0: 0, dur: 1000, bx: n.x, by: n.y, text });
    if (why === 'credits') this.ui.hud.deny();
  }

  /* ---------------------------------------------------------------- loop */

  private playable(): boolean {
    return this.screen === 'play' && !this.loop.paused && this.run?.state.phase === 'play';
  }

  private tick(): void {
    const r = this.stage.renderer;
    const replay = this.screen === 'replay' ? this.watch.session : null;
    if (replay) {
      this.watch.tick();
      r.onTick(replay);
      return;
    }
    if (this.screen === 'play' && this.run) {
      const { session, bot } = this.run;
      if (bot && session.state.phase === 'play') session.act(bot(session.state));
      session.tick();
      r.onTick(session);
      return;
    }
    const a = this.attract;
    if (!a || this.stage.drawn !== a.session) return;
    if (a.session.state.phase === 'play') a.session.act(a.bot(a.session.state));
    a.session.tick();
    r.onTick(a.session);
  }

  /** Phase changes the screens follow: shop, end of run, report, the replay's end, the attract board starting over. */
  private follow(now: number): void {
    if (this.screen === 'play' && this.run) this.followRun(this.run, now);
    else if (this.screen === 'replay' && this.watch.session) this.followReplay(now);
    else this.followAttract(now);
  }

  private followRun(run: Run, now: number): void {
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
  }

  private followReplay(now: number): void {
    const w = this.watch;
    w.applySeek();
    const s = w.session!.state;
    if (w.done && !w.reported && now - (w.overAt || now) > reportDelay(s)) this.showReplayReport();
    else if (!w.done && w.reported) {
      w.reported = false;
      this.ui.report.hide();
      this.ui.replay.controls(true);
    }
  }

  private followAttract(now: number): void {
    const a = this.attract;
    if (!a || this.stage.drawn !== a.session) return;
    const s = a.session.state;
    if (s.phase === 'shop') a.session.act(a.bot(s));
    if (s.phase !== 'over') return;
    a.overAt ||= now;
    if (now - a.overAt > 2600) this.stage.present(this.ensureAttract().session);
  }

  private look(): Look {
    if (this.screen === 'title' || this.screen === 'play' || this.screen === 'over') return this.screen;
    if (this.screen === 'replay' && this.watch.session) return this.watch.reported ? 'over' : 'play';
    return 'backdrop';
  }

  private frame(alpha: number): void {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.lastNow) / 1000);
    this.lastNow = now;
    this.follow(now);
    const sess = this.stage.drawn;
    if (!sess) return;
    const s = sess.state;
    const look = this.look();
    const playing = this.screen === 'play';
    const replaying = this.screen === 'replay' && look === 'play';
    const live = playing && s.phase === 'play' && !this.loop.paused;
    const moving = live || (replaying && this.watch.playing);
    const ticking = s.phase === 'play' && !this.loop.paused && (this.screen !== 'replay' || this.watch.playing);
    const attract = this.attract?.session === sess;
    this.audio.setThreat(moving ? threatOf(s) : 0);
    if (playing && this.run) this.ui.hud.update(s, hudTag(this.run, dailyDay()), this.slowMeter(dt, s));
    if (this.screen === 'title') this.ui.title.live(s, now);
    if (replaying) this.ui.replay.update(s, this.watch.duration, this.watch.playing, this.watch.speed);
    this.loop.setTimeScale(this.screen === 'replay' ? this.watch.speed : playing ? this.timeScale : 1);
    this.stage.draw(sess, {
      look,
      dt,
      now,
      alpha: ticking ? alpha : 1,
      threat: moving ? threatOf(s) : playing && s.phase === 'over' ? 1 : attract ? threatOf(s) * 0.3 : 0,
      frozen: playing && s.phase === 'over' && s.end === 'stall',
      escalation: { source: playing ? 'run' : this.screen === 'title' ? 'title' : 'none', live: playing && s.phase === 'play', stalling: playing && s.phase === 'play' && s.stallTicks > 0 },
      replay: replaying,
      interactive: playing && !this.loop.paused,
      tutorial: playing && !!this.run?.tutorial,
      hover: this.stage.phone ? null : this.input.hover,
      trail: this.input.trail,
      overAt: this.screen === 'replay' ? this.watch.overAt : (this.run?.overAt ?? 0),
      clearing: this.screen === 'title',
    });
  }

  private slowMeter(dt: number, s: GameState): SlowMeter {
    const owned = !!s.up.hitl;
    this.slowmo.hold(this.slowKey || this.input.twoFingers);
    this.timeScale = this.slowmo.update(dt * 1000, owned && s.phase === 'play' && !this.loop.paused);
    return { owned, meter: this.slowmo.meter, active: this.timeScale < 1, dry: this.slowmo.dry, phone: this.stage.phone };
  }

  /* ---------------------------------------------------------------- debug screens */

  /** ?screen=play|shop|over|board (with ?ff=ticks for play) under ?debug=1: straight to a screen, for screenshots. */
  jump(screen: string, ff: number): boolean {
    if (screen === 'board') {
      this.openBoardTab('daily');
      return true;
    }
    if (screen === 'over') this.jumpToReport();
    else if (screen === 'play' || screen === 'shop') {
      this.play('endless');
      const run = this.run!;
      run.tutorial = false;
      if (screen === 'shop') this.ahead(run, 'heuristic', (s) => s.phase === 'shop', 20_000);
      else if (ff > 0) this.ahead(run, this.autoplay ?? 'heuristic', (s) => s.tick >= ff, ff + 4000);
      this.ui.hud.toast.hide();
    } else return false;
    this.nav.replace({ name: 'play' });
    return true;
  }

  /** Plays seeds with no defence until one leaks, then opens its report. */
  private jumpToReport(): void {
    const base = this.customSeed ?? localSeed();
    let run = this.run;
    for (let tries = 0; tries < 6; tries++) {
      run = this.begin({ mode: 'endless', seed: tries ? `${base}-${tries}` : base, unranked: this.customSeed ? 'custom' : null }, null);
      run.tutorial = false;
      this.ahead(run, 'idle', (s) => s.phase === 'over', 60_000);
      if (run.state.end === 'leak') break;
    }
    if (!run) return;
    run.overAt = performance.now() - 5000;
    this.finish(run);
    this.showReport(run);
  }

  private ahead(run: Run, bot: BotKind, until: (s: GameState) => boolean, max: number): void {
    const r = this.stage.renderer;
    this.ffwd = true;
    try {
      fastForward(run.session, makeBot(bot, run.ticket.seed), until, max, () => r.onTick(run.session));
    } finally {
      this.ffwd = false;
    }
    r.scene.clearBirths();
    this.stage.camera.reset();
  }

  /* ---------------------------------------------------------------- environment */

  private resize(): void {
    this.stage.resize();
    this.measureType();
  }

  private measureType(): void {
    const t = this.ui.title.measure(this.stage.W);
    if (t) this.stage.typeArea = t;
  }

  private applySettings(): void {
    const st = this.store.get().settings;
    const sys = this.systemReduced.matches;
    const feel = this.stage.renderer.feel;
    this.audio.setMuted(!st.sound);
    this.audio.setMusic(st.music);
    feel.shake = st.shake;
    feel.reduced = st.reducedMotion || sys;
    document.documentElement.classList.toggle('rm', st.reducedMotion);
    for (const b of qa(document, '[data-mute]')) b.setAttribute('aria-pressed', String(st.sound));
    this.ui.pause.sync(st, sys);
  }
}
