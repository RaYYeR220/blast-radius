/** Start of the fixed window (ms) that `t` falls into. */
export function windowStart(t: number, minutes: number): number {
  const w = minutes * 60_000;
  return Math.floor(t / w) * w;
}

/** Salted SHA-256 of the caller's IP and the route, so raw IPs never reach storage. */
export async function hashKey(ip: string, route: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}|${route}|${ip}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
