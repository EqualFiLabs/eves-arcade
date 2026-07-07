import { test, expect } from '@playwright/test';

/**
 * Smoke tests: dev server boots, the canvas mounts, and the Phaser game
 * initializes (Req 1.1 / 2.3). Also covers the Task 10 scene flow: Boot →
 * Preload → Menu → Fight, and that the fixed-step loop advances the sim.
 *
 * Phaser renders text to the canvas (not the DOM), so scene-state assertions
 * read the Phaser instance exposed on `window` by main.ts / FightScene.
 */

const ACTIVE = 5; // Phaser.Scenes.RUNNING

async function runningSceneKey(page: import('@playwright/test').Page): Promise<string | undefined> {
  return page.evaluate((active) => {
    const scenes = (window as unknown as { __game?: { scene?: { scenes?: { sys?: { settings?: { key?: string; status?: number } } }[] } } }).__game?.scene?.scenes ?? [];
    return scenes.find((s) => s?.sys?.settings?.status === active)?.sys?.settings?.key;
  }, ACTIVE);
}

async function engineFrame(page: import('@playwright/test').Page): Promise<number> {
  return page.evaluate(() => {
    const engine = (window as unknown as { __engine?: { state?: { frame?: number } } }).__engine;
    return engine?.state?.frame ?? -1;
  });
}

test('game loads into the canvas container', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveTitle(/Rug Pull Rumble/);
  await expect(page.locator('#game-container')).toBeAttached();
  await expect(page.locator('canvas')).toBeVisible();

  await expect
    .poll(async () => {
      return page.evaluate(() => (window as unknown as { __game?: { isBooted: boolean } }).__game?.isBooted);
    })
    .toBe(true);
});

test('scene flow reaches the menu and the fight steps the simulation', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible();

  // Boot → Preload → Menu.
  await expect.poll(() => runningSceneKey(page)).toBe('MenuScene');

  // Start the fight; FightScene exposes the engine on window.
  await page.keyboard.press('Enter');
  await expect.poll(() => engineFrame(page)).toBeGreaterThan(0);

  // The fixed-step loop keeps advancing frames (Req 15.3). Headless software-GL
  // renders slower than a real GPU, so poll over a generous window rather than
  // asserting after a fixed delay.
  await expect.poll(async () => engineFrame(page), { timeout: 15_000 }).toBeGreaterThan(20);
});
