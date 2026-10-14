import type { App } from './app';
import type { Session } from './session';
import { toScreen } from './view';

export interface DebugHooks {
  readonly session: Session | null;
  /** Board units to CSS pixels, through the view drawn this frame. */
  toScreen(bx: number, by: number): { x: number; y: number };
  /** Begins a run from the title, exactly as clicking Play. */
  start(): void;
}

declare global {
  interface Window {
    __blast?: DebugHooks;
  }
}

/** Hooks for the end-to-end tests, only under ?debug=1. */
export function installDebug(app: App): void {
  window.__blast = {
    get session() {
      return app.session;
    },
    toScreen: (bx, by) => toScreen(app.view, bx, by),
    start: () => app.play('endless'),
  };
}
