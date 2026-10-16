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
  effects: { hit: number; ko: number };
  fallen: number[];
  hitstop: number[];
}> {
  return page.evaluate(() => {
    const s = (window as unknown as { __engine?: { state?: { frame?: number; status?: string; player?: { position?: { x?: number }; health?: number; hitstopFramesRemaining?: number }; cpu?: { position?: { x?: number }; health?: number; hitstopFramesRemaining?: number } } } }).__engine?.state;
    const counts = (window as unknown as { __effects?: { counts?: { hit: number; ko: number } } }).__effects?.counts;
    const game = (window as unknown as { __game?: { scene: { getScene(key: string): { children: { list: { name: string; rotation: number }[] } } } } }).__game;
    return {
      frame: s?.frame ?? 0,
      px: s?.player?.position?.x ?? 0,
      cx: s?.cpu?.position?.x ?? 0,
      ph: s?.player?.health ?? 0,
      ch: s?.cpu?.health ?? 0,
      status: s?.status ?? 'unknown',
      effects: { hit: counts?.hit ?? 0, ko: counts?.ko ?? 0 },
      fallen: game?.scene.getScene('FightScene').children.list.filter(o => o.name.startsWith('operator-rig-')).map(o => o.rotation) ?? [],
      hitstop: [s?.player?.hitstopFramesRemaining ?? 0, s?.cpu?.hitstopFramesRemaining ?? 0],
    };
  });
}

test('fighters and HUD render, input moves the player, CPU acts, KO surfaces result', async ({ page }) => {
  await launchRprViaShell(page);
  // The helper starts the prepared fight; FightScene exposes the engine.
  await expect.poll(() => runningSceneKey(page)).toBe('FightScene');

  // Both fighters spawned at distinct positions (Req 3.1/3.2).
  const start = await engineState(page);
  expect(start.px).not.toBe(start.cx);

  // Keyboard reaches the sim: holding right walks the player toward the CPU (Req 5.10).
  await page.keyboard.down('ArrowRight');
  await expect.poll(async () => (await engineState(page)).px, { timeout: 15_000 }).toBeGreaterThan(start.px);
  await page.keyboard.up('ArrowRight');

  // CPU acts: the brain drives its fighter off spawn (Req 8.1).
  await expect.poll(async () => (await engineState(page)).cx, { timeout: 15_000 }).not.toBe(start.cx);

  // Play to a KO: approach and trade blows. The round resolves (Req 3.4/3.5).
  await page.keyboard.down('ArrowRight');
  // Capture terminal state and feedback together, before the shell tears down
  // the game for its result screen and clears the debug references.
  let end = start;
  await expect
    .poll(async () => {
      end = await engineState(page);
      return end.status;
    }, { timeout: 60_000 })
    .toMatch(/player_win|cpu_win/);
  await page.keyboard.up('ArrowRight');

  expect(['player_win', 'cpu_win']).toContain(end.status);
  // The loser is at zero health.
  expect(Math.min(end.ph, end.ch)).toBe(0);
  const loser = end.ph === 0 ? 0 : 1;
  // Terminal rounds keep their final hitstop counter. A real killing blow must
  // still show the fallen rig instead of caching the standing impact pose.
  expect(end.hitstop[loser]).toBeGreaterThan(0);
  expect(Math.abs(end.fallen[loser]!)).toBeCloseTo(Math.PI / 2);

  // Combat feedback fired during the fight: at least one hit spark and the KO
  // presentation played (Req 11.3/11.6). Presentation is driven purely by
  // CombatEvents emitted from the sim (Property 10).
  const fx = end.effects;
  expect(fx.hit).toBeGreaterThan(0);
  expect(fx.ko).toBe(1);
});
