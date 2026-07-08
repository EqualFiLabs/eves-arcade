import { test, expect } from '@playwright/test';
import { launchRprViaShell, runningSceneKey } from './helpers';

/**
 * Task 11.4 — input smoke tests. Drives the keyboard in a real browser and
 * confirms movement and attack inputs reach the deterministic simulation
 * (Req 5.1, 5.5, 5.6, 5.10). Reads the engine exposed on `window.__engine`.
 * Launched through the arcade shell.
 */

async function snapshot(page: import('@playwright/test').Page): Promise<{ px: number; pmeter: number; chp: number }> {
  return page.evaluate(() => {
    const s = (window as unknown as { __engine?: { state?: { player?: { position?: { x?: number }; meter?: number }; cpu?: { health?: number } } } }).__engine?.state;
    return { px: s?.player?.position?.x ?? 0, pmeter: s?.player?.meter ?? 0, chp: s?.cpu?.health ?? 0 };
  });
}

test('keyboard movement and attacks reach the simulation', async ({ page }) => {
  await launchRprViaShell(page);
  // Enter the fight: the helper lands on MenuScene; the engine is exposed once FightScene runs.
  await page.keyboard.press('Enter');
  await expect.poll(() => runningSceneKey(page)).toBe('FightScene');

  // --- Movement (Req 5.1): holding ArrowRight walks the player toward the CPU. ---
  const before = await snapshot(page);
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(600);
  await page.keyboard.up('ArrowRight');
  const afterMove = await snapshot(page);
  expect(afterMove.px).toBeGreaterThan(before.px);

  // --- Attack (Req 5.5/5.6): mashing light (Z) starts moves, granting meter on use. ---
  await page.keyboard.down('ArrowRight'); // keep closing distance so strikes can land
  for (let i = 0; i < 12; i++) {
    await page.keyboard.down('KeyZ');
    await page.waitForTimeout(70);
    await page.keyboard.up('KeyZ');
    await page.waitForTimeout(70);
  }
  await page.keyboard.up('ArrowRight');
  const afterAttack = await snapshot(page);
  // Meter gain on move use proves the attack input was processed by the sim.
  expect(afterAttack.pmeter).toBeGreaterThan(before.pmeter);
});
