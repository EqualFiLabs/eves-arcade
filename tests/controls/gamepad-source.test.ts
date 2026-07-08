// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { GamepadSource, type GamepadBindings } from '@rpr/controls';

type TestButton = 'left' | 'right' | 'up' | 'down' | 'fire' | 'boost';

const bindings: GamepadBindings<TestButton> = {
  buttons: {
    left: [{ axis: 'leftX', sign: -1 }, 'left'],
    right: [{ axis: 'leftX', sign: 1 }, 'right'],
    up: [{ axis: 'leftY', sign: -1 }, 'up'],
    down: [{ axis: 'leftY', sign: 1 }, 'down'],
    fire: 'a',
    boost: 'r2',
  },
  deadzone: 0.4,
};

/** Creates a mock Gamepad with 17 buttons and 4 axes. */
function makePad(overrides?: { buttons?: Partial<Record<number, { pressed: boolean; value: number }>>; axes?: number[] }): Gamepad {
  const buttons = Array.from({ length: 17 }, () => ({ pressed: false, value: 0, touched: false }));
  if (overrides?.buttons) {
    for (const [idx, val] of Object.entries(overrides.buttons)) {
      buttons[Number(idx)] = val;
    }
  }
  const axes = overrides?.axes ?? [0, 0, 0, 0];
  return {
    id: 'Test Pad (Standard)',
    index: 0,
    connected: true,
    timestamp: 0,
    mapping: 'standard',
    axes,
    buttons,
  } as Gamepad;
}

let originalGetGamepads: typeof navigator.getGamepads | undefined;

function mockGetGamepads(pad: Gamepad | null): void {
  originalGetGamepads = navigator.getGamepads;
  Object.defineProperty(navigator, 'getGamepads', {
    value: () => (pad ? [pad] : [null]),
    configurable: true,
    writable: true,
  });
}

function restoreGetGamepads(): void {
  if (originalGetGamepads) {
    Object.defineProperty(navigator, 'getGamepads', {
      value: originalGetGamepads,
      configurable: true,
      writable: true,
    });
    originalGetGamepads = undefined;
  }
}

afterEach(() => {
  restoreGetGamepads();
});

describe('GamepadSource (Req 5.1, 5.8, 5.11 — optional gamepad)', () => {
  it('is unavailable and returns neutral when no pad is connected', () => {
    mockGetGamepads(null);
    const src = new GamepadSource(bindings);

    expect(src.available).toBe(false);

    const f = src.read();
    expect(f.buttons.fire).toBe(false);
    expect(f.buttons.left).toBe(false);
    src.destroy();
  });

  it('reads face buttons via the binding table', () => {
    mockGetGamepads(makePad({ buttons: { 0: { pressed: true, value: 1 } } }));
    const src = new GamepadSource(bindings);

    expect(src.read().buttons.fire).toBe(true);
    expect(src.available).toBe(true);
    src.destroy();
  });

  it('treats R2 (pressure trigger) as pressed when value > 0', () => {
    mockGetGamepads(makePad({ buttons: { 7: { pressed: false, value: 0.6 } } }));
    const src = new GamepadSource(bindings);

    expect(src.read().buttons.boost).toBe(true);
    src.destroy();
  });

  it('R2 with zero pressure is not pressed', () => {
    mockGetGamepads(makePad({ buttons: { 7: { pressed: false, value: 0 } } }));
    const src = new GamepadSource(bindings);

    expect(src.read().buttons.boost).toBe(false);
    src.destroy();
  });

  it('maps left stick to direction buttons beyond the deadzone', () => {
    mockGetGamepads(makePad({ axes: [1, 0, 0, 0] }));
    const src = new GamepadSource(bindings);

    const f = src.read();
    expect(f.buttons.right).toBe(true);
    expect(f.buttons.left).toBe(false);
    src.destroy();
  });

  it('ignores stick drift below the deadzone', () => {
    mockGetGamepads(makePad({ axes: [0.3, 0, 0, 0] }));
    const src = new GamepadSource(bindings);

    expect(src.read().buttons.right).toBe(false);
    src.destroy();
  });

  it('OR-merges D-pad and stick for the same direction', () => {
    // Stick right + dpad left → both directions active
    mockGetGamepads(makePad({ axes: [1, 0, 0, 0], buttons: { 14: { pressed: true, value: 1 } } }));
    const src = new GamepadSource(bindings);

    const f = src.read();
    expect(f.buttons.right).toBe(true);
    expect(f.buttons.left).toBe(true);
    src.destroy();
  });

  it('binding-table-driven: different bindings map to different buttons', () => {
    mockGetGamepads(makePad({ buttons: { 3: { pressed: true, value: 1 } } }));
    const altBindings: GamepadBindings<'attack'> = {
      buttons: { attack: 'y' },
    };
    const src = new GamepadSource(altBindings);

    expect(src.read().buttons.attack).toBe(true);
    src.destroy();
  });

  it('constructor deadzone overrides binding deadzone', () => {
    mockGetGamepads(makePad({ axes: [0.5, 0, 0, 0] }));
    const src = new GamepadSource(bindings, 0.6);

    // 0.5 < 0.6 deadzone → no right
    expect(src.read().buttons.right).toBe(false);
    src.destroy();
  });

  it('reads analog axes with deadzone filtering', () => {
    const axisBindings: GamepadBindings<never, 'steer'> = {
      buttons: {},
      axes: { steer: 'leftX' },
      deadzone: 0.2,
    };
    mockGetGamepads(makePad({ axes: [0.5, 0, 0, 0] }));
    const src = new GamepadSource(axisBindings);

    expect(src.read().axes.steer).toBe(0.5);

    // Below deadzone
    mockGetGamepads(makePad({ axes: [0.1, 0, 0, 0] }));
    expect(src.read().axes.steer).toBe(0);

    src.destroy();
  });

  it('destroy() is safe to call (no listeners registered)', () => {
    mockGetGamepads(null);
    const src = new GamepadSource(bindings);
    expect(() => src.destroy()).not.toThrow();
  });
});
