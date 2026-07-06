/**
 * Browser runtime support detection (design: BrowserSupportReport, Req 1.4).
 *
 * Pure feature detection consumed by BootScene. The game requires a usable
 * canvas context (2D or WebGL) and the Web Audio API; everything else is
 * optional and reported for diagnostics.
 */
export interface BrowserSupportReport {
  supported: boolean;
  webgl: boolean;
  audio: boolean;
  localStorage: boolean;
  gamepad: boolean;
  reasons: string[];
}

/** True when the host can render to a canvas via WebGL. */
function hasWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

/** True when a 2D canvas context is available (Canvas-renderer fallback). */
function hasCanvas2D(): boolean {
  try {
    return !!document.createElement('canvas').getContext('2d');
  } catch {
    return false;
  }
}

/** True when the Web Audio API is available (unlocked on first user gesture). */
function hasWebAudio(): boolean {
  return typeof window !== 'undefined' && !!(window.AudioContext || (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext);
}

/**
 * Evaluates runtime support. The game is supported when a canvas renderer is
 * available AND Web Audio exists. WebGL is preferred (Phaser AUTO) but the
 * Canvas renderer is an acceptable fallback, so its absence is not fatal.
 */
export function checkBrowserSupport(): BrowserSupportReport {
  const webgl = hasWebGL();
  const canvas2d = hasCanvas2D();
  const audio = hasWebAudio();
  const localStorage = (() => {
    try {
      return typeof window !== 'undefined' && 'localStorage' in window && window.localStorage !== null;
    } catch {
      return false;
    }
  })();
  const gamepad = typeof navigator !== 'undefined' && !!navigator.getGamepads;

  const reasons: string[] = [];
  if (!webgl && !canvas2d) reasons.push('No usable canvas renderer (WebGL or 2D).');
  if (!audio) reasons.push('No Web Audio API.');

  return {
    supported: (webgl || canvas2d) && audio,
    webgl,
    audio,
    localStorage,
    gamepad,
    reasons,
  };
}
