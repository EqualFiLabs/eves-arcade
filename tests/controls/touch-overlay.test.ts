// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TouchOverlaySource, type TouchLayout } from '@rpr/controls';

type Btn = 'fire' | 'jump';
type Ax = 'moveX' | 'moveY';

const layout: TouchLayout<Btn, Ax> = {
  zones: [
    { kind: 'stick', axes: ['moveX', 'moveY'], anchor: 'left', r: 0.1 },
    { kind: 'button', action: 'fire', anchor: 'right', x: 0.5, y: 0.5, r: 0.08, label: 'Fire' },
    { kind: 'button', action: 'jump', anchor: 'right', x: 0.3, y: 0.3, r: 0.08, label: 'Jump' },
  ],
};

// jsdom doesn't implement pointer capture or ResizeObserver
 HTMLElement.prototype.setPointerCapture = vi.fn();
 HTMLElement.prototype.releasePointerCapture = vi.fn();
const GlobalResizeObserver = globalThis.ResizeObserver;

function mockRect(w: number, h: number): void {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    width: w,
    height: h,
    left: 0,
    top: 0,
    right: w,
    bottom: h,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect);
  if (globalThis.ResizeObserver === undefined) {
    globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
  }
}

afterEach(() => {
  document.body.innerHTML = '';
  globalThis.ResizeObserver = GlobalResizeObserver;
  vi.restoreAllMocks();
});

function ptr(el: Element, type: string, x: number, y: number, pointerId = 1): void {
  el.dispatchEvent(
    Object.assign(new MouseEvent(type, { bubbles: true, clientX: x, clientY: y }), { pointerId }),
  );
}

// Button center positions for an 800×400 viewport:
// fire: right half (400-800), x=0.5 → 400 + 0.5*400 = 600, y=0.5*400 = 200
// jump: right half, x=0.3 → 400 + 0.3*400 = 520, y=0.3*400 = 120
const FIRE_X = 600;
const FIRE_Y = 200;
const JUMP_X = 520;
const JUMP_Y = 120;
const STICK_X = 150;
const STICK_Y = 200;

