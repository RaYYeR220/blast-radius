import type { UpgradeId } from '@blast/sim';

const SPEAKER = '<path d="M2.5 6.8h2.8L9 3.6v10.8l-3.7-3.2H2.5z" fill="currentColor"/>';

/** Both states of the sound toggle; CSS shows the one matching aria-pressed. */
export const MUTE_ICONS =
  `<svg class="on" viewBox="0 0 18 18" aria-hidden="true">${SPEAKER}<path d="M12 6.4c.9.7 1.3 1.6 1.3 2.6s-.4 1.9-1.3 2.6M14 4.6c1.4 1.2 2.1 2.7 2.1 4.4s-.7 3.2-2.1 4.4" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round"/></svg>` +
  `<svg class="off" viewBox="0 0 18 18" aria-hidden="true">${SPEAKER}<path d="M12 7l4 4M16 7l-4 4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`;

export const PAUSE_ICON =
  '<svg viewBox="0 0 18 18" aria-hidden="true"><rect x="4.5" y="3.5" width="3" height="11" rx="1" fill="currentColor"/><rect x="10.5" y="3.5" width="3" height="11" rx="1" fill="currentColor"/></svg>';

export const PLAY_ICON = '<svg viewBox="0 0 18 18" aria-hidden="true"><path d="M5.5 3.6v10.8a.6.6 0 0 0 .9.5l8.6-5.4a.6.6 0 0 0 0-1L6.4 3.1a.6.6 0 0 0-.9.5z" fill="currentColor"/></svg>';

export const CLOSE_ICON =
  '<svg viewBox="0 0 18 18" aria-hidden="true"><path d="M4.5 4.5l9 9M13.5 4.5l-9 9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';

export const muteButton = (cls: string): string =>
  `<button class="btn neu round ${cls}" type="button" data-mute aria-label="Sound (M)" aria-pressed="true">${MUTE_ICONS}</button>`;

/** Line icons for the upgrade cards (24×24, stroked in currentColor). */
export const UPGRADE_ICONS: Readonly<Record<UpgradeId, string>> = {
  sandbox: '<circle cx="12" cy="12" r="8" stroke-dasharray="2 2.6"/><circle cx="12" cy="12" r="2.4" fill="currentColor"/>',
  rateLimit: '<path d="M4 7l4 5-4 5"/><path d="M10 7l4 5-4 5" opacity=".6"/><path d="M16 7l4 5-4 5" opacity=".3"/>',
  canary: '<path d="M12 3l6 9-6 9-6-9z"/><circle cx="12" cy="12" r="2" fill="currentColor"/>',
  hitl: '<path d="M7 4h10M7 20h10M8 4c0 5 8 6 8 8s-8 3-8 8M16 4c0 5-8 6-8 8s8 3 8 8"/>',
  allowlist: '<circle cx="8" cy="12" r="4"/><path d="M12 12h9"/><path d="M8 4v2M8 18v2M2 12h2" opacity=".35"/>',
  breaker: '<path d="M13 3l-6 10h5l-1 8 6-11h-5z"/>',
  rollback: '<path d="M6 9a7 7 0 1 1-1 6"/><path d="M6 4v5h5"/>',
  leastPriv: '<rect x="8" y="8" width="8" height="8"/><path d="M3 12h5M16 12h5"/><path d="M12 3v5M12 16v5" opacity=".3"/>',
  fastHeal: '<path d="M3 12h6M15 12h6"/><path d="M10 8l4 8M14 8l-4 8"/>',
  wideBlade: '<path d="M5 19L19 5" stroke-width="4"/>',
};
