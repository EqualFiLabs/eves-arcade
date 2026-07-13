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
  private activePointerId: number | null = null;

  private readonly onPointerDown: (e: PointerEvent) => void;
  private readonly onPointerMove: (e: PointerEvent) => void;
  private readonly onPointerUp: (e: PointerEvent) => void;
  private readonly onPointerLoss: (e: PointerEvent) => void;
  private readonly onBlur: () => void;

  constructor(options: PointerSourceOptions<B, X>) {
    this.target = options.target;
    this.axisNames = options.axes;
    this.buttonName = options.button;

    this.onPointerDown = (event): void => {
      const pointerId = eventPointerId(event);
      if (this.activePointerId !== null && this.activePointerId !== pointerId) return;
      this.activePointerId = pointerId;
      this.pressed = true;
      this.updatePosition(event);
      try {
        this.target.setPointerCapture(pointerId);
      } catch {
        // Pointer capture is not available in every DOM implementation.
      }
    };
    this.onPointerUp = (event): void => {
      const pointerId = eventPointerId(event);
      if (this.activePointerId !== pointerId) return;
      this.pressed = false;
      this.activePointerId = null;
      try {
        this.target.releasePointerCapture(pointerId);
      } catch {
        // Capture may already have been released by the browser.
      }
    };
    this.onPointerMove = (event): void => {
      if (this.activePointerId !== null && this.activePointerId !== eventPointerId(event)) return;
      this.updatePosition(event);
    };
    this.onPointerLoss = (event): void => {
      const pointerId = eventPointerId(event);
      if (this.activePointerId !== null && this.activePointerId !== pointerId) return;
      this.reset();
    };
    this.onBlur = (): void => this.reset();

    this.target.addEventListener('pointerdown', this.onPointerDown);
    this.target.addEventListener('pointermove', this.onPointerMove);
    this.target.addEventListener('pointerup', this.onPointerUp);
    this.target.addEventListener('pointercancel', this.onPointerLoss);
    this.target.addEventListener('pointerleave', this.onPointerLoss);
    this.target.addEventListener('lostpointercapture', this.onPointerLoss);
    window.addEventListener('blur', this.onBlur);
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
    this.target.removeEventListener('pointercancel', this.onPointerLoss);
    this.target.removeEventListener('pointerleave', this.onPointerLoss);
    this.target.removeEventListener('lostpointercapture', this.onPointerLoss);
    window.removeEventListener('blur', this.onBlur);
    this.reset();
  }

  private updatePosition(event: PointerEvent): void {
    const rect = this.target.getBoundingClientRect();
    const width = rect.width || 1;
    const height = rect.height || 1;
    this.x = clamp(((event.clientX - rect.left) / width) * 2 - 1);
    this.y = clamp(((event.clientY - rect.top) / height) * 2 - 1);
  }

  private reset(): void {
    this.activePointerId = null;
    this.pressed = false;
    this.x = 0;
    this.y = 0;
  }
}

function eventPointerId(event: PointerEvent): number {
  return Number.isInteger(event.pointerId) ? event.pointerId : 1;
}

function clamp(value: number): number {
  return Math.max(-1, Math.min(1, value));
}