describe('TouchOverlaySource (Req 6.1–6.3, 6.5)', () => {
  it('is always available once created', () => {
    mockRect(800, 400);
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const src = new TouchOverlaySource<Btn, Ax>(parent, layout);
    expect(src.available).toBe(true);
    src.destroy();
  });

  it('starts with a neutral frame', () => {
    mockRect(800, 400);
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const src = new TouchOverlaySource<Btn, Ax>(parent, layout);
    const f = src.read();
    expect(f.buttons.fire).toBe(false);
    expect(f.buttons.jump).toBe(false);
    expect(f.axes.moveX).toBe(0);
    expect(f.axes.moveY).toBe(0);
    src.destroy();
  });

  it('presses a button on pointerdown and releases on pointerup', () => {
    mockRect(800, 400);
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const src = new TouchOverlaySource<Btn, Ax>(parent, layout);
    const overlay = parent.querySelector('.touch-overlay')!;

    ptr(overlay, 'pointerdown', FIRE_X, FIRE_Y, 1);
    expect(src.read().buttons.fire).toBe(true);

    ptr(overlay, 'pointerup', FIRE_X, FIRE_Y, 1);
    expect(src.read().buttons.fire).toBe(false);

    src.destroy();
  });

  it('supports multi-touch: two buttons pressed simultaneously', () => {
    mockRect(800, 400);
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const src = new TouchOverlaySource<Btn, Ax>(parent, layout);
    const overlay = parent.querySelector('.touch-overlay')!;

    ptr(overlay, 'pointerdown', FIRE_X, FIRE_Y, 1);
    ptr(overlay, 'pointerdown', JUMP_X, JUMP_Y, 2);

    const f = src.read();
    expect(f.buttons.fire).toBe(true);
    expect(f.buttons.jump).toBe(true);

    ptr(overlay, 'pointerup', FIRE_X, FIRE_Y, 1);
    expect(src.read().buttons.fire).toBe(false);
    expect(src.read().buttons.jump).toBe(true);

    ptr(overlay, 'pointerup', JUMP_X, JUMP_Y, 2);
    expect(src.read().buttons.jump).toBe(false);

    src.destroy();
  });

  it('activates the floating stick and reports axes from pointer movement', () => {
    mockRect(800, 400);
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const src = new TouchOverlaySource<Btn, Ax>(parent, layout);
    const overlay = parent.querySelector('.touch-overlay')!;

    // Touch down in left half (stick region)
    ptr(overlay, 'pointerdown', STICK_X, STICK_Y, 1);
    expect(src.read().axes.moveX).toBe(0);
    expect(src.read().axes.moveY).toBe(0);

    // Move right — stick X increases
    ptr(overlay, 'pointermove', STICK_X + 40, STICK_Y, 1);
    expect(src.read().axes.moveX).toBeGreaterThan(0);
    expect(src.read().axes.moveY).toBeCloseTo(0);

    // Move down — stick Y increases
    ptr(overlay, 'pointermove', STICK_X + 40, STICK_Y + 30, 1);
    expect(src.read().axes.moveY).toBeGreaterThan(0);

    // Release — stick resets
    ptr(overlay, 'pointerup', STICK_X + 40, STICK_Y + 30, 1);
    expect(src.read().axes.moveX).toBe(0);
    expect(src.read().axes.moveY).toBe(0);

    src.destroy();
  });

  it('clamps stick travel to the radius', () => {
    mockRect(800, 400);
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const src = new TouchOverlaySource<Btn, Ax>(parent, layout);
    const overlay = parent.querySelector('.touch-overlay')!;

    ptr(overlay, 'pointerdown', STICK_X, STICK_Y, 1);
    // Move way past the radius
    ptr(overlay, 'pointermove', STICK_X + 500, STICK_Y, 1);
    const mx = src.read().axes.moveX;
    expect(mx).toBeLessThanOrEqual(1);
    expect(mx).toBeGreaterThanOrEqual(0.9);

    ptr(overlay, 'pointerup', STICK_X + 500, STICK_Y, 1);
    src.destroy();
  });

  it('pointercancel releases the zone (no stuck inputs, Req 6.5)', () => {
    mockRect(800, 400);
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const src = new TouchOverlaySource<Btn, Ax>(parent, layout);
    const overlay = parent.querySelector('.touch-overlay')!;

    ptr(overlay, 'pointerdown', FIRE_X, FIRE_Y, 1);
    expect(src.read().buttons.fire).toBe(true);

    // System cancels the pointer (e.g. too many touches)
    ptr(overlay, 'pointercancel', FIRE_X, FIRE_Y, 1);
    expect(src.read().buttons.fire).toBe(false);

    src.destroy();
  });

  it('pointercancel on stick resets axes', () => {
    mockRect(800, 400);
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const src = new TouchOverlaySource<Btn, Ax>(parent, layout);
    const overlay = parent.querySelector('.touch-overlay')!;

    ptr(overlay, 'pointerdown', STICK_X, STICK_Y, 1);
    ptr(overlay, 'pointermove', STICK_X + 40, STICK_Y, 1);
    expect(src.read().axes.moveX).toBeGreaterThan(0);

    ptr(overlay, 'pointercancel', STICK_X + 40, STICK_Y, 1);
    expect(src.read().axes.moveX).toBe(0);

    src.destroy();
  });

  it('creates the overlay DOM inside the parent', () => {
    mockRect(800, 400);
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const src = new TouchOverlaySource<Btn, Ax>(parent, layout);

    expect(parent.querySelector('.touch-overlay')).toBeTruthy();
    expect(parent.querySelectorAll('.touch-button').length).toBe(2);

    src.destroy();
  });

  it('destroy() removes the overlay layer from the DOM', () => {
    mockRect(800, 400);
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const src = new TouchOverlaySource<Btn, Ax>(parent, layout);

    expect(parent.querySelector('.touch-overlay')).toBeTruthy();
    src.destroy();
    expect(parent.querySelector('.touch-overlay')).toBeNull();
  });
});
