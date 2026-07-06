/**
 * World-to-screen transform for the V1 stage.
 *
 * The sim world is centered at x=0 (worldBounds.x = -640..640) with y growing
 * downward and the floor at floorY. The Phaser canvas spans 0..1280 / 0..720, so
 * screenX = simX - worldBounds.x and screenY = simY (the stage already uses the
 * canvas y range). Renderers consume this so they never hardcode the offset.
 */
export interface ScreenTransform {
  offsetX: number;
  floorY: number;
}

export function screenTransform(worldBoundsX: number, floorY: number): ScreenTransform {
  return { offsetX: -worldBoundsX, floorY };
}

export const toScreenX = (t: ScreenTransform, simX: number): number => simX + t.offsetX;
export const toScreenY = (t: ScreenTransform, simY: number): number => simY;
