import type { InputFrame, InputSource } from './frame';

/**
 * Standard gamepad layout identifiers (W3C Standard Gamepad spec).
 *
 * Button names follow the Xbox convention (A/B/X/Y) which the browser maps from
 * physical labels. Indices are stable per the spec.
 */
export type StandardGamepadButton =
  | 'a'
  | 'b'
  | 'x'
  | 'y'
  | 'l1'
  | 'r1'
  | 'l2'
  | 'r2'
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'back'
  | 'start'
  | 'l3'
  | 'r3'
  | 'guide';

/** W3C Standard Gamepad button array index per named button. */
const BUTTON_INDEX: Readonly<Record<StandardGamepadButton, number>> = {
  a: 0,
  b: 1,
  x: 2,
  y: 3,
  l1: 4,
  r1: 5,
  l2: 6,
  r2: 7,
  back: 8,
  start: 9,
  l3: 10,
  r3: 11,
  up: 12,
  down: 13,
  left: 14,
  right: 15,
  guide: 16,
};

/** Buttons that report analog pressure via `value` rather than just `pressed`. */
const PRESSURE_BUTTONS: ReadonlySet<StandardGamepadButton> = new Set(['l2', 'r2']);

/** Named analog stick axes (W3C Standard Gamepad axis indices). */
export type GamepadAxis = 'leftX' | 'leftY' | 'rightX' | 'rightY';

const AXIS_INDEX: Readonly<Record<GamepadAxis, number>> = {
  leftX: 0,
  leftY: 1,
  rightX: 2,
  rightY: 3,
};

/**
 * Derives a boolean button from an analog axis: the button is active when
 * `axis * sign > deadzone`. Used to map a left stick to directional buttons
 * (RPR) or to create custom digital zones from analog triggers.
 */
export interface AxisButtonBinding {
  readonly axis: GamepadAxis | number;
  readonly sign: 1 | -1;
}

/**
 * A single button can be bound to:
 * - A {@link StandardGamepadButton} name (pressure-aware: L2/R2 use `value`).
 * - A raw numeric button index.
 * - An {@link AxisButtonBinding} (stick → digital button via deadzone).
 *
 * Arrays are OR-merged — any binding asserting the button wins. This lets RPR
 * map a direction to both the D-pad and the stick in one entry.
 */
export type GamepadButtonBinding = StandardGamepadButton | number | AxisButtonBinding;

export interface GamepadBindings<B extends string, X extends string = never> {
  /** Button-name → gamepad binding(s). Arrays are OR-merged. */
  readonly buttons: Readonly<Record<B, GamepadButtonBinding | readonly GamepadButtonBinding[]>>;
  /** Optional analog axis bindings. */
  readonly axes?: Readonly<Record<X, GamepadAxis | number>>;
  /** Deadzone for stick-to-button and analog-axis filtering. */
  readonly deadzone?: number;
}

/**
 * Gamepad input source — reads the first connected Standard Gamepad via
 * `navigator.getGamepads()` (no Phaser). Binding tables are data (Req 5.8).
 *
 * When no pad is connected, `available` is `false` and `read()` returns a
 * neutral frame, so the gamepad source can always be in the merge list without
 * polluting keyboard input (Req 5.10/5.11, Property 8).
 */
export class GamepadSource<B extends string, X extends string = never>
  implements InputSource<B, X>
{
  private readonly bindings: GamepadBindings<B, X>;
  private readonly deadzone: number;

  constructor(bindings: GamepadBindings<B, X>, deadzone?: number) {
    this.bindings = bindings;
    this.deadzone = deadzone ?? bindings.deadzone ?? 0.4;
  }

  get available(): boolean {
    return this.getFirstPad() !== null;
  }

  read(): InputFrame<B, X> {
    const pad = this.getFirstPad();
    const buttons = {} as Record<B, boolean>;
    const axes = {} as Record<X, number>;

    const buttonNames = Object.keys(this.bindings.buttons) as B[];
    const axisNames = (this.bindings.axes ? Object.keys(this.bindings.axes) : []) as X[];

    if (!pad) {
      for (const b of buttonNames) buttons[b] = false;
      for (const a of axisNames) axes[a] = 0;
      return { buttons, axes };
    }

    for (const action of buttonNames) {
      const binding = this.bindings.buttons[action];
      const refs = Array.isArray(binding) ? binding : [binding];
      buttons[action] = refs.some((ref) => this.isButtonActive(pad, ref));
    }

    if (this.bindings.axes) {
      for (const axisName of axisNames) {
        const ref: GamepadAxis | number = this.bindings.axes[axisName];
        const idx = typeof ref === 'number' ? ref : AXIS_INDEX[ref];
        const raw = pad.axes[idx] ?? 0;
        axes[axisName] = Math.abs(raw) < this.deadzone ? 0 : raw;
      }
    }

    return { buttons, axes };
  }

  /** No DOM listeners to remove (polls on read), but available for symmetry. */
  destroy(): void {
    // Intentionally empty — gamepad is polled, no event listeners registered.
  }

  private getFirstPad(): Gamepad | null {
    if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') {
      return null;
    }
    const pads = navigator.getGamepads();
    for (const p of pads) {
      if (p) return p;
    }
    return null;
  }

  private isButtonActive(pad: Gamepad, binding: GamepadButtonBinding): boolean {
    if (typeof binding === 'string') {
      const idx = BUTTON_INDEX[binding];
      const btn = pad.buttons[idx];
      if (!btn) return false;
      return PRESSURE_BUTTONS.has(binding) ? btn.value > 0 : btn.pressed;
    }
    if (typeof binding === 'number') {
      return pad.buttons[binding]?.pressed ?? false;
    }
    // AxisButtonBinding
    const idx = typeof binding.axis === 'number' ? binding.axis : AXIS_INDEX[binding.axis];
    const v = pad.axes[idx] ?? 0;
    return binding.sign > 0 ? v > this.deadzone : v < -this.deadzone;
  }
}
