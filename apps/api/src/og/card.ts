import { initWasm, Resvg } from '@resvg/resvg-wasm';
import wasm from '@resvg/resvg-wasm/index_bg.wasm';
import mono from '@fontsource/fragment-mono/files/fragment-mono-latin-400-normal.woff';
import serifItalic from '@fontsource/instrument-serif/files/instrument-serif-latin-400-italic.woff';
import outfit500 from '@fontsource/outfit/files/outfit-latin-500-normal.woff';
import outfit600 from '@fontsource/outfit/files/outfit-latin-600-normal.woff';
import { INJECTIONS, type Replay, runReplay } from '@blast/sim';
import satori from 'satori';

/** The game's own palette: warm paper, ink, and one colour for the threat. */
export const CARD = {
  ground: '#f1f0ee',
  card: '#ecebe8',
  ink: '#0e0d0c',
  ink2: '#565553',
  hair: '#0e0d0c1a',
  threat: '#e2621b',
};

let ready: Promise<void> | null = null;

type Node = { type: string; props: Record<string, unknown> };
const h = (type: string, style: Record<string, unknown>, children?: unknown): Node => ({ type, props: { style, children } });

/** A short, stable incident id for a run. */
export function incidentId(seed: string, tick: number, score: number): string {
  let x = 2166136261;
  for (const c of `${seed}:${tick}:${score}`) x = Math.imul(x ^ c.charCodeAt(0), 16777619);
  return `INC-${((x >>> 0).toString(36).toUpperCase() + 'K7Q2').slice(0, 4)}`;
}

