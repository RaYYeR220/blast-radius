/** One shared board per UTC day. */
export function dailySeed(now: Date = new Date()): string {
  return `daily-${now.toISOString().slice(0, 10)}`;
}

export function dailyDay(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function msToNextDaily(now: Date = new Date()): number {
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return next - now.getTime();
}
