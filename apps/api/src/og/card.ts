import { initWasm, Resvg } from '@resvg/resvg-wasm';
import wasm from '@resvg/resvg-wasm/index_bg.wasm';
import mono400 from '@fontsource/space-mono/files/space-mono-latin-400-normal.woff';
import mono700 from '@fontsource/space-mono/files/space-mono-latin-700-normal.woff';
import { INJECTIONS, type Replay, runReplay } from '@blast/sim';
import satori from 'satori';

/** Colours of the share card; they follow the game's own palette. */
export const CARD = {
  ground: '#0a0a0b',
  panel: '#16161a',
  ink: '#edebe6',
  muted: '#8a8883',
  line: '#5f5e5b',
  threat: '#ff5a1f',
};

let ready: Promise<void> | null = null;

type Node = { type: string; props: Record<string, unknown> };
const h = (type: string, style: Record<string, unknown>, children?: unknown): Node => ({ type, props: { style, children } });

/** The final board as an SVG data URI: links, agents, and the path the leak took. */
function boardSvg(replay: Replay): { uri: string; infected: number } {
  const { state: s } = runReplay(replay);
  const nodes = s.nodes.filter((n) => n.active);
  const xs = nodes.map((n) => n.x);
  const ys = nodes.map((n) => n.y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const W = 500;
  const H = 320;
  const k = Math.min((W - 40) / Math.max(1, x1 - x0), (H - 40) / Math.max(1, y1 - y0));
  const px = (x: number) => 20 + (x - x0) * k + (W - 40 - (x1 - x0) * k) / 2;
  const py = (y: number) => 20 + (y - y0) * k + (H - 40 - (y1 - y0) * k) / 2;
  const leak = new Set<string>();
  const path = s.leakPath ?? [];
  for (let i = 1; i < path.length; i++) leak.add([path[i - 1], path[i]].sort().join('-'));
  const lines = s.edges
    .filter((e) => !e.removed)
    .map((e) => {
      const hot = leak.has([e.a, e.b].sort().join('-'));
      const A = s.nodes[e.a]!;
      const B = s.nodes[e.b]!;
      return `<line x1="${px(A.x)}" y1="${py(A.y)}" x2="${px(B.x)}" y2="${py(B.y)}" stroke="${hot ? CARD.threat : CARD.line}" stroke-width="${hot ? 4 : 1.5}"/>`;
    })
    .join('');
  const dots = nodes
    .map((n) => {
      const r = n.kind === 'agent' ? 5 : 9;
      const fill = n.infection === 2 ? CARD.threat : n.kind === 'agent' ? CARD.ink : CARD.panel;
      return `<circle cx="${px(n.x)}" cy="${py(n.y)}" r="${r}" fill="${fill}" stroke="${CARD.ink}" stroke-width="${n.kind === 'agent' ? 0 : 2}"/>`;
    })
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${lines}${dots}</svg>`;
  return { uri: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`, infected: s.infectedTotal };
}

export async function renderCard(run: { name: string; replay: Replay }): Promise<Uint8Array> {
  ready ??= initWasm(wasm);
  await ready;
  const { state: s } = runReplay(run.replay);
  const board = boardSvg(run.replay);
  const leak = s.end === 'leak';
  const payload = leak && s.rootPayload !== null ? INJECTIONS[s.rootPayload]! : null;
  const incident = `INC-${run.replay.seed.length.toString(36).toUpperCase()}${(s.score % 46656).toString(36).toUpperCase().padStart(3, '0')}`;
  const stat = (label: string, value: string) =>
    h('div', { display: 'flex', flexDirection: 'column', gap: 6 }, [
      h('div', { fontSize: 34, fontWeight: 700, color: CARD.ink }, value),
      h('div', { fontSize: 16, color: CARD.muted, letterSpacing: 2 }, label),
    ]);
  const tree = h('div', { width: 1200, height: 630, display: 'flex', background: CARD.ground, color: CARD.ink, fontFamily: 'Mono', padding: 48, gap: 40 }, [
    h('div', { display: 'flex', flexDirection: 'column', justifyContent: 'space-between', width: 544, height: 534 }, [
      h('div', { display: 'flex', flexDirection: 'column', gap: 22 }, [
        h('div', { fontSize: 22, color: CARD.muted, letterSpacing: 3 }, `BLAST RADIUS · ${incident}`),
        h('div', { fontSize: 54, fontWeight: 700, lineHeight: 1.05, color: leak ? CARD.threat : CARD.ink }, leak ? `LEAK AT WAVE ${s.wave}` : `STALL AT WAVE ${s.wave}`),
        h('div', { fontSize: 24, lineHeight: 1.35, color: CARD.ink },
          payload ? `“${payload.length > 110 ? `${payload.slice(0, 107)}…` : payload}”` : 'The work backed up until the swarm stopped.'),
      ]),
      h('div', { display: 'flex', gap: 36 }, [
        stat('SCORE', s.score.toLocaleString('en-US')),
        stat('INFECTIONS', `${board.infected}`),
        stat('DEFENDER', run.name.slice(0, 12)),
      ]),
    ]),
    h('div', { display: 'flex', width: 520, height: 534, alignItems: 'center', justifyContent: 'center', background: CARD.panel, border: `1px solid ${CARD.line}` }, [
      { type: 'img', props: { src: board.uri, width: 500, height: 320 } },
    ]),
  ]);
  const svg = await satori(tree as never, {
    width: 1200,
    height: 630,
    fonts: [
      { name: 'Mono', data: Buffer.from(mono400), weight: 400, style: 'normal' },
      { name: 'Mono', data: Buffer.from(mono700), weight: 700, style: 'normal' },
    ],
  });
  return new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } }).render().asPng();
}
