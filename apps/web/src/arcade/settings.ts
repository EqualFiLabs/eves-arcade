import type { ArcadeSettings } from './types';

/**
 * Persisted shell settings (Req 2.2, 7.6). Source of truth for `muted` etc.,
 * flowed into a game via `ctx.settings` on launch and updated in-game through
 * `ctx.updateSettings`. Stored in localStorage so it survives reloads.
 */

const STORAGE_KEY = 'arcade:settings';

const DEFAULTS: ArcadeSettings = {
  muted: false,
};

/** Loads settings from localStorage, falling back to defaults on any error. */
export function loadSettings(): ArcadeSettings {
  if (typeof localStorage === 'undefined') return { ...DEFAULTS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<ArcadeSettings>;
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}

/** Persists a settings patch, merging with the current stored value. */
export function saveSettings(patch: Partial<ArcadeSettings>): ArcadeSettings {
  const next = { ...loadSettings(), ...patch };
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Quota / private mode — settings stay in-memory only for this session.
    }
  }
  return next;
}
