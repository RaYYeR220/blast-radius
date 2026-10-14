import type { GameState, Packet, SimEvent } from '@blast/sim';
import { type Point } from '../game/input';
import { packetXY, type Session } from '../game/session';
import { boardTransform, toScreen, type View } from '../game/view';

const C = {
  ground: '#11100e',
  grid: 'rgba(255,255,255,0.035)',
  edge: 'rgba(214,208,196,0.55)',
  peer: 'rgba(214,208,196,0.3)',
  node: '#e6e0d4',
  task: '#f4f1ea',
  threat: '#ff5a46',
  secret: '#ffd23f',
  quarantine: '#7d8ca3',
  trail: 'rgba(255,255,255,0.85)',
};

interface Burst {
  x: number;
  y: number;
  t: number;
  color: string;
}

/** Placeholder renderer for the playable graybox; the final look replaces it. */
export class GrayboxRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private bursts: Burst[] = [];
  private shake = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
  }

  onEvent(s: GameState, e: SimEvent): void {
    if (e.e === 'intercept') {
      const p = s.packets.find((q) => q.id === e.packet);
      if (p) this.bursts.push({ ...packetXY(s, p), t: 0, color: C.threat });
    }
    if (e.e === 'infect' || e.e === 'leak') this.shake = 10;
  }

  draw(session: Session, v: View, alpha: number, trail: readonly Point[]): void {
    const s = session.state;
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = C.ground;
    ctx.fillRect(0, 0, W, H);
    const [a, b, c, d, e, f] = boardTransform(v);
    const sx = this.shake > 0 ? (Math.random() - 0.5) * this.shake : 0;
    const sy = this.shake > 0 ? (Math.random() - 0.5) * this.shake : 0;
    this.shake *= 0.85;
    ctx.setTransform(a, b, c, d, e + sx, f + sy);

    ctx.strokeStyle = C.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= 1600; x += 50) { ctx.moveTo(x, 0); ctx.lineTo(x, 1000); }
    for (let y = 0; y <= 1000; y += 50) { ctx.moveTo(0, y); ctx.lineTo(1600, y); }
    ctx.stroke();

    for (const edge of s.edges) {
      if (edge.removed) continue;
      const A = s.nodes[edge.a]!;
      const B = s.nodes[edge.b]!;
      ctx.strokeStyle = edge.peer ? C.peer : C.edge;
      ctx.lineWidth = 3;
      ctx.setLineDash(edge.peer ? [10, 8] : []);
      const severed = edge.severedUntil > s.tick;
      if (severed && edge.gapT >= 0) {
        const gap = 18 / edge.len;
        const t0 = Math.max(0, edge.gapT - gap);
        const t1 = Math.min(1, edge.gapT + gap);
        ctx.beginPath();
        ctx.moveTo(A.x, A.y);
        ctx.lineTo(A.x + (B.x - A.x) * t0, A.y + (B.y - A.y) * t0);
        ctx.moveTo(A.x + (B.x - A.x) * t1, A.y + (B.y - A.y) * t1);
        ctx.lineTo(B.x, B.y);
        ctx.stroke();
      } else {
        ctx.globalAlpha = severed ? 0.25 : 1;
        ctx.beginPath();
        ctx.moveTo(A.x, A.y);
        ctx.lineTo(B.x, B.y);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
    ctx.setLineDash([]);

    for (const n of s.nodes) {
      if (!n.active) continue;
      const quarantined = n.quarantinedUntil > s.tick;
      ctx.fillStyle = quarantined ? C.quarantine : n.infection === 2 ? C.threat : C.node;
      ctx.beginPath();
      if (n.kind === 'vault' || n.kind === 'out') ctx.rect(n.x - 20, n.y - 20, 40, 40);
      else ctx.arc(n.x, n.y, n.kind === 'agent' ? 15 : 24, 0, Math.PI * 2);
      ctx.fill();
      if (n.infection === 1) {
        const total = n.incubVariant === 'sleeper' ? 360 : 60;
        const k = 1 - Math.max(0, n.incubateUntil - s.tick) / total;
        ctx.strokeStyle = C.threat;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(n.x, n.y, 24, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2);
        ctx.stroke();
      }
    }

    for (const p of s.packets) {
      if (p.dead) continue;
      const cur = packetXY(s, p);
      const prev = session.prev.get(p.id) ?? cur;
      const x = prev.x + (cur.x - prev.x) * alpha;
      const y = prev.y + (cur.y - prev.y) * alpha;
      this.packet(p, x, y);
    }

    for (const bu of this.bursts) {
      bu.t += 1;
      ctx.strokeStyle = bu.color;
      ctx.globalAlpha = Math.max(0, 1 - bu.t / 24);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(bu.x, bu.y, 8 + bu.t * 2.5, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    this.bursts = this.bursts.filter((bu) => bu.t < 24);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (trail.length > 1) {
      ctx.strokeStyle = C.trail;
      ctx.lineCap = 'round';
      for (let i = 1; i < trail.length; i++) {
        ctx.lineWidth = (i / trail.length) * 6 * v.dpr;
        ctx.beginPath();
        ctx.moveTo(trail[i - 1]!.x * v.dpr, trail[i - 1]!.y * v.dpr);
        ctx.lineTo(trail[i]!.x * v.dpr, trail[i]!.y * v.dpr);
        ctx.stroke();
      }
    }
    // node labels stay upright in screen space
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = `${11 * v.dpr}px ui-monospace, monospace`;
    ctx.textAlign = 'center';
    for (const n of s.nodes) {
      if (!n.active || n.kind === 'agent') continue;
      const p = toScreen(v, n.x, n.y);
      ctx.fillText(n.kind.toUpperCase(), p.x * v.dpr, (p.y + 40 * v.scale) * v.dpr);
    }
  }

  private packet(p: Packet, x: number, y: number): void {
    const ctx = this.ctx;
    if (p.kind === 'task' || !p.revealed) {
      ctx.fillStyle = C.task;
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    ctx.fillStyle = C.threat;
    ctx.strokeStyle = C.threat;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    switch (p.variant) {
      case 'fast':
        ctx.ellipse(x, y, 13, 4, 0, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'sleeper':
        ctx.moveTo(x, y - 10); ctx.lineTo(x + 10, y); ctx.lineTo(x, y + 10); ctx.lineTo(x - 10, y); ctx.closePath();
        ctx.stroke();
        break;
      case 'splitter':
        for (let k = 0; k < 3; k++) {
          const a = -Math.PI / 2 + (k * 2 * Math.PI) / 3;
          ctx.lineTo(x + Math.cos(a) * 12, y + Math.sin(a) * 12);
          ctx.lineTo(x + Math.cos(a + Math.PI / 3) * 4, y + Math.sin(a + Math.PI / 3) * 4);
        }
        ctx.closePath();
        ctx.fill();
        break;
      case 'hunter':
        ctx.moveTo(x + 12, y); ctx.lineTo(x - 8, y - 8); ctx.lineTo(x - 3, y); ctx.lineTo(x - 8, y + 8); ctx.closePath();
        ctx.fill();
        break;
      default:
        for (let k = 0; k < 8; k++) {
          const a = (k * Math.PI) / 4;
          const r = k % 2 === 0 ? 11 : 5;
          ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
        }
        ctx.closePath();
        ctx.fill();
    }
    if (p.secret) {
      ctx.fillStyle = C.secret;
      ctx.beginPath();
      ctx.arc(x, y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
