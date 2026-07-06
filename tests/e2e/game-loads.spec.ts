import { test, expect } from '@playwright/test';

/**
 * Smoke test: dev server boots, the canvas mounts, and the Phaser game instance
 * initializes. Covers Req 1.1 / 2.3 (no-install browser load). Full fight-flow
 * e2e arrives in later tasks.
 */
test('game loads into the canvas container', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveTitle(/Rug Pull Rumble/);
  await expect(page.locator('#game-container')).toBeAttached();
  await expect(page.locator('canvas')).toBeVisible();

  // The Phaser.Game instance is exposed on window by main.ts for debug/e2e.
  await expect
    .poll(async () => {
      return page.evaluate(() => (window as unknown as { __game?: { isBooted: boolean } }).__game?.isBooted);
    })
    .toBe(true);
});
