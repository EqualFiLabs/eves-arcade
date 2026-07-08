import type { InputFrame, InputSource } from './frame';

/**
 * Data-driven touch layout describing on-screen zones for a game (Req 6.2).
 *
 * The game owns its layout; the shared overlay renders it. Three zone kinds:
 * - **button** — a circular tap target that asserts a boolean action.
 * - **stick** — a floating analog stick that appears wherever the finger first
 *   touches within the anchor half, producing two axes (-1..1).
 * - **drag** — a rectangular region that maps absolute pointer position to two
 *   axes (for Squadron-style aiming).
 *
 * Coordinates are normalized per anchor half (0..1), so a layout works at any
 * viewport size. Radii are fractions of the viewport's min(width, height).
 */
export interface TouchLayout<B extends string, X extends string = never> {
  zones: ReadonlyArray<TouchZone<B, X>>;
}

export type TouchZone<B extends string, X extends string> =
  | TouchButtonZone<B>
  | TouchStickZone<X>
  | TouchDragZone<X>;

export interface TouchButtonZone<B extends string> {
  kind: 'button';
  action: B;
  /** Which half of the screen the button sits in. */
  anchor: 'left' | 'right';
  /** Normalized X within the anchor half (0..1). */
  x: number;
  /** Normalized Y within the full height (0..1). */
  y: number;
  /** Circle radius as a fraction of min(width, height). */
  r: number;
  label: string;
}

export interface TouchStickZone<X extends string> {
  kind: 'stick';
  /** Axes produced by the stick: [xAxis, yAxis]. */
  axes: readonly [X, X];
  /** Which half of the screen is the stick touch area. */
  anchor: 'left' | 'right';
  /** Max travel radius (fraction of min(width, height)). */
  r: number;
}

export interface TouchDragZone<X extends string> {
  kind: 'drag';
  axes: readonly [X, X];
  region: 'full' | 'left' | 'right';
}

type PointerState<B extends string, X extends string> =
  | { type: 'button'; action: B }
  | { type: 'stick' }
  | { type: 'drag'; zone: TouchDragZone<X>; originX: number; originY: number };

const OVERLAY_CSS = `
.touch-overlay {
  position: absolute;
  inset: 0;
  z-index: 10;
  pointer-events: auto;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
}
.touch-button {
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.10);
  border: 2px solid rgba(255, 255, 255, 0.22);
  color: rgba(255, 255, 255, 0.7);
  font-family: monospace;
  font-weight: bold;
  pointer-events: none;
  transform: translate(-50%, -50%);
  transition: background 0.06s, border-color 0.06s;
}
.touch-button.active {
  background: rgba(124, 246, 164, 0.30);
  border-color: rgba(124, 246, 164, 0.60);
  color: rgba(255, 255, 255, 0.95);
}
.touch-stick-base, .touch-stick-thumb {
  position: absolute;
  border-radius: 50%;
  pointer-events: none;
  transform: translate(-50%, -50%);
}
.touch-stick-base {
  background: rgba(255, 255, 255, 0.06);
  border: 2px solid rgba(255, 255, 255, 0.12);
}
.touch-stick-thumb {
  background: rgba(255, 255, 255, 0.22);
  border: 2px solid rgba(255, 255, 255, 0.35);
}
`;

/**
 * Touch overlay input source — a DOM layer above the canvas that renders a
 * game-supplied {@link TouchLayout} and reports multi-touch input (Req 6.1–6.3,
 * 6.5).
 *
 * The layer handles all pointer events (per-pointerId tracking, pointer
 * capture, `touch-action: none`). Buttons are pressed when a finger lands in
 * their circle; the floating stick appears wherever the finger first touches
 * within its anchor half. `pointercancel` and `pointerup` both release the
 * pointer's zone (no stuck inputs — Req 6.3, 6.5).
 *
 * No Phaser. Pure DOM + pointer events. Destroy removes the layer and all
 * listeners (Req 6.6).
 */
