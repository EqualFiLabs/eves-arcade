// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { KeyboardSource } from '@rpr/controls';

type TestButton = 'jump' | 'fire' | 'left' | 'right';
type TestAxis = 'move';

const bindings: Record<TestButton, string> = {
  jump: 'Space',
  fire: 'KeyJ',
  left: 'ArrowLeft',
  right: 'ArrowRight',
};

const digitalAxes: Record<TestAxis, { negative: string; positive: string }> = {
  move: { negative: 'ArrowLeft', positive: 'ArrowRight' },
};

function pressKey(code: string): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { code }));
}

function releaseKey(code: string): void {
  window.dispatchEvent(new KeyboardEvent('keyup', { code }));
}

afterEach(() => {
  // Ensure no keys leak between tests
  window.dispatchEvent(new KeyboardEvent('blur'));
});

describe('KeyboardSource (Req 5.1, 5.2 — Phaser-free keyboard)', () => {
  it('reports no buttons held initially', () => {
    const src = new KeyboardSource(bindings);
    const f = src.read();
    expect(f.buttons.jump).toBe(false);
    expect(f.buttons.fire).toBe(false);
    src.destroy();
  });

  it('tracks keydown/keyup through the binding table', () => {
    const src = new KeyboardSource(bindings);

    pressKey('Space');
    expect(src.read().buttons.jump).toBe(true);

    releaseKey('Space');
    expect(src.read().buttons.jump).toBe(false);

    src.destroy();
  });

  it('tracks multiple simultaneous keys independently', () => {
    const src = new KeyboardSource(bindings);

    pressKey('KeyJ');
    pressKey('ArrowLeft');
    const f = src.read();
    expect(f.buttons.fire).toBe(true);
    expect(f.buttons.left).toBe(true);
    expect(f.buttons.right).toBe(false);

    releaseKey('KeyJ');
    expect(src.read().buttons.fire).toBe(false);
    expect(src.read().buttons.left).toBe(true);

    src.destroy();
  });

  it('binding-table-driven: different bindings produce different button maps', () => {
    const altBindings: Record<TestButton, string> = {
      jump: 'KeyZ',
      fire: 'KeyX',
      left: 'ArrowLeft',
      right: 'ArrowRight',
    };
    const src = new KeyboardSource(altBindings);

    pressKey('Space');
    expect(src.read().buttons.jump).toBe(false); // Space no longer bound to jump

    pressKey('KeyZ');
    expect(src.read().buttons.jump).toBe(true);

    src.destroy();
  });

  it('releases all held keys on window blur (stuck-key prevention, Req 5.6)', () => {
    const src = new KeyboardSource(bindings);

    pressKey('Space');
    pressKey('KeyJ');
    expect(src.read().buttons.jump).toBe(true);
    expect(src.read().buttons.fire).toBe(true);

    window.dispatchEvent(new KeyboardEvent('blur'));

    const f = src.read();
    expect(f.buttons.jump).toBe(false);
    expect(f.buttons.fire).toBe(false);

    src.destroy();
  });

  it('synthesizes digital axes from key pairs', () => {
    const src = new KeyboardSource<TestButton, TestAxis>(bindings, { axes: digitalAxes });

    expect(src.read().axes.move).toBe(0);

    pressKey('ArrowRight');
    expect(src.read().axes.move).toBe(1);

    pressKey('ArrowLeft');
    expect(src.read().axes.move).toBe(0); // both held → cancel

    releaseKey('ArrowRight');
    expect(src.read().axes.move).toBe(-1);

    src.destroy();
  });

  it('is always available', () => {
    const src = new KeyboardSource(bindings);
    expect(src.available).toBe(true);
    src.destroy();
  });

  it('destroy() removes listeners so no further key events are tracked', () => {
    const src = new KeyboardSource(bindings);
    src.destroy();

    pressKey('Space');
    expect(src.read().buttons.jump).toBe(false);
  });
});
