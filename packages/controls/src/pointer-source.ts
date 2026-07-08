import type { InputFrame, InputSource } from './frame';

export interface PointerSourceOptions<B extends string, X extends string> {
  /** The element to track pointer position over. */
  readonly target: HTMLElement;
  /**
   * Axis names for normalized position: `[xAxis, yAxis]`. The position is
   * normalized to -1..1 across the target's bounding box (-1 = left/top,
   * +1 = right/bottom). Omit if only press detection is needed.
   */
  readonly axes?: readonly [X, X];
  /** Button name asserted while the pointer is pressed (primary button). */
  readonly button?: B;
}

/**
 * Pointer input source — normalized pointer position over a target element →
 * axes (-1..1), primary-press → button. Uses standard Pointer Events
 * (pointerdown/move/up), so it covers mouse, touch, and pen.
 *
 * Built now because Squadron needs pointer-based aiming; it shares the same
 * {@link InputSource} interface as keyboard/gamepad, so all three merge cleanly
 * via {@link mergeFrames} (Req 5.1, Property 8).
 */
export class PointerSource<B extends string = never, X extends string = never>
  implements InputSource<B, X>
{
  readonly available = true;

  private readonly target: HTMLElement;
  private readonly axisNames: readonly [X, X] | undefined;
  private readonly buttonName: B | undefined;

  private x = 0;
  private y = 0;
  private pressed = false;

  private readonly onPointerDown: (e: PointerEvent) => void;
  private readonly onPointerMove: (e: PointerEvent) => void;
  private readonly onPointerUp: (e: PointerEvent) => void;

  constructor(options: PointerSourceOptions<B, X>) {
    this.target = options.target;
    this.axisNames = options.axes;
    this.buttonName = options.button;

    this.onPointerDown = (): void => {
      this.pressed = true;
    };
    this.onPointerUp = (): void => {
      this.pressed = false;
    };
    this.onPointerMove = (e: PointerEvent): void => {
      const rect = this.target.getBoundingClientRect();
      const w = rect.width || 1;
      const h = rect.height || 1;
      this.x = ((e.clientX - rect.left) / w) * 2 - 1;
      this.y = ((e.clientY - rect.top) / h) * 2 - 1;
    };

    this.target.addEventListener('pointerdown', this.onPointerDown);
    this.target.addEventListener('pointermove', this.onPointerMove);
    this.target.addEventListener('pointerup', this.onPointerUp);
  }

  read(): InputFrame<B, X> {
    const buttons = {} as Record<B, boolean>;
    if (this.buttonName) {
      buttons[this.buttonName] = this.pressed;
    }

    const axes = {} as Record<X, number>;
    if (this.axisNames) {
      axes[this.axisNames[0]] = this.x;
      axes[this.axisNames[1]] = this.y;
    }

    return { buttons, axes };
  }

  /** Removes element listeners so teardown leaves no handlers behind. */
  destroy(): void {
    this.target.removeEventListener('pointerdown', this.onPointerDown);
    this.target.removeEventListener('pointermove', this.onPointerMove);
    this.target.removeEventListener('pointerup', this.onPointerUp);
  }
}
