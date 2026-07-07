import * as Phaser from 'phaser';
import { type GamepadReading, type RawInputState, GAMEPAD_DEADZONE, mapGamepad } from '@rpr/sim';
import type { InputSource } from './InputSource';

/**
 * GamepadInputSource — OPTIONAL gamepad support (Req 5.11).
 *
 * Reads the first connected Standard Gamepad into a {@link GamepadReading} and
 * reduces it via the pure {@link mapGamepad}. Keyboard remains fully playable
 * regardless of whether a pad is connected (Req 5.10).
 *
 * Mapping: left stick / D-pad → move, L1 → block, A → lightHigh, B → lightLow,
 * X → heavyHigh, Y → heavyLow, R1 → special, R2 → super, Start → start,
 * Back → mute. Sticks apply a deadzone so resting drift is ignored. If no pad
 * is connected, `read()` returns neutral.
 */
export class GamepadInputSource implements InputSource {
  constructor(private readonly plugin: Phaser.Input.Gamepad.GamepadPlugin) {}

  get available(): boolean {
    return this.plugin.total > 0;
  }

  read(): RawInputState {
    const pad = this.plugin.pad1;
    if (!pad) return NEUTRAL_RAW;
    return mapGamepad(this.reading(pad), GAMEPAD_DEADZONE);
  }

  /** Extracts a normalized {@link GamepadReading} from a physical pad. */
  private reading(pad: Phaser.Input.Gamepad.Gamepad): GamepadReading {
    const stick = pad.leftStick ?? { x: 0, y: 0 };
    return {
      left: !!pad.left,
      right: !!pad.right,
      up: !!pad.up,
      down: !!pad.down,
      axisX: stick.x ?? 0,
      axisY: stick.y ?? 0,
      blockPressure: pad.L1 ?? 0,
      a: !!pad.A,
      b: !!pad.B,
      x: !!pad.X,
      y: !!pad.Y,
      r1: !!pad.R1,
      r2Pressure: pad.R2 ?? 0,
      start: this.isDown(pad, 9),
      back: this.isDown(pad, 8),
    };
  }

  /** Index-based button check (Start/Back indices are stable across mappings). */
  private isDown(pad: Phaser.Input.Gamepad.Gamepad, index: number): boolean {
    return pad.isButtonDown(index);
  }
}

const NEUTRAL_RAW: RawInputState = {
  left: false,
  right: false,
  up: false,
  down: false,
  block: false,
  lightHigh: false,
  lightLow: false,
  heavyHigh: false,
  heavyLow: false,
  special: false,
  super: false,
  start: false,
  mute: false,
};
