/**
 * RPR button name space — the set of boolean inputs Rug Pull Rumble reads.
 *
 * These map 1:1 to {@link RawInputState} keys in `@rpr/sim`, so the adapter
 * between a controls `InputFrame<RprButton>` and a `RawInputState` is structural
 * (see {@link ../adapt}). Keeping the type here — not in the controls package —
 * means the controls layer never encodes RPR-specific semantics (Req 5, Design
 * Decision 4).
 */
export type RprButton =
  | 'left'
  | 'right'
  | 'up'
  | 'down'
  | 'block'
  | 'lightHigh'
  | 'lightLow'
  | 'heavyHigh'
  | 'heavyLow'
  | 'special'
  | 'super'
  | 'start'
  | 'mute';
