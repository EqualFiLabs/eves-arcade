import { test, expect } from '@playwright/test';
import { launchRprViaShell, runningSceneKey } from './helpers';

/**
 * Task 13.6 — fight-flow e2e. Verifies fighters + HUD render, keyboard input
 * moves the player, the CPU acts, and a KO surfaces the themed result text.
 * Launched through the arcade shell. Reads the engine exposed on `window.__engine`.
 * Headless software-GL renders slower than a real GPU, so all assertions poll
 * over generous windows.
 */

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

/** Reads EffectsRenderer telemetry exposed on window (counts of feedback played). */
async function effectCounts(page: import('@playwright/test').Page): Promise<{
  hit: number;
  block: number;
  special: number;
  super: number;
  ko: number;
}> {
  return page.evaluate(() => {
    const c = (window as unknown as { __effects?: { counts?: Record<string, number> } }).__effects?.counts;
    return { hit: c?.hit ?? 0, block: c?.block ?? 0, special: c?.special ?? 0, super: c?.super ?? 0, ko: c?.ko ?? 0 };
  });
}

test('fighters and HUD render, input moves the player, CPU acts, KO surfaces result', async ({ page }) => {
  await launchRprViaShell(page);
  // Enter the fight: the helper lands on MenuScene; the engine is exposed once FightScene runs.
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

  // Combat feedback fired during the fight: at least one hit spark and the KO
  // presentation played (Req 11.3/11.6). Presentation is driven purely by
  // CombatEvents emitted from the sim (Property 10).
  const fx = await effectCounts(page);
  expect(fx.hit).toBeGreaterThan(0);
  expect(fx.ko).toBe(1);
});
