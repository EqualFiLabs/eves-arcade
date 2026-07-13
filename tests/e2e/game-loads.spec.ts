import { test, expect } from '@playwright/test';
import { launchRprViaShell, runningSceneKey } from './helpers';

/**
 * Smoke tests through the arcade shell: the DOM shell boots, the game launches
 * into its own Phaser instance on selection, and the scene flow Boot → Preload →
 * Menu → Fight advances the simulation (Req 1, 3.5, 15.2).
 */

async function engineFrame(page: import('@playwright/test').Page): Promise<number> {
  return page.evaluate(() => {
    const engine = (window as unknown as { __engine?: { state?: { frame?: number } } }).__engine;
    return engine?.state?.frame ?? -1;
  });
}

async function gameBooted(page: import('@playwright/test').Page): Promise<boolean> {
  return page.evaluate(() => !!(window as unknown as { __game?: { isBooted: boolean } }).__game?.isBooted);
}

test('arcade shell loads and lists Rug Pull Rumble', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Meme Arcade/);
  await expect(page.locator('#app')).toBeAttached();
  // The shell's game-selection surface renders before any game loads (DOM, no canvas).
  await expect(page.locator('.arcade-game')).toBeVisible();
  await expect(page.locator('.arcade-game-title')).toContainText('Rug Pull Rumble');
});

test('selecting a game launches its own Phaser instance into the canvas', async ({ page }) => {
  await page.goto('/');
  await page.locator('.arcade-game').first().click();
  await expect(page.locator('canvas')).toBeVisible();
  await expect.poll(() => gameBooted(page)).toBe(true);
});

test('repeated teardown and relaunch keeps one clean game instance (Property 3)', async ({ page }) => {
  await page.goto('/');

  for (let launch = 0; launch < 3; launch += 1) {
    await page.locator('.arcade-game').first().click();
    await expect.poll(() => runningSceneKey(page)).toBe('MenuScene');
    await expect(page.locator('canvas')).toHaveCount(1);
    const freshInstance = await page.evaluate(() => {
      const debug = window as unknown as { __game?: object; __previousGame?: object };
      const fresh = Boolean(debug.__game) && debug.__game !== debug.__previousGame;
      debug.__previousGame = debug.__game;
      return fresh;
    });
    expect(freshInstance).toBe(true);

    await page.locator('.arcade-back').click();
    await expect.poll(() => page.locator('canvas').count()).toBe(0);
    await expect(page.locator('.arcade-game')).toBeVisible();
    await expect
      .poll(async () => page.evaluate(() => (window as unknown as {
        __game?: object;
        __engine?: object;
        __effects?: object;
      }).__game))
      .toBeUndefined();
    const debugGlobals = await page.evaluate(() => {
      const debug = window as unknown as { __engine?: object; __effects?: object };
      return { engine: debug.__engine, effects: debug.__effects };
    });
    expect(debugGlobals).toEqual({ engine: undefined, effects: undefined });
  }
});

test('scene flow reaches the menu and the fight steps the simulation', async ({ page }) => {
  await launchRprViaShell(page);

  // Start the fight; FightScene exposes the engine on window.
  await page.keyboard.press('Enter');
  await expect.poll(() => engineFrame(page)).toBeGreaterThan(0);

  // The fixed-step loop keeps advancing frames (Req 15.3). Headless software-GL
  // renders slower than a real GPU, so poll over a generous window.
  await expect.poll(async () => engineFrame(page), { timeout: 15_000 }).toBeGreaterThan(20);
});
