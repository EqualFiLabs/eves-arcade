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
 * → Operator selection → Phaser.Game) and waits until FightScene is running. The shell is
 * DOM; the game is canvas, so this bridges both layers.
 */
export async function launchRprViaShell(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('.arcade-game')).toBeVisible();
  await page.locator('.arcade-game').first().click();
  await chooseRprOperators(page);
  await page.getByRole('button', { name: 'Fight', exact: true }).click();
  // The game canvas mounts inside #arcade-mount once Phaser boots.
  await expect(page.locator('canvas')).toBeVisible();
  await expect.poll(() => runningSceneKey(page)).toBe('FightScene');
}

export async function selectOperator(page: Page, side: 'player' | 'cpu', tokenId: number): Promise<void> {
  const panel = page.locator(`fieldset[data-side="${side}"]`);
  await panel.getByLabel('Operator token ID').fill(String(tokenId));
  await panel.getByRole('button', { name: 'Load', exact: true }).click();
  await expect(panel.getByRole('img', { name: `Operator #${tokenId}`, exact: true })).toBeVisible();
}

export async function chooseRprOperators(page: Page, playerId = 42, cpuId = 5555): Promise<void> {
  await expect(page.getByRole('heading', { name: 'Choose your Operators' })).toBeVisible();
  await selectOperator(page, 'player', playerId);
  await selectOperator(page, 'cpu', cpuId);
  await expect(page.getByRole('button', { name: 'Fight', exact: true })).toBeEnabled();
}