/** The final board, drawn the way the game draws it: links as dotted streams, the leak path in orange. */
function boardSvg(replay: Replay): string {
  const { state: s } = runReplay(replay);
  const nodes = s.nodes.filter((n) => n.active);
  const xs = nodes.map((n) => n.x);
  const ys = nodes.map((n) => n.y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const W = 560;
  const H = 534;
  const k = Math.min((W - 60) / Math.max(1, x1 - x0), (H - 60) / Math.max(1, y1 - y0));
  const px = (x: number) => 30 + (x - x0) * k + (W - 60 - (x1 - x0) * k) / 2;
  const py = (y: number) => 30 + (y - y0) * k + (H - 60 - (y1 - y0) * k) / 2;
  const path = s.leakPath ?? [];
  const hot = new Set<string>();
  for (let i = 1; i < path.length; i++) hot.add([path[i - 1], path[i]].sort().join('-'));
  let dots = '';
  let lines = '';
  for (const e of s.edges) {
    if (e.removed) continue;
    const A = s.nodes[e.a]!;
    const B = s.nodes[e.b]!;
    const [ax, ay, bx, by] = [px(A.x), py(A.y), px(B.x), py(B.y)];
    if (hot.has([e.a, e.b].sort().join('-'))) {
      lines += `<line x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}" stroke="${CARD.threat}" stroke-opacity=".22" stroke-width="12" stroke-linecap="round"/>`;
      lines += `<line x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}" stroke="${CARD.threat}" stroke-width="3.2" stroke-linecap="round"/>`;
      continue;
    }
    const n = Math.max(3, Math.round(Math.hypot(bx - ax, by - ay) / 7));
    for (let i = 1; i < n; i++) {
      const t = i / n;
      dots += `<circle cx="${(ax + (bx - ax) * t).toFixed(1)}" cy="${(ay + (by - ay) * t).toFixed(1)}" r="1.25" fill="${CARD.ink2}" fill-opacity=".55"/>`;
    }
  }
  const marks = nodes
    .map((n) => {
      const x = px(n.x);
      const y = py(n.y);
      const onPath = path.includes(n.id);
      if (n.kind === 'vault') return `<rect x="${x - 9}" y="${y - 9}" width="18" height="18" fill="${CARD.ground}" stroke="${onPath ? CARD.threat : CARD.ink}" stroke-width="2"/>`;
      if (n.id === s.out && onPath) return `<circle cx="${x}" cy="${y}" r="9" fill="${CARD.threat}"/>`;
      const r = n.kind === 'agent' ? 4.5 + n.degree * 1.1 : 8;
      return `<circle cx="${x}" cy="${y}" r="${r}" fill="${n.infection === 2 ? CARD.threat : CARD.ground}" stroke="${onPath ? CARD.threat : CARD.ink}" stroke-width="1.6"/>`;
    })
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${dots}${lines}${marks}</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

export async function renderCard(run: { name: string; replay: Replay }): Promise<Uint8Array> {
  ready ??= initWasm(wasm);
  await ready;
  const { state: s } = runReplay(run.replay);
  const leak = s.end === 'leak';
  const payload = leak && s.rootPayload !== null ? INJECTIONS[s.rootPayload]! : null;
  const quote = payload ? `“${payload.length > 120 ? `${payload.slice(0, 117)}…` : payload}”` : '“The backlog outgrew the swarm.”';
  const stat = (label: string, value: string, hot = false) =>
    h('div', { display: 'flex', flexDirection: 'column', gap: 4, flex: 1, borderTop: `1px solid ${CARD.hair}`, paddingTop: 14 }, [
      h('div', { fontFamily: 'Outfit', fontWeight: 500, fontSize: 15, color: CARD.ink2 }, label),
      h('div', { fontFamily: 'Outfit', fontWeight: 600, fontSize: 40, letterSpacing: -1.2, color: hot ? CARD.threat : CARD.ink }, value),
    ]);
  const tree = h('div', { width: 1200, height: 630, display: 'flex', background: CARD.ground, color: CARD.ink, padding: 48, gap: 48 }, [
    h('div', { display: 'flex', flexDirection: 'column', justifyContent: 'space-between', width: 520, height: 534 }, [
      h('div', { display: 'flex', flexDirection: 'column', gap: 18 }, [
        h('div', { display: 'flex', justifyContent: 'space-between', alignItems: 'center' }, [
          h('div', { fontFamily: 'Mono', fontSize: 16, color: CARD.ink2 }, 'incident report · blast radius'),
          h('div', { fontFamily: 'Mono', fontSize: 14, color: '#fff', background: leak ? CARD.threat : CARD.ink, padding: '5px 12px', borderRadius: 999 },
            leak ? 'LEAK · SEV-1' : 'STALL · SEV-2'),
        ]),
        h('div', { fontFamily: 'Outfit', fontWeight: 600, fontSize: 88, letterSpacing: -4.6, lineHeight: 0.95 }, incidentId(run.replay.seed, s.tick, s.score)),
        h('div', { display: 'flex', borderLeft: `2px solid ${CARD.threat}`, paddingLeft: 18 },
          h('div', { fontFamily: 'Serif', fontStyle: 'italic', fontSize: 31, lineHeight: 1.18, color: CARD.ink }, quote)),
      ]),
      h('div', { display: 'flex', gap: 22 }, [
        stat('Score', s.score.toLocaleString('en-US')),
        stat('Waves', String(s.wave)),
        stat('Infections', String(s.infectedTotal), s.infectedTotal > 0),
      ]),
    ]),
    h('div', { display: 'flex', width: 560, height: 534, background: CARD.card, borderRadius: 24, border: `1px solid ${CARD.hair}` }, [
      { type: 'img', props: { src: boardSvg(run.replay), width: 560, height: 534 } },
    ]),
  ]);
  const svg = await satori(tree as never, {
    width: 1200,
    height: 630,
    fonts: [
      { name: 'Outfit', data: Buffer.from(outfit500), weight: 500, style: 'normal' },
      { name: 'Outfit', data: Buffer.from(outfit600), weight: 600, style: 'normal' },
      { name: 'Mono', data: Buffer.from(mono), weight: 400, style: 'normal' },
      { name: 'Serif', data: Buffer.from(serifItalic), weight: 400, style: 'italic' },
    ],
  });
  return new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } }).render().asPng();
}
