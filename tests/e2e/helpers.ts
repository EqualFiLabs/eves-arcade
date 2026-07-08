import { expect, type Page } from '@playwright/test';

/**
 * Shared e2e helpers for the arcade shell entry flow (Req 1, 15.2).
 *
 * Phaser renders text to the canvas (not the DOM), so scene/engine assertions
 * read the Phaser instance exposed on `window.__game` / `window.__engine` by the
 * launched game module. The shell exposes the game only after launch.
 */

export const SCENE_RUNNING = 5; // Phaser.Scenes.RUNNING

/** The key of the currently-running Phaser scene, or undefined. */
export async function runningSceneKey(page: Page): Promise<string | undefined> {
  return page.evaluate((active) => {
    const scenes = (window as unknown as { __game?: { scene?: { scenes?: { sys?: { settings?: { key?: string; status?: number } } }[] } } }).__game?.scene?.scenes ?? [];
    return scenes.find((s) => s?.sys?.settings?.status === active)?.sys?.settings?.key;
  }, SCENE_RUNNING);
}

/**
 * Launches Rug Pull Rumble through the arcade shell (selection → dynamic import
 * → Phaser.Game) and waits until the in-game MenuScene is running. The shell is
 * DOM; the game is canvas, so this bridges both layers.
 */
export async function launchRprViaShell(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('.arcade-game')).toBeVisible();
  await page.locator('.arcade-game').first().click();
  // The game canvas mounts inside #arcade-mount once Phaser boots.
  await expect(page.locator('canvas')).toBeVisible();
  await expect.poll(() => runningSceneKey(page)).toBe('MenuScene');
}
