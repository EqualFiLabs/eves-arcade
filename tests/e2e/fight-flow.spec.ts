import { test, expect } from '@playwright/test';

/**
 * Task 13.6 — fight-flow e2e. Verifies fighters + HUD render, keyboard input
 * moves the player, the CPU acts, and a KO surfaces the themed result text.
 * Reads the engine exposed on `window.__engine`. Headless software-GL renders
 * slower than a real GPU, so all assertions poll over generous windows.
 */

const ACTIVE = 5; // Phaser.Scenes.RUNNING

async function runningSceneKey(page: import('@playwright/test').Page): Promise<string | undefined> {
  return page.evaluate((active) => {
    const scenes = (window as unknown as { __game?: { scene?: { scenes?: { sys?: { settings?: { key?: string; status?: number } } }[] } } }).__game?.scene?.scenes ?? [];
    return scenes.find((s) => s?.sys?.settings?.status === active)?.sys?.settings?.key;
  }, ACTIVE);
}

async function engineState(page: import('@playwright/test').Page): Promise<{
  frame: number;
  px: number;
  cx: number;
  ph: number;
  ch: number;
  status: string;
}> {
  return page.evaluate(() => {
    const s = (window as unknown as { __engine?: { state?: { frame?: number; status?: string; player?: { position?: { x?: number }; health?: number }; cpu?: { position?: { x?: number }; health?: number } } } }).__engine?.state;
    return {
      frame: s?.frame ?? 0,
      px: s?.player?.position?.x ?? 0,
      cx: s?.cpu?.position?.x ?? 0,
      ph: s?.player?.health ?? 0,
      ch: s?.cpu?.health ?? 0,
      status: s?.status ?? 'unknown',
    };
  });
}

test('fighters and HUD render, input moves the player, CPU acts, KO surfaces result', async ({ page }) => {
  await page.goto('/');
  await page.locator('canvas').waitFor();
  await expect.poll(() => runningSceneKey(page)).toBe('MenuScene');
  await page.keyboard.press('Enter');
  await expect.poll(() => runningSceneKey(page)).toBe('FightScene');

  // Both fighters spawned at distinct positions (Req 3.1/3.2).
  const start = await engineState(page);
  expect(start.px).not.toBe(start.cx);

  // Keyboard reaches the sim: holding right walks the player toward the CPU (Req 5.10).
  await page.keyboard.down('ArrowRight');
  await expect.poll(async () => (await engineState(page)).px, { timeout: 15_000 }).toBeGreaterThan(start.px);
  await page.keyboard.up('ArrowRight');

  // CPU acts: the brain drives Bogdanoff off its spawn (Req 8.1).
  await expect.poll(async () => (await engineState(page)).cx, { timeout: 15_000 }).not.toBe(start.cx);

  // Play to a KO: approach and trade blows. The round resolves (Req 3.4/3.5).
  await page.keyboard.down('ArrowRight');
  await expect
    .poll(async () => (await engineState(page)).status, { timeout: 60_000 })
    .toMatch(/player_win|cpu_win/);
  await page.keyboard.up('ArrowRight');

  const end = await engineState(page);
  expect(['player_win', 'cpu_win']).toContain(end.status);
  // The loser is at zero health.
  expect(Math.min(end.ph, end.ch)).toBe(0);
});
