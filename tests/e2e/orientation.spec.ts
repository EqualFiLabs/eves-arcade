import { test, expect } from '@playwright/test';

/**
 * Req 7.3 — orientation gate. Rug Pull Rumble is landscape-only; in portrait the
 * shell overlays a rotate prompt. Runs under the `mobile-portrait` project so the
 * viewport is portrait by default.
 */

test('rotate prompt appears for Rug Pull Rumble when held in portrait', async ({ page }) => {
  await page.goto('/');
  await page.locator('.arcade-game').first().click();
  await expect(page.locator('canvas')).toBeVisible();

  // RPR declares landscape; a portrait viewport must trigger the rotate overlay.
  await expect(page.locator('.arcade-rotate')).toBeVisible();
});

test('rotating to landscape clears the rotate prompt', async ({ page }) => {
  await page.goto('/');
  await page.locator('.arcade-game').first().click();
  await expect(page.locator('.arcade-rotate')).toBeVisible();

  // Flip to landscape: viewport wider than tall.
  await page.setViewportSize({ width: 896, height: 414 });
  await expect(page.locator('.arcade-rotate')).toBeHidden();
});
