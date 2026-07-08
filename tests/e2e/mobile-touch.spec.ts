import { test, expect } from '@playwright/test';
import { runningSceneKey } from './helpers';

/**
 * Task 5.4 — mobile touch e2e (Req 6.3, 6.5, 7.4, 15.2).
 *
 * Runs in a mobile-landscape viewport with touch enabled. Verifies the touch
 * overlay renders, stick movement reaches the simulation, and button taps
 * trigger block state. Pointer events are synthesized via page.mouse (Chromium
 * promotes mouse to pointer events in touch contexts).
 */

test('touch overlay renders and stick movement reaches the simulation', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.arcade-game')).toBeVisible();
  await page.locator('.arcade-game').first().click();
  await expect(page.locator('canvas')).toBeVisible();
  await expect.poll(() => runningSceneKey(page)).toBe('MenuScene');

  await page.keyboard.press('Enter');
  await expect.poll(() => runningSceneKey(page)).toBe('FightScene');

  // The touch overlay is rendered above the canvas (Req 6.1, 6.5).
  const overlay = page.locator('.touch-overlay');
  await expect(overlay).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.touch-button').first()).toBeVisible();

  // Read the player's starting X position.
  const startX = await page.evaluate(() => {
    const s = (window as unknown as { __engine?: { state?: { player?: { position?: { x?: number } } } } }).__engine?.state;
    return s?.player?.position?.x ?? 0;
  });

  // Use the floating stick: touch down in the left half, drag right.
  const overlayBox = await overlay.boundingBox();
  expect(overlayBox).not.toBeNull();
  const ox = overlayBox!.x;
  const oy = overlayBox!.y;
  const ow = overlayBox!.width;
  const oh = overlayBox!.height;

  const downX = ox + ow * 0.15;
  const downY = oy + oh * 0.5;
  const dragX = ox + ow * 0.35;

  await page.mouse.move(downX, downY);
  await page.mouse.down();
  await page.mouse.move(dragX, downY);

  // The player should move right (Req 6.4 — stick reaches the sim).
  await expect
    .poll(
      async () =>
        (
          await page.evaluate(() => {
            const s = (window as unknown as { __engine?: { state?: { player?: { position?: { x?: number } } } } }).__engine?.state;
            return s?.player?.position?.x ?? 0;
          })
        ),
      { timeout: 15_000 },
    )
    .toBeGreaterThan(startX);

  await page.mouse.up();
});

test('touch overlay button press reaches the simulation', async ({ page }) => {
  await page.goto('/');
  await page.locator('.arcade-game').first().click();
  await expect.poll(() => runningSceneKey(page)).toBe('MenuScene');
  await page.keyboard.press('Enter');
  await expect.poll(() => runningSceneKey(page)).toBe('FightScene');

  const overlay = page.locator('.touch-overlay');
  await expect(overlay).toBeVisible({ timeout: 10_000 });

  // Tap the block button ('BLK') — use exact text to avoid matching 'L'.
  const blockBtn = page.locator('.touch-button').filter({ hasText: /^BLK$/ });
  const box = await blockBtn.boundingBox();
  expect(box).not.toBeNull();

  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();

  // While held, the player should be blocking.
  await expect
    .poll(
      async () =>
        (
          await page.evaluate(() => {
            const s = (window as unknown as { __engine?: { state?: { player?: { runtimeFlags?: { blocking?: boolean }; currentState?: string } } } }).__engine?.state;
            return s?.player?.runtimeFlags?.blocking ?? s?.player?.currentState === 'block';
          })
        ),
      { timeout: 10_000 },
    )
    .toBe(true);

  await page.mouse.up();
});
