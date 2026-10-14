/** Builds one element from trusted markup. Dynamic text goes in with textContent or esc(). */
export function el<T extends HTMLElement = HTMLElement>(html: string): T {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  const node = t.content.firstElementChild;
  if (!node) throw new Error('empty template');
  return node as T;
}

/** The element a component's own markup guarantees. */
export function q<T extends Element = HTMLElement>(root: ParentNode, sel: string): T {
  const node = root.querySelector<T>(sel);
  if (!node) throw new Error(`missing ${sel}`);
  return node;
}

export function qa<T extends Element = HTMLElement>(root: ParentNode, sel: string): T[] {
  return Array.from(root.querySelectorAll<T>(sel));
}

const ENT: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ENT[c] ?? c);

export const nf = (n: number): string => Math.round(n).toLocaleString('en-US');

/** Focuses after the element has been shown, without scrolling or a focus ring for pointer users. */
export function focusSoon(node: HTMLElement, ms = 40): void {
  setTimeout(() => node.focus({ preventScroll: true, focusVisible: false } as FocusOptions), ms);
}

/** Re-runs a one-shot CSS animation class. */
export function replay(node: HTMLElement, cls: string): void {
  node.classList.remove(cls);
  void node.offsetWidth;
  node.classList.add(cls);
}

/** Writes text and classes only when they change, so per-frame HUD updates stay cheap. */
export class Diff {
  private readonly seen = new Map<string, unknown>();

  changed(key: string, v: unknown): boolean {
    if (this.seen.get(key) === v) return false;
    this.seen.set(key, v);
    return true;
  }

  text(node: HTMLElement, key: string, v: string): void {
    if (this.changed(key, v)) node.textContent = v;
  }

  cls(node: HTMLElement, cls: string, on: boolean): void {
    let m = this.classes.get(node);
    if (!m) this.classes.set(node, (m = new Map()));
    if (m.get(cls) === on) return;
    m.set(cls, on);
    node.classList.toggle(cls, on);
  }

  clear(): void {
    this.seen.clear();
    this.classes = new WeakMap();
  }

  private classes = new WeakMap<HTMLElement, Map<string, boolean>>();
}

/** The UTC day (YYYY-MM-DD) as "14 oct". */
export function shortDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return day;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).toLowerCase();
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
