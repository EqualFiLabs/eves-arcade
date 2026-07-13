import { test, expect } from '@playwright/test';
import { launchRprViaShell, runningSceneKey } from './helpers';

/**
 * Task 4.6 — result-flow e2e. Verifies the full lifecycle:
 * KO → DOM result screen (score, share, hooks) → Play Again relaunches the game.
 *
 * The result screen appears ~2s after KO (KO_RESULT_DELAY_MS in FightScene), so
 * the DOM assertions poll generously. The shell tears down the Phaser instance
 * when onResult fires; Play Again re-launches a fresh one.
 */

test('KO → DOM result screen with score/share/hooks → Play Again relaunches', async ({ page }) => {
  await page.route('**/api/results', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    await route.continue();
  });
  await launchRprViaShell(page);
  await page.keyboard.press('Enter');
  await expect.poll(() => runningSceneKey(page)).toBe('FightScene');

  // Play to KO: walk toward the CPU and trade blows until the round resolves.
  await page.keyboard.down('ArrowRight');
  await expect
    .poll(
      async () =>
        (
          await page.evaluate(() => {
            const s = (window as unknown as { __engine?: { state?: { status?: string } } }).__engine
              ?.state;
            return s?.status ?? 'unknown';
          })
        ),
      { timeout: 60_000 },
    )
    .toMatch(/player_win|cpu_win/);
  await page.keyboard.up('ArrowRight');

  // The DOM result screen appears after a brief KO feedback delay.
  await expect(page.locator('.arcade-result')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.arcade-result-badge')).toHaveText('Verifying');
  await expect(page.locator('.arcade-result-badge')).toHaveText('Verified', { timeout: 10_000 });
  await expect(page.locator('.arcade-submission-message')).toContainText('Rank #');

  // Outcome label (win/loss) and score are present.
  await expect(page.locator('.arcade-result-outcome')).toBeVisible();
  const outcomeClass = await page.locator('.arcade-result-outcome').getAttribute('class');
  expect(outcomeClass).toMatch(/arcade-win|arcade-loss/);

  await expect(page.locator('.arcade-result-score strong')).toBeVisible();
  const scoreText = await page.locator('.arcade-result-score strong').textContent();
  expect(Number(scoreText)).toBeGreaterThanOrEqual(0);

  // Stats are shown.
  await expect(page.locator('.arcade-result-stats')).toBeVisible();

  // Share copy + URL + copy button.
  await expect(page.locator('.arcade-share-text')).not.toBeEmpty();
  await expect(page.locator('.arcade-share-url')).not.toBeEmpty();
  await expect(page.locator('.arcade-share-copy')).toBeVisible();

  // Distribution hooks: at least the enabled "related-project" hook is visible.
  await expect(page.locator('.arcade-hook').first()).toBeVisible();

  // The game instance was torn down (window.__game cleared by the shell).
  const gameAlive = await page.evaluate(() => {
    return Boolean((window as unknown as { __game?: unknown }).__game);
  });
  expect(gameAlive).toBe(false);

  // Play Again: relaunches the game with a fresh Phaser instance.
  await page.locator('.arcade-play-again').click();
  await expect(page.locator('canvas')).toBeVisible({ timeout: 10_000 });
  await expect.poll(() => runningSceneKey(page), { timeout: 10_000 }).toBe('MenuScene');
});

test('Copy button shows a status message (clipboard or selection fallback)', async ({ page }) => {
  await page.route('**/api/sessions', (route) => route.abort());
  await launchRprViaShell(page);
  await page.keyboard.press('Enter');
  await expect.poll(() => runningSceneKey(page)).toBe('FightScene');

  // Play to KO.
  await page.keyboard.down('ArrowRight');
  await expect
    .poll(
      async () =>
        (
          await page.evaluate(() => {
            const s = (window as unknown as { __engine?: { state?: { status?: string } } }).__engine
              ?.state;
            return s?.status ?? 'unknown';
          })
        ),
      { timeout: 60_000 },
    )
    .toMatch(/player_win|cpu_win/);
  await page.keyboard.up('ArrowRight');

  await expect(page.locator('.arcade-result')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.arcade-result-badge')).toHaveText('Unranked');

  // Click copy — the status message appears regardless of clipboard availability.
  await page.locator('.arcade-share-copy').click();
  await expect(page.locator('.arcade-share-status')).toBeVisible({ timeout: 5_000 });
  const status = await page.locator('.arcade-share-status').textContent();
  expect(status).toBeTruthy();
});

test('Back to Arcade returns to the game selection screen', async ({ page }) => {
  await launchRprViaShell(page);
  await page.keyboard.press('Enter');
  await expect.poll(() => runningSceneKey(page)).toBe('FightScene');

  // Play to KO.
  await page.keyboard.down('ArrowRight');
  await expect
    .poll(
      async () =>
        (
          await page.evaluate(() => {
            const s = (window as unknown as { __engine?: { state?: { status?: string } } }).__engine
              ?.state;
            return s?.status ?? 'unknown';
          })
        ),
      { timeout: 60_000 },
    )
    .toMatch(/player_win|cpu_win/);
  await page.keyboard.up('ArrowRight');

  await expect(page.locator('.arcade-result')).toBeVisible({ timeout: 10_000 });

  // Back to Arcade returns to the selection surface.
  await page.locator('.arcade-back-to-arcade').click();
  await expect(page.locator('.arcade-select')).toBeVisible();
  await expect(page.locator('.arcade-game')).toBeVisible();
});
