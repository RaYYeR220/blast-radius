import type { GameState, SimEvent } from '@blast/sim';
import { packetXY, type Session } from '../../game/session';
import type { Feel } from './feel';
import { makeBurst } from './fx';
import { lerp } from './math';
import { C } from './palette';
import type { Scene } from './scene';

/** Board position of a packet that may already have been swept this tick. */
function packetAt(sess: Session, id: number): { x: number; y: number } | null {
  const pv = sess.prev.get(id);
  if (pv) return pv;
  const p = sess.state.packets.find((q) => q.id === id);
  return p ? packetXY(sess.state, p) : null;
}

/** Board position along an edge; t < 0 falls back to the gap, then the middle. */
function edgeAt(s: GameState, edge: number, t: number): { x: number; y: number } | null {
  const ed = s.edges[edge];
  if (!ed) return null;
  const A = s.nodes[ed.a]!;
  const B = s.nodes[ed.b]!;
  const u = t >= 0 ? t : ed.gapT >= 0 ? ed.gapT : 0.5;
  return { x: lerp(A.x, B.x, u), y: lerp(A.y, B.y, u) };
}

function nodeAt(s: GameState, id: number): { x: number; y: number } | null {
  const n = s.nodes[id];
  return n ? { x: n.x, y: n.y } : null;
}

/**
 * Turns one simulation event into what the player sees and feels: effects on
 * the board, shake, flash and hit-stop. `live` is false for the attract mode,
 * which gets the effects but none of the impact.
 */
export function feelEvent(scene: Scene, feel: Feel, sess: Session, e: SimEvent, live: boolean, now: number): void {
  const s = sess.state;
  switch (e.e) {
    case 'intercept': {
      const p = packetAt(sess, e.packet) ?? edgeAt(s, e.edge, -1);
      if (!p) return;
      scene.lastIntercept = p;
      scene.addFx(makeBurst(p.x, p.y, e.variant, 650));
      scene.addFx({ k: 'pop', t0: 0, dur: 800, bx: p.x, by: p.y, text: '+25' });
      if (live) feel.pendingFreeze = true;
      return;
    }
    case 'combo': {
      const p = scene.lastIntercept;
      if (p) scene.addFx({ k: 'combo', t0: 0, dur: 1300, bx: p.x, by: p.y, n: e.n });
      feel.kick(5 + e.n * 2.5);
      return;
    }
    case 'cut': {
      const p = edgeAt(s, e.edge, e.t >= 0 ? e.t / 1000 : -1);
      if (p) scene.addFx({ k: 'cut', t0: 0, dur: 520, bx: p.x, by: p.y, edge: e.edge, trip: e.t < 0 });
      return;
    }
    case 'infect': {
      const n = nodeAt(s, e.node);
      if (n) scene.addFx({ k: 'infect', t0: 0, dur: 900, bx: n.x, by: n.y });
      if (live) {
        feel.flash(0.62, 0.25, now);
        feel.kick(9);
      }
      return;
    }
    case 'incubate': {
      const n = nodeAt(s, e.node);
      if (n) scene.addFx({ k: 'ring', t0: 0, dur: 500, bx: n.x, by: n.y, col: C.thr, r0: 8, r1: 34, lw: 1.5 });
      return;
    }
    case 'quarantine': {
      const n = nodeAt(s, e.node);
      if (n) scene.addFx({ k: 'seal', t0: 0, dur: 520, bx: n.x, by: n.y });
      if (live) feel.kick(3);
      return;
    }
    case 'secret': {
      const n = nodeAt(s, s.vault);
      if (n) scene.addFx({ k: 'secret', t0: 0, dur: 1500, bx: n.x, by: n.y });
      if (now - scene.keyTagAt > 2500) {
        scene.keyTagAt = now;
        scene.addFx({ k: 'tag', t0: 0, dur: 1800, bx: 0, by: 0, pid: e.packet, text: 'key taken', col: C.goldDeep });
      }
      if (live) feel.kick(4);
      return;
    }
    case 'canary': {
      const n = nodeAt(s, s.out);
      if (!n) return;
      scene.addFx({ k: 'ring', t0: 0, dur: 900, bx: n.x, by: n.y, col: C.gold, r0: 10, r1: 70, lw: 2.5 });
      scene.addFx({ k: 'label', t0: 0, dur: 2200, bx: n.x, by: n.y, text: 'canary tripped · decoy leaked', col: C.goldDeep });
      return;
    }
    case 'reveal':
      scene.addFx({ k: 'reveal', t0: 0, dur: 420, bx: 0, by: 0, pid: e.packet });
      scene.addFx({ k: 'tag', t0: 0, dur: 1300, bx: 0, by: 0, pid: e.packet, text: 'stealth', col: C.deep });
      return;
    case 'spawn': {
      const p = s.packets.find((q) => q.id === e.packet);
      if (!p || p.kind !== 'inject') return;
      if (scene.tutPacket < 0 && s.wave === 1 && s.tick <= 362 && (p.node === s.web || p.from === s.web)) scene.tutPacket = p.id;
      if (p.revealed && live && p.variant && !scene.seenVariants.has(p.variant)) {
        scene.seenVariants.add(p.variant);
        scene.addFx({ k: 'tag', t0: 0, dur: 1700, bx: 0, by: 0, pid: p.id, text: p.variant, col: C.deep });
      }
      return;
    }
    case 'convert': {
      const n = nodeAt(s, e.at);
      if (n) scene.addFx({ k: 'ring', t0: 0, dur: 560, bx: n.x, by: n.y, col: C.thr, r0: 6, r1: 40, lw: 2 });
      return;
    }
    case 'grow': {
      // the node condenses first, then its links draw out from the mesh toward it
      scene.nodeBorn.set(e.node, now);
      const n = nodeAt(s, e.node);
      if (n) scene.addFx({ k: 'ring', t0: 0, dur: 900, bx: n.x, by: n.y, col: C.ink, r0: 4, r1: 46, lw: 1 });
      for (const [id, eb] of scene.edgeBorn) {
        const ed = s.edges[id];
        if (ed && eb.t0 > now && (ed.a === e.node || ed.b === e.node)) {
          eb.fromB = ed.a === e.node;
          eb.t0 = now + 380;
        }
      }
      return;
    }
    case 'edge':
      scene.edgeBorn.set(e.edge, { t0: now + 160, fromB: false });
      return;
    case 'heal': {
      const ed = s.edges[e.edge];
      if (ed) scene.addFx({ k: 'heal', t0: 0, dur: 600, bx: 0, by: 0, edge: e.edge, t: ed.gapT });
      return;
    }
    case 'ship': {
      const n = nodeAt(s, s.user);
      if (live && n && Math.random() < 0.5) scene.addFx({ k: 'ring', t0: 0, dur: 420, bx: n.x, by: n.y, col: C.ink, r0: 10, r1: 22, lw: 1, a: 0.35 });
      return;
    }
    case 'leak':
      if (live) {
        feel.flash(0.8, 0.3, now);
        feel.kick(16);
      }
      return;
    case 'stall':
      if (live) feel.kick(10);
      return;
    default:
  }
}
