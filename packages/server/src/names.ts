// A short list; names are public on the boards, so the bar is "nothing hateful".
const BLOCKED = ['nazi', 'hitler', 'nigg', 'fagg', 'kike', 'retard', 'rape'];

/** A display name safe to show on a public board: 3–16 plain characters, or an anonymous tag. */
export function cleanName(raw: string, fallbackTag: string): string {
  const fallback = `anon-${fallbackTag}`;
  if (typeof raw !== 'string') return fallback;
  const name = raw
    .replace(/[^A-Za-z0-9 _.-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 16)
    .trim();
  if (name.length < 3) return fallback;
  // anonymous tags are handed out, never chosen
  if (name.toLowerCase().startsWith('anon-')) return fallback;
  const lower = name.toLowerCase();
  if (BLOCKED.some((w) => lower.includes(w))) return fallback;
  return name;
}
