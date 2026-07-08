/**
 * Core input types for the controls package.
 *
 * A frame is a single snapshot of device state, generic over button names (`B`)
 * and axis names (`X`). Games define their own button/axis spaces; the controls
 * package never assigns meaning to individual buttons — that stays in each game
 * (Req 5: device layer shared, semantics per-game).
 *
 * No Phaser imports anywhere in this package (Design Decision 5: Phaser-free,
 * headless-testable). Sources bind to the DOM (`window`, `navigator`, elements)
 * directly.
 */

/**
 * A single frame of device input.
 *
 * `buttons` — boolean pressed state per named button.
 * `axes` — analog value in -1..1 per named axis (defaults to `{}` when `X` is
 * `never`).
 */
export interface InputFrame<B extends string, X extends string = never> {
  readonly buttons: Readonly<Record<B, boolean>>;
  readonly axes: Readonly<Record<X, number>>;
}

/**
 * A device reader that produces an {@link InputFrame} each poll.
 *
 * Sources are device-specific (keyboard, gamepad, pointer) and never touch the
 * game simulation — they only produce frames. Games merge one or more sources
 * and assign meaning to the buttons/axes in their own input layer.
 */
export interface InputSource<B extends string, X extends string = never> {
  /** Reads the current device state into a frame. */
  read(): InputFrame<B, X>;

  /** True when this source can produce non-neutral input (e.g. a pad is connected). */
  readonly available: boolean;

  /** Optional teardown — removes DOM listeners, clears state. */
  destroy?(): void;
}

/** An empty axes record for frames that carry no analog axes. */
const NO_AXES = {} as const;

/**
 * Merges multiple frames into one: buttons are OR-merged (any source asserting
 * a button wins), axes take the largest-magnitude value (so the strongest input
 * direction wins). This lets keyboard + gamepad + touch coexist without
 * precedence bugs (Req 5.5, Property 8).
 *
 * For an empty array, returns a frame with no buttons and no axes.
 */
export function mergeFrames<B extends string, X extends string = never>(
  frames: readonly InputFrame<B, X>[],
): InputFrame<B, X> {
  if (frames.length === 0) {
    return { buttons: {} as Record<B, boolean>, axes: NO_AXES as Record<X, number> };
  }

  const buttons = {} as Record<B, boolean>;
  const axes = {} as Record<X, number>;

  // Collect the full key set across all frames (in practice every frame from a
  // given source type carries the same keys, but merging across source types is
  // safest by union).
  const buttonKeys = new Set<string>();
  const axisKeys = new Set<string>();
  for (const f of frames) {
    for (const k in f.buttons) buttonKeys.add(k);
    for (const k in f.axes) axisKeys.add(k);
  }

  for (const k of buttonKeys) {
    buttons[k as B] = frames.some((f) => f.buttons[k as B] === true);
  }
  for (const k of axisKeys) {
    let winner = 0;
    for (const f of frames) {
      const v = f.axes[k as X] ?? 0;
      if (Math.abs(v) > Math.abs(winner)) winner = v;
    }
    axes[k as X] = winner;
  }

  return { buttons, axes };
}
