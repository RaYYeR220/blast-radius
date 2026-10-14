import { destroy } from './packets';
import { dist2 } from './geom';
import { relink, removeEdge } from './graph';
import type { GameState, Offer, SimEdge, UpgradeId } from './types';

export interface UpgradeInfo {
  name: string;
  blurb: string;
  price: number;
  stackable: boolean;
}

export const UPGRADES: Readonly<Record<UpgradeId, UpgradeInfo>> = {
  sandbox: { name: 'Sandbox', blurb: 'Quarantine costs 2 and lasts 3 seconds.', price: 8, stackable: false },
  rateLimit: { name: 'Rate Limit', blurb: 'Traffic on vault links moves 40% slower.', price: 10, stackable: false },
  canary: { name: 'Canary Token', blurb: 'The next leak walks off with a decoy. Stacks.', price: 14, stackable: true },
  hitl: { name: 'Human in the Loop', blurb: 'Hold Space or two fingers to slow time.', price: 12, stackable: false },
  allowlist: { name: 'Allowlist', blurb: 'Outbound listens to one link only.', price: 10, stackable: false },
  breaker: { name: 'Circuit Breaker', blurb: 'A link carrying two injections trips itself.', price: 12, stackable: false },
  rollback: { name: 'Rollback', blurb: 'Infected agents restore themselves after 3 s.', price: 12, stackable: false },
  leastPriv: { name: 'Least Privilege', blurb: 'Fewer jobs touch the vault; it keeps two links.', price: 9, stackable: false },
  fastHeal: { name: 'Fast Heal', blurb: 'Cut links reconnect in 1.8 seconds.', price: 7, stackable: false },
  wideBlade: { name: 'Wide Blade', blurb: 'Your cuts reach further along the link.', price: 6, stackable: false },
};

function linksOf(s: GameState, node: number): SimEdge[] {
  return s.edges.filter((e) => !e.removed && (e.a === node || e.b === node));
}

/** Keeps a node's `keep` shortest links and drops the rest, never stranding a neighbour. */
function pruneLinks(s: GameState, node: number, keep: number): void {
  const n = s.nodes[node]!;
  const ranked = linksOf(s, node)
    .map((e) => {
      const o = s.nodes[e.a === node ? e.b : e.a]!;
      return { e, d: dist2(n.x, n.y, o.x, o.y) };
    })
    .sort((p, q) => p.d - q.d || p.e.id - q.e.id);
  for (const { e } of ranked.slice(keep)) {
    const other = e.a === node ? e.b : e.a;
    for (const p of s.packets) {
      if (p.dead || p.edge !== e.id) continue;
      destroy(s, p, 'quarantine');
    }
    removeEdge(s, e);
    if (s.nodes[other]!.degree === 0 && !relink(s, other)) {
      // could not re-home the neighbour: restore the link rather than strand it
      e.removed = false;
      s.nodes[e.a]!.degree++;
      s.nodes[e.b]!.degree++;
      s.adjDirty = true;
    }
  }
}

export function applyUpgrade(s: GameState, id: UpgradeId): void {
  if (id === 'canary') {
    s.canaries++;
    s.up.canary = true;
    return;
  }
  s.up[id] = true;
  if (id === 'allowlist') pruneLinks(s, s.out, 1);
  if (id === 'leastPriv') pruneLinks(s, s.vault, 2);
}

const ORDER = Object.keys(UPGRADES) as UpgradeId[];

/** Three distinct offers; owned one-off upgrades are never offered again. */
export function rollOffers(s: GameState): Offer[] {
  const pool = ORDER.filter((id) => UPGRADES[id].stackable || !s.up[id]);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = s.rng.int(i + 1);
    const t = pool[i]!;
    pool[i] = pool[j]!;
    pool[j] = t;
  }
  return pool.slice(0, 3).map((id) => ({ id, price: UPGRADES[id].price }));
}
