/**
 * @rpr/controls — shared input device layer.
 *
 * Phaser-free. Sources bind to the DOM directly (`window`, `navigator`,
 * elements) and produce generic {@link InputFrame}s. Games define their own
 * button/axis spaces and assign meaning in their own input layer — this package
 * never encodes game semantics (Req 5, Design Decision 4/5).
 *
 * Public surface:
 * - Core: `InputFrame`, `InputSource`, `mergeFrames`
 * - Keyboard: `KeyboardSource`, `DigitalAxisBinding`, `DigitalAxisBindings`
 * - Gamepad: `GamepadSource`, `GamepadBindings`, `GamepadButtonBinding`, etc.
 * - Pointer: `PointerSource`, `PointerSourceOptions`
 */

export * from './frame';
export * from './keyboard-source';
export * from './gamepad-source';
export * from './pointer-source';
export * from './merging-source';
export * from './trace-recorder';
export * from './touch-overlay';
