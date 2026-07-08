import type { InputFrame, InputSource } from './frame';

/**
 * A pair of key codes that synthesize a digital axis: `negative` code held →
 * value -1, `positive` code held → +1, both or neither → 0. Used by games that
 * want analog-style axes from digital keyboard keys (Squadron steering).
 */
export interface DigitalAxisBinding {
  readonly negative: string;
  readonly positive: string;
}

export type DigitalAxisBindings<X extends string> = Readonly<Record<X, DigitalAxisBinding>>;

/**
 * Keyboard input source — binds to `window` keydown/keyup/blur (no Phaser).
 *
 * Button bindings map each button name to a `KeyboardEvent.code` (e.g.
 * `'KeyA'`, `'ArrowLeft'`). Optional digital axes synthesize -1/0/+1 from key
 * pairs. Binding tables are plain data (Req 5.8), so games own their layout
 * without touching device code.
 *
 * On window blur all held keys are released to prevent stuck inputs (mirrors
 * the touch-overlay pointer-cancel handling — Req 5.6).
 */
export class KeyboardSource<B extends string, X extends string = never>
  implements InputSource<B, X>
{
  readonly available = true;

  private readonly held = new Set<string>();
  private readonly buttonBindings: Readonly<Record<B, string>>;
  private readonly axisBindings: DigitalAxisBindings<X> | undefined;
  private readonly target: Window | null;

  private readonly onKeyDown: (e: KeyboardEvent) => void;
  private readonly onKeyUp: (e: KeyboardEvent) => void;
  private readonly onBlur: () => void;

  constructor(
    buttonBindings: Readonly<Record<B, string>>,
    options?: { axes?: DigitalAxisBindings<X>; target?: Window },
  ) {
    this.buttonBindings = buttonBindings;
    this.axisBindings = options?.axes;
    this.target = options?.target ?? (typeof window !== 'undefined' ? window : null);

    this.onKeyDown = (e: KeyboardEvent): void => {
      this.held.add(e.code);
    };
    this.onKeyUp = (e: KeyboardEvent): void => {
      this.held.delete(e.code);
    };
    this.onBlur = (): void => {
      this.held.clear();
    };

    if (this.target) {
      this.target.addEventListener('keydown', this.onKeyDown);
      this.target.addEventListener('keyup', this.onKeyUp);
      this.target.addEventListener('blur', this.onBlur);
    }
  }

  read(): InputFrame<B, X> {
    const buttons = {} as Record<B, boolean>;
    for (const action of Object.keys(this.buttonBindings) as B[]) {
      buttons[action] = this.held.has(this.buttonBindings[action]);
    }

    const axes = {} as Record<X, number>;
    if (this.axisBindings) {
      for (const axisName of Object.keys(this.axisBindings) as X[]) {
        const b = this.axisBindings[axisName];
        const neg = this.held.has(b.negative) ? -1 : 0;
        const pos = this.held.has(b.positive) ? 1 : 0;
        axes[axisName] = neg + pos;
      }
    }

    return { buttons, axes };
  }

  /** Removes window listeners so teardown leaves no global handlers behind. */
  destroy(): void {
    if (this.target) {
      this.target.removeEventListener('keydown', this.onKeyDown);
      this.target.removeEventListener('keyup', this.onKeyUp);
      this.target.removeEventListener('blur', this.onBlur);
    }
    this.held.clear();
  }
}
