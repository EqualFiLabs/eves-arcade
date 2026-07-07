import * as Phaser from 'phaser';
import {
  type RawInputState,
  DEFAULT_KEYBOARD_BINDINGS,
  type KeyboardBindingName,
} from '@rpr/sim';
import type { InputSource } from './InputSource';

/**
 * KeyboardInputSource — reads the default V1 keyboard bindings into a
 * {@link RawInputState} each frame (Req 5.1–5.8, 5.10).
 *
 * Bindings are DOM `KeyboardEvent.code` values (e.g. 'KeyZ', 'ArrowLeft'), so
 * we track held codes from raw `keydown`/`keyup` rather than Phaser's
 * `KeyCodes` name map (which uses a different naming convention). Movement is
 * world-relative: ArrowRight → raw.right. The page disables overflow scrolling
 * so arrow keys/space never leave the canvas.
 */
export class KeyboardInputSource implements InputSource {
  readonly available = true;
  private readonly held = new Set<string>();
  private readonly onKeyDown: (event: KeyboardEvent) => void;
  private readonly onKeyUp: (event: KeyboardEvent) => void;
  private readonly onBlur: () => void;
  private readonly keyboard: Phaser.Input.Keyboard.KeyboardPlugin;

  constructor(keyboard: Phaser.Input.Keyboard.KeyboardPlugin) {
    this.keyboard = keyboard;
    this.onKeyDown = (event) => {
      this.held.add(event.code);
    };
    this.onKeyUp = (event) => {
      this.held.delete(event.code);
    };
    this.onBlur = () => this.held.clear();
    keyboard.on('keydown', this.onKeyDown);
    keyboard.on('keyup', this.onKeyUp);
    // Release all keys if the window loses focus mid-fight (no stuck inputs).
    if (typeof window !== 'undefined') window.addEventListener('blur', this.onBlur);
  }

  read(): RawInputState {
    const down = (code: string) => this.held.has(code);
    const b = DEFAULT_KEYBOARD_BINDINGS;
    return {
      left: down(b.left),
      right: down(b.right),
      up: down(b.up),
      down: down(b.down),
      block: down(b.block),
      lightHigh: down(b.lightHigh),
      lightLow: down(b.lightLow),
      heavyHigh: down(b.heavyHigh),
      heavyLow: down(b.heavyLow),
      special: down(b.special),
      super: down(b.super),
      start: down(b.start),
      mute: down(b.mute),
    };
  }

  /** Removes window/plugin listeners so a scene restart never stacks handlers. */
  destroy(): void {
    this.keyboard.off('keydown', this.onKeyDown);
    this.keyboard.off('keyup', this.onKeyUp);
    if (typeof window !== 'undefined') window.removeEventListener('blur', this.onBlur);
    this.held.clear();
  }
}

export type { KeyboardBindingName };
