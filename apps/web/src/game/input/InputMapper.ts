import * as Phaser from 'phaser';
import {
  type CombatInput,
  type RawInputState,
  DEFAULT_KEYBOARD_BINDINGS,
  mapRawInput,
} from '@rpr/sim';

/**
 * InputMapper — reads keyboard each frame into a {@link RawInputState} and
 * reduces it to simulation input via {@link mapRawInput} (Req 5, design:
 * InputMapper). Keyboard is fully playable without a gamepad (Req 5.10/5.11).
 *
 * Movement is world-relative: ArrowRight → horizontal +1. The engine applies
 * forward/back walk speed from facing, so approaching the opponent is fast.
 */
export class InputMapper {
  private readonly raw: RawInputState = {
    left: false,
    right: false,
    up: false,
    down: false,
    block: false,
    light: false,
    heavy: false,
    special: false,
    super: false,
    start: false,
    mute: false,
  };

  private readonly keys: Record<string, Phaser.Input.Keyboard.Key>;

  constructor(keyboard: Phaser.Input.Keyboard.KeyboardPlugin) {
    const b = DEFAULT_KEYBOARD_BINDINGS;
    this.keys = {
      [b.left]: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes[b.left as keyof typeof Phaser.Input.Keyboard.KeyCodes]),
      [b.right]: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes[b.right as keyof typeof Phaser.Input.Keyboard.KeyCodes]),
      [b.up]: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes[b.up as keyof typeof Phaser.Input.Keyboard.KeyCodes]),
      [b.down]: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes[b.down as keyof typeof Phaser.Input.Keyboard.KeyCodes]),
      [b.block]: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes[b.block as keyof typeof Phaser.Input.Keyboard.KeyCodes]),
      [b.light]: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes[b.light as keyof typeof Phaser.Input.Keyboard.KeyCodes]),
      [b.heavy]: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes[b.heavy as keyof typeof Phaser.Input.Keyboard.KeyCodes]),
      [b.special]: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes[b.special as keyof typeof Phaser.Input.Keyboard.KeyCodes]),
      [b.super]: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes[b.super as keyof typeof Phaser.Input.Keyboard.KeyCodes]),
      [b.start]: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes[b.start as keyof typeof Phaser.Input.Keyboard.KeyCodes]),
      [b.mute]: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes[b.mute as keyof typeof Phaser.Input.Keyboard.KeyCodes]),
    };
  }

  /** Polls the keyboard and returns the normalized simulation input for this step. */
  poll(): CombatInput {
    const raw = this.readRaw();
    return mapRawInput(raw);
  }

  /** Reads the current keyboard state into a RawInputState. */
  readRaw(): RawInputState {
    const b = DEFAULT_KEYBOARD_BINDINGS;
    const isDown = (code: string) => this.keys[code]?.isDown ?? false;
    this.raw.left = isDown(b.left);
    this.raw.right = isDown(b.right);
    this.raw.up = isDown(b.up);
    this.raw.down = isDown(b.down);
    this.raw.block = isDown(b.block);
    this.raw.light = isDown(b.light);
    this.raw.heavy = isDown(b.heavy);
    this.raw.special = isDown(b.special);
    this.raw.super = isDown(b.super);
    return this.raw;
  }

  /** True while the mute key is held (scenes react on their own key handler). */
  get muteHeld(): boolean {
    return this.keys[DEFAULT_KEYBOARD_BINDINGS.mute]?.isDown ?? false;
  }
}
