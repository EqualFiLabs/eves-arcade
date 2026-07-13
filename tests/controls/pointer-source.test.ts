// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PointerSource } from '@rpr/controls';

type TestButton = 'fire';
type TestAxis = 'aimX' | 'aimY';

function makeTarget(width = 200, height = 200): HTMLElement {
  const el = document.createElement('div');
  document.body.appendChild(el);
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
    width,
    height,
    left: 0,
    top: 0,
    right: width,
    bottom: height,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect);
  return el;
}

function dispatchPointer(
  el: HTMLElement,
  type: string,
  clientX: number,
  clientY: number,
  pointerId = 1,
): void {
  // jsdom doesn't implement PointerEvent, but MouseEvent carries clientX/clientY
  // and addEventListener matches by type string, so this reaches the handler.
  el.dispatchEvent(Object.assign(new MouseEvent(type, { clientX, clientY }), { pointerId }));
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('PointerSource (Req 5.1 — pointer as input)', () => {
  it('is always available', () => {
    const el = makeTarget();
    const src = new PointerSource<TestButton, TestAxis>({
      target: el,
      axes: ['aimX', 'aimY'],
      button: 'fire',
    });
    expect(src.available).toBe(true);
    src.destroy();
  });

  it('normalizes pointer position to -1..1 across the element', () => {
    const el = makeTarget(200, 200);
    const src = new PointerSource<TestButton, TestAxis>({
      target: el,
      axes: ['aimX', 'aimY'],
    });

    // Center → (0, 0)
    dispatchPointer(el, 'pointermove', 100, 100);
    let f = src.read();
    expect(f.axes.aimX).toBeCloseTo(0);
    expect(f.axes.aimY).toBeCloseTo(0);

    // Top-left corner → (-1, -1)
    dispatchPointer(el, 'pointermove', 0, 0);
    f = src.read();
    expect(f.axes.aimX).toBeCloseTo(-1);
    expect(f.axes.aimY).toBeCloseTo(-1);

    // Bottom-right corner → (+1, +1)
    dispatchPointer(el, 'pointermove', 200, 200);
    f = src.read();
    expect(f.axes.aimX).toBeCloseTo(1);
    expect(f.axes.aimY).toBeCloseTo(1);

    // Coordinates outside the target remain canonical source values.
    dispatchPointer(el, 'pointermove', 400, -100);
    f = src.read();
    expect(f.axes).toEqual({ aimX: 1, aimY: -1 });

    src.destroy();
  });

  it('asserts the button while the pointer is pressed', () => {
    const el = makeTarget();
    const src = new PointerSource<TestButton, TestAxis>({
      target: el,
      button: 'fire',
    });

    expect(src.read().buttons.fire).toBe(false);

    dispatchPointer(el, 'pointerdown', 50, 50);
    expect(src.read().buttons.fire).toBe(true);

    dispatchPointer(el, 'pointerup', 50, 50);
    expect(src.read().buttons.fire).toBe(false);

    src.destroy();
  });

  it.each(['pointercancel', 'pointerleave', 'lostpointercapture'])(
    '%s neutralizes pressed state and axes',
    (eventName) => {
      const el = makeTarget();
      const src = new PointerSource<TestButton, TestAxis>({
        target: el,
        axes: ['aimX', 'aimY'],
        button: 'fire',
      });
      dispatchPointer(el, 'pointerdown', 180, 20, 4);
      dispatchPointer(el, eventName, 180, 20, 4);
      expect(src.read()).toEqual({ buttons: { fire: false }, axes: { aimX: 0, aimY: 0 } });
      src.destroy();
    },
  );

  it('window blur neutralizes pointer state', () => {
    const el = makeTarget();
    const src = new PointerSource<TestButton, TestAxis>({
      target: el,
      axes: ['aimX', 'aimY'],
      button: 'fire',
    });
    dispatchPointer(el, 'pointerdown', 180, 20, 1);
    window.dispatchEvent(new Event('blur'));
    expect(src.read()).toEqual({ buttons: { fire: false }, axes: { aimX: 0, aimY: 0 } });
    src.destroy();
  });

  it('ignores a competing pointer while one pointer owns the press', () => {
    const el = makeTarget();
    const src = new PointerSource<TestButton, TestAxis>({
      target: el,
      axes: ['aimX', 'aimY'],
      button: 'fire',
    });
    dispatchPointer(el, 'pointerdown', 100, 100, 1);
    dispatchPointer(el, 'pointerdown', 200, 200, 2);
    dispatchPointer(el, 'pointermove', 200, 200, 2);
    expect(src.read()).toEqual({ buttons: { fire: true }, axes: { aimX: 0, aimY: 0 } });
    dispatchPointer(el, 'pointerup', 100, 100, 1);
    expect(src.read().buttons.fire).toBe(false);
    src.destroy();
  });

  it('starts at position (0, 0) before any movement', () => {
    const el = makeTarget();
    const src = new PointerSource<TestButton, TestAxis>({
      target: el,
      axes: ['aimX', 'aimY'],
    });

    const f = src.read();
    expect(f.axes.aimX).toBe(0);
    expect(f.axes.aimY).toBe(0);

    src.destroy();
  });

  it('destroy() removes listeners so no further pointer events are tracked', () => {
    const el = makeTarget();
    const src = new PointerSource<TestButton, TestAxis>({
      target: el,
      button: 'fire',
    });
    src.destroy();

    dispatchPointer(el, 'pointerdown', 50, 50);
    expect(src.read().buttons.fire).toBe(false);
  });

  it('works without axes (press-only)', () => {
    const el = makeTarget();
    const src = new PointerSource<'fire'>({ target: el, button: 'fire' });

    dispatchPointer(el, 'pointerdown', 50, 50);
    expect(src.read().buttons.fire).toBe(true);

    src.destroy();
  });
});