export class TouchOverlaySource<B extends string, X extends string = never>
  implements InputSource<B, X>
{
  readonly available = true;

  private readonly layer: HTMLDivElement;
  private readonly buttonEls = new Map<string, HTMLDivElement>();
  private readonly stickBaseEl: HTMLDivElement;
  private readonly stickThumbEl: HTMLDivElement;
  private readonly resizeObserver: ResizeObserver | null;

  private readonly pointers = new Map<number, PointerState<B, X>>();
  private readonly buttonPressed = new Set<string>();
  private readonly stickZone: TouchStickZone<X> | undefined;
  private readonly dragZones: readonly TouchDragZone<X>[];
  private readonly buttonZones: readonly TouchButtonZone<B>[];

  private stickX = 0;
  private stickY = 0;
  private stickOriginX = 0;
  private stickOriginY = 0;

  private readonly onPointerDown: (e: PointerEvent) => void;
  private readonly onPointerMove: (e: PointerEvent) => void;
  private readonly onPointerUp: (e: PointerEvent) => void;

  constructor(parent: HTMLElement, layout: TouchLayout<B, X>) {
    this.buttonZones = layout.zones.filter((z): z is TouchButtonZone<B> => z.kind === 'button');
    this.stickZone = layout.zones.find((z): z is TouchStickZone<X> => z.kind === 'stick');
    this.dragZones = layout.zones.filter((z): z is TouchDragZone<X> => z.kind === 'drag');

    this.layer = document.createElement('div');
    this.layer.className = 'touch-overlay';

    const style = document.createElement('style');
    style.textContent = OVERLAY_CSS;
    this.layer.appendChild(style);

    for (const zone of this.buttonZones) {
      const el = document.createElement('div');
      el.className = 'touch-button';
      el.textContent = zone.label;
      this.buttonEls.set(zone.action, el);
      this.layer.appendChild(el);
    }

    this.stickBaseEl = document.createElement('div');
    this.stickBaseEl.className = 'touch-stick-base';
    this.stickBaseEl.style.display = 'none';
    this.layer.appendChild(this.stickBaseEl);

    this.stickThumbEl = document.createElement('div');
    this.stickThumbEl.className = 'touch-stick-thumb';
    this.stickThumbEl.style.display = 'none';
    this.layer.appendChild(this.stickThumbEl);

    this.layoutZones();

    this.onPointerDown = (e: PointerEvent): void => this.handleDown(e);
    this.onPointerMove = (e: PointerEvent): void => this.handleMove(e);
    this.onPointerUp = (e: PointerEvent): void => this.handleUp(e);

    this.layer.addEventListener('pointerdown', this.onPointerDown);
    this.layer.addEventListener('pointermove', this.onPointerMove);
    this.layer.addEventListener('pointerup', this.onPointerUp);
    this.layer.addEventListener('pointercancel', this.onPointerUp);

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.layoutZones());
      this.resizeObserver.observe(parent);
    } else {
      this.resizeObserver = null;
    }

    parent.appendChild(this.layer);
  }

  read(): InputFrame<B, X> {
    const buttons = {} as Record<B, boolean>;
    for (const zone of this.buttonZones) {
      buttons[zone.action] = this.buttonPressed.has(zone.action as string);
    }

    const axes = {} as Record<X, number>;
    if (this.stickZone) {
      axes[this.stickZone.axes[0]] = this.stickX;
      axes[this.stickZone.axes[1]] = this.stickY;
    }
    // Drag axes are set by handleMove via stickX/stickY-like fields on the pointer state;
    // for V1 RPR only uses stick, drag is for Squadron.

    return { buttons, axes };
  }

  /** Removes the overlay DOM layer and all event listeners. */
  destroy(): void {
    this.layer.removeEventListener('pointerdown', this.onPointerDown);
    this.layer.removeEventListener('pointermove', this.onPointerMove);
    this.layer.removeEventListener('pointerup', this.onPointerUp);
    this.layer.removeEventListener('pointercancel', this.onPointerUp);
    this.resizeObserver?.disconnect();
    this.layer.remove();
  }

  // ── Pointer handling ──────────────────────────────────────────────────────

  private handleDown(e: PointerEvent): void {
    const rect = this.layer.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;

    // Hit-test buttons first (higher priority for precise taps)
    for (const zone of this.buttonZones) {
      const center = this.zoneCenter(zone, rect);
      if (Math.hypot(px - center.x, py - center.y) <= center.r) {
        this.buttonPressed.add(zone.action as string);
        this.buttonEls.get(zone.action as string)?.classList.add('active');
        this.pointers.set(e.pointerId, { type: 'button', action: zone.action });
        this.setCapture(e);
        return;
      }
    }

    // Stick region
    if (this.stickZone && this.inAnchor(this.stickZone.anchor, px, rect)) {
      this.pointers.set(e.pointerId, { type: 'stick' });
      this.stickOriginX = px;
      this.stickOriginY = py;
      this.stickX = 0;
      this.stickY = 0;
      this.showStickVisual(px, py, rect);
      this.setCapture(e);
      return;
    }

    // Drag zones
    for (const zone of this.dragZones) {
      if (this.inRegion(zone.region, px, py, rect)) {
        this.pointers.set(e.pointerId, {
          type: 'drag',
          zone,
          originX: px,
          originY: py,
        });
        this.setCapture(e);
        return;
      }
    }
  }

  private handleMove(e: PointerEvent): void {
    const ptr = this.pointers.get(e.pointerId);
    if (!ptr) return;
    const rect = this.layer.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;

    if (ptr.type === 'stick' && this.stickZone) {
      const r = this.stickZone.r * Math.min(rect.width, rect.height);
      const dx = px - this.stickOriginX;
      const dy = py - this.stickOriginY;
      const dist = Math.hypot(dx, dy);
      const scale = dist > r ? r / dist : 1;
      this.stickX = (dx * scale) / r;
      this.stickY = (dy * scale) / r;
      this.updateStickVisual(this.stickOriginX + dx * scale, this.stickOriginY + dy * scale);
    }
  }

  private handleUp(e: PointerEvent): void {
    const ptr = this.pointers.get(e.pointerId);
    if (!ptr) return;

    if (ptr.type === 'button') {
      this.buttonPressed.delete(ptr.action as string);
      this.buttonEls.get(ptr.action as string)?.classList.remove('active');
    }
    if (ptr.type === 'stick') {
      this.stickX = 0;
      this.stickY = 0;
      this.stickBaseEl.style.display = 'none';
      this.stickThumbEl.style.display = 'none';
    }

    this.pointers.delete(e.pointerId);
    try {
      this.layer.releasePointerCapture(e.pointerId);
    } catch {
      // Already released or never captured
    }
  }

  // ── Layout ────────────────────────────────────────────────────────────────

  private layoutZones(): void {
    const rect = this.layer.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const minDim = Math.min(rect.width, rect.height);

    for (const zone of this.buttonZones) {
      const el = this.buttonEls.get(zone.action as string);
      if (!el) continue;
      const center = this.zoneCenter(zone, rect);
      el.style.left = `${center.x}px`;
      el.style.top = `${center.y}px`;
      el.style.width = `${zone.r * 2 * minDim}px`;
      el.style.height = `${zone.r * 2 * minDim}px`;
      el.style.fontSize = `${Math.max(10, zone.r * minDim * 0.5)}px`;
    }

    if (this.stickZone) {
      const r = this.stickZone.r * minDim;
      this.stickBaseEl.style.width = `${r * 2}px`;
      this.stickBaseEl.style.height = `${r * 2}px`;
      this.stickThumbEl.style.width = `${r}px`;
      this.stickThumbEl.style.height = `${r}px`;
    }
  }

  private zoneCenter(zone: TouchButtonZone<B>, rect: DOMRect): { x: number; y: number; r: number } {
    const halfW = rect.width / 2;
    const anchorX = zone.anchor === 'left' ? 0 : halfW;
    const minDim = Math.min(rect.width, rect.height);
    return {
      x: anchorX + zone.x * halfW,
      y: zone.y * rect.height,
      r: zone.r * minDim,
    };
  }

  private inAnchor(anchor: 'left' | 'right', px: number, rect: DOMRect): boolean {
    return anchor === 'left' ? px < rect.width / 2 : px >= rect.width / 2;
  }

  private inRegion(region: 'full' | 'left' | 'right', px: number, py: number, rect: DOMRect): boolean {
    if (region === 'full') return true;
    return this.inAnchor(region, px, rect);
  }

  private showStickVisual(x: number, y: number, rect: DOMRect): void {
    const r = (this.stickZone?.r ?? 0.1) * Math.min(rect.width, rect.height);
    this.stickBaseEl.style.width = `${r * 2}px`;
    this.stickBaseEl.style.height = `${r * 2}px`;
    this.stickBaseEl.style.left = `${x}px`;
    this.stickBaseEl.style.top = `${y}px`;
    this.stickBaseEl.style.display = '';

    this.stickThumbEl.style.left = `${x}px`;
    this.stickThumbEl.style.top = `${y}px`;
    this.stickThumbEl.style.display = '';
  }

  private updateStickVisual(x: number, y: number): void {
    this.stickThumbEl.style.left = `${x}px`;
    this.stickThumbEl.style.top = `${y}px`;
  }

  private setCapture(e: PointerEvent): void {
    try {
      this.layer.setPointerCapture(e.pointerId);
    } catch {
      // Some environments don't support pointer capture
    }
  }
}
