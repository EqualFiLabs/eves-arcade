import type { InputFrame, InputSource } from '@rpr/controls';
import type { RprButton } from './buttons';

/**
 * RPR touch control semantics (Req 5.4, 6.4).
 *
 * The touch layout uses a collapsed button set — `light` / `heavy` instead of
 * the four high/low variants — plus a floating movement stick. This keeps the
 * thumb-viable button count low while preserving full move-set access: holding
 * the stick **down** (crouch) + pressing `light` produces `lightLow`, and so on
 * (crouching-attack convention). Keyboard and gamepad keep their four-button
 * semantics; this adapter is the single place where touch semantics are
 * defined (Req 5.4 — game-design decision in the RPR reducer, not in the
 * controls package).
 */

/** Touch button actions for RPR (collapsed: no high/low split). */
export type TouchButton = 'light' | 'heavy' | 'special' | 'super' | 'block';

/** Touch stick axes for RPR. */
export type TouchAxis = 'moveX' | 'moveY';

/** Deadzone for stick-to-direction conversion (matches gamepad feel). */
const TOUCH_STICK_DEADZONE = 0.35;

/**
 * Converts a touch overlay frame (collapsed buttons + stick axes) into the
 * full RprButton frame that the InputMapper consumes. The stick's vertical
 * axis determines high vs low attack variants.
 */
export function adaptTouchFrame(frame: InputFrame<TouchButton, TouchAxis>): InputFrame<RprButton> {
  const mx = frame.axes.moveX ?? 0;
  const my = frame.axes.moveY ?? 0;
  const down = my > TOUCH_STICK_DEADZONE;
  const light = frame.buttons.light ?? false;
  const heavy = frame.buttons.heavy ?? false;

  return {
    buttons: {
      left: mx < -TOUCH_STICK_DEADZONE,
      right: mx > TOUCH_STICK_DEADZONE,
      up: my < -TOUCH_STICK_DEADZONE,
      down,
      block: frame.buttons.block ?? false,
      lightHigh: light && !down,
      lightLow: light && down,
      heavyHigh: heavy && !down,
      heavyLow: heavy && down,
      special: frame.buttons.special ?? false,
      super: frame.buttons.super ?? false,
      start: false,
      mute: false,
    },
    axes: {},
  };
}

/**
 * Wraps a {@link TouchOverlaySource} and adapts its frames into the RprButton
 * space, so the touch source merges cleanly with keyboard + gamepad inside the
 * InputMapper (Req 5.5, 6.4).
 */
export class TouchRprSource implements InputSource<RprButton> {
  constructor(private readonly overlay: InputSource<TouchButton, TouchAxis>) {}

  get available(): boolean {
    return this.overlay.available;
  }

  read(): InputFrame<RprButton> {
    return adaptTouchFrame(this.overlay.read());
  }

  destroy(): void {
    this.overlay.destroy?.();
  }
}
