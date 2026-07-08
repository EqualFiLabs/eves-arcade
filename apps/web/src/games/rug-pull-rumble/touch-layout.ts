import type { TouchLayout } from '@rpr/controls';
import type { TouchButton, TouchAxis } from './input/touch-adapter';

/**
 * Rug Pull Rumble touch layout (Req 6.4, 6.5, 7.4).
 *
 * Landscape-oriented: floating movement stick on the left half, attack buttons
 * on the right half. Buttons are positioned for right-thumb reach: light and
 * heavy are primary (inner), special and super are secondary (outer), block is
 * bottom-left of the right cluster. All coordinates are normalized within the
 * anchor half (0..1); radii are fractions of min(width, height).
 *
 * Prototype on a real device before locking the layout — positions and sizes
 * are first-pass and may need tuning per hand-size feedback.
 */
export const RPR_TOUCH_LAYOUT: TouchLayout<TouchButton, TouchAxis> = {
  zones: [
    // Floating stick: left half is the touch area
    { kind: 'stick', axes: ['moveX', 'moveY'], anchor: 'left', r: 0.10 },

    // Right-hand button cluster
    { kind: 'button', action: 'light', anchor: 'right', x: 0.35, y: 0.55, r: 0.08, label: 'L' },
    { kind: 'button', action: 'heavy', anchor: 'right', x: 0.70, y: 0.40, r: 0.08, label: 'H' },
    { kind: 'button', action: 'block', anchor: 'right', x: 0.20, y: 0.75, r: 0.07, label: 'BLK' },
    { kind: 'button', action: 'special', anchor: 'right', x: 0.15, y: 0.35, r: 0.07, label: 'SP' },
    { kind: 'button', action: 'super', anchor: 'right', x: 0.75, y: 0.70, r: 0.07, label: '★' },
  ],
};
