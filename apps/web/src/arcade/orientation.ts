import type { ArcadeGameManifest } from './types';

/**
 * Orientation gate (Req 7.2, 7.3). Watches the viewport orientation and reports
 * whether it satisfies a game's declared requirement; the shell renders a rotate
 * prompt and pauses (when supported) until the device is turned correctly.
 *
 * Pure DOM (`matchMedia`) — no Phaser.
 */

export type Orientation = 'landscape' | 'portrait';

/**
 * The current viewport orientation. Computed from `innerWidth`/`innerHeight`
 * (the same thing the `(orientation: portrait)` media query checks) rather than
 * `matchMedia`, because some emulated/mobile headless environments do not
 * dispatch the media-query change event reliably while still reporting accurate
 * viewport dimensions on resize.
 */
export function currentOrientation(): Orientation {
  if (typeof window === 'undefined') return 'landscape';
  return window.innerHeight > window.innerWidth ? 'portrait' : 'landscape';
}

/** True when the current orientation satisfies the manifest's requirement. */
export function orientationSatisfied(manifest: Pick<ArcadeGameManifest, 'orientation'>): boolean {
  if (manifest.orientation === 'any') return true;
  return currentOrientation() === manifest.orientation;
}

/**
 * Subscribes to orientation changes (portrait ↔ landscape). Returns an unsubscribe
 * function. Used by the shell to show/hide the rotate prompt live. Listens to
 * BOTH `matchMedia` change and `window` resize: some headless/automated
 * environments dispatch resize but not the media change event, so both keep the
 * prompt accurate everywhere.
 */
export function onOrientationChange(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const mql = typeof window.matchMedia === 'function'
    ? window.matchMedia('(orientation: portrait)')
    : null;
  const handler = () => cb();
  mql?.addEventListener('change', handler);
  window.addEventListener('resize', handler);
  return () => {
    mql?.removeEventListener('change', handler);
    window.removeEventListener('resize', handler);
  };
}
