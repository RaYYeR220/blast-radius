import { backlog, capacity, createGame, type GameOptions, quarantineCost, UPGRADES } from '@blast/sim';
import { type BotKind, makeBot } from '@blast/sim/bots';
import { AudioEngine } from './audio/engine';
import { threatOf } from './audio/threat';
import { Camera } from './game/camera';
import { Blade, tapToAction } from './game/input';
import { GameLoop } from './game/loop';
import { Session } from './game/session';
import { fitView, toBoard, toScreen, type View } from './game/view';
import { GrayboxRenderer } from './render/graybox';

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('board') as HTMLCanvasElement;
const hud = document.createElement('div');
hud.style.cssText =
  'position:fixed;left:12px;top:10px;font:13px/1.5 ui-monospace,monospace;color:#e6e0d4;pointer-events:none;white-space:pre';
const panel = document.createElement('div');
panel.style.cssText =
  'position:fixed;inset:auto 0 24px 0;display:flex;gap:10px;justify-content:center;font:14px ui-monospace,monospace';
document.body.append(hud, panel);
document.body.style.cssText = 'margin:0;background:#11100e;overflow:hidden;touch-action:none;user-select:none';

const INSETS = { top: 56, right: 12, bottom: 56, left: 12 };
const camera = new Camera();
const audio = new AudioEngine();
let muted = false;
let dpr = 1;
let view: View = fitView(innerWidth, innerHeight, 1);
const renderer = new GrayboxRenderer(canvas);
const blade = new Blade({ toBoard: (x, y) => toBoard(view, x, y) });
let session: Session;
let autoplay: ReturnType<typeof makeBot> | null = null;

function newRun(): void {
  const opts: GameOptions = { seed: params.get('seed') ?? `run-${Date.now()}`, mode: 'endless' };
  session = new Session(opts, createGame(opts));
  session.on((e) => {
    renderer.onEvent(session.state, e);
    audio.onEvent(e);
  });
  const kind = params.get('autoplay') as BotKind | null;
  autoplay = kind ? makeBot(kind, opts.seed) : null;
  camera.reset();
  panel.replaceChildren();
}

function resize(): void {
  dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.round(innerWidth * dpr);
  canvas.height = Math.round(innerHeight * dpr);
  canvas.style.cssText = `width:${innerWidth}px;height:${innerHeight}px;display:block`;
}

function button(label: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = label;
  b.style.cssText = 'font:inherit;padding:10px 14px;background:#22201c;color:#e6e0d4;border:1px solid #444;cursor:pointer';
  b.onclick = onClick;
  return b;
}

function syncPanels(): void {
  const s = session.state;
  if (s.phase === 'shop' && panel.childElementCount === 0) {
    s.offers.forEach((o, i) => {
      const u = UPGRADES[o.id];
      const b = button(`${i + 1}. ${u.name} (${o.price})`, () => session.act([{ type: 'pick', slot: i as 0 | 1 | 2 }]));
      b.disabled = s.credits < o.price;
      panel.append(b);
    });
    panel.append(button('skip', () => session.act([{ type: 'skip' }])));
  } else if (s.phase === 'play' && panel.childElementCount > 0) {
    panel.replaceChildren();
  } else if (s.phase === 'over' && panel.childElementCount === 0) {
    panel.append(button(`${s.end?.toUpperCase()} — R to run again`, newRun));
  }
}

const loop = new GameLoop({
  onTick: () => {
    if (autoplay && session.state.phase === 'play') session.act(autoplay(session.state));
    session.tick();
  },
  onRender: (alpha) => {
    const s = session.state;
    view = fitView(innerWidth, innerHeight, dpr, INSETS, camera.update(s));
    audio.setThreat(s.phase === 'play' ? threatOf(s) : 0);
    if (autoplay && s.phase === 'shop') session.act(autoplay(s));
    syncPanels();
    hud.textContent =
      `wave ${s.wave}   score ${s.score}   credits ${s.credits}   quarantine ${quarantineCost(s)}\n` +
      `backlog ${backlog(s)}/${capacity(s)}${s.stallTicks ? `   STALL in ${((300 - s.stallTicks) / 60).toFixed(1)}s` : ''}` +
      `${loop.paused ? '   PAUSED (Esc)' : ''}`;
    renderer.draw(session, view, alpha, blade.active ? blade.trail() : []);
  },
});

function wake(): void {
  audio.unlock();
  audio.startMusic();
}

canvas.addEventListener('pointerdown', (e) => {
  wake();
  canvas.setPointerCapture(e.pointerId);
  blade.begin(e.clientX, e.clientY);
});
canvas.addEventListener('pointermove', (e) => {
  if (!blade.active) return;
  const cuts = blade.move(e.clientX, e.clientY, session.state.phase === 'play' ? session.state : undefined);
  session.act(cuts);
});
canvas.addEventListener('pointerup', () => {
  const r = blade.end();
  if (r && 'tap' in r && session.state.phase === 'play') {
    const t = tapToAction(session.state, r.tap);
    if (t && 'action' in t) session.act([t.action]);
  }
});
addEventListener('keydown', (e) => {
  wake();
  if (e.key === 'm' || e.key === 'M') audio.setMuted((muted = !muted));
  if (e.key === 'r' || e.key === 'R') newRun();
  if (e.key === 'Escape') loop.paused ? loop.resume() : loop.pause();
  const s = session.state;
  if (s.phase === 'shop' && ['1', '2', '3'].includes(e.key)) {
    const slot = Number(e.key) - 1;
    const o = s.offers[slot];
    if (o && s.credits >= o.price) session.act([{ type: 'pick', slot: slot as 0 | 1 | 2 }]);
  }
  if (s.phase === 'shop' && e.key === 'Enter') session.act([{ type: 'skip' }]);
});
addEventListener('resize', resize);

resize();
newRun();
loop.start();
if (params.has('debug')) {
  (window as unknown as { __blast: unknown }).__blast = {
    get session() { return session; },
    loop,
    toScreen: (bx: number, by: number) => toScreen(view, bx, by),
  };
}
