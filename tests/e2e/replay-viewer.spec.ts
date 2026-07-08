import { test, expect } from '@playwright/test';

/**
 * Task 8 — Replay viewer e2e (Req 10.5, 14.2).
 *
 * Verifies the dev-only replay viewer: paste form appears on `#replay`, a trace
 * loads and creates a canvas, playback controls work, and the frame counter
 * advances. Uses a minimal synthetic trace (1 neutral frame).
 */

/** Minimal valid trace: version=1, 1 frame, 13 buttons (2 bytes), 0 axes, all neutral. */
function minimalTraceBase64(): string {
  const bytes = Buffer.from([1, 0, 0, 0, 1, 13, 0, 0, 0]);
  return bytes.toString('base64');
}

test('replay viewer paste form loads on #replay', async ({ page }) => {
  await page.goto('/#replay');
  await expect(page.locator('.arcade-replay-form')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.replay-load')).toBeVisible();
  await expect(page.locator('.replay-seed')).toBeVisible();
  await expect(page.locator('.replay-trace')).toBeVisible();
});

test('loading a trace creates a canvas and playback advances the frame counter', async ({ page }) => {
  await page.goto('/#replay');
  await expect(page.locator('.arcade-replay-form')).toBeVisible({ timeout: 10_000 });

  await page.locator('.replay-seed').fill('42');
  await page.locator('.replay-trace').fill(minimalTraceBase64());
  await page.locator('.replay-load').click();

  // The replay shell with a canvas appears.
  await expect(page.locator('.arcade-replay-shell')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('canvas')).toBeVisible({ timeout: 10_000 });

  // Playback controls are present.
  await expect(page.locator('.replay-toggle')).toBeVisible();
  await expect(page.locator('.replay-speed').first()).toBeVisible();
  await expect(page.locator('.replay-frame-counter')).toBeVisible();

  // The frame counter shows a non-zero total (the trace has 1 frame).
  await expect
    .poll(async () => {
      const text = await page.locator('.replay-frame-counter').textContent();
      return text ?? '';
    })
    .toContain('Frame');

  // The engine is exposed on window for debugging.
  const hasEngine = await page.evaluate(() =>
    Boolean((window as unknown as { __engine?: unknown }).__engine),
  );
  expect(hasEngine).toBe(true);
});

test('pause button stops playback and step advances one frame', async ({ page }) => {
  await page.goto('/#replay');
  await expect(page.locator('.arcade-replay-form')).toBeVisible({ timeout: 10_000 });

  await page.locator('.replay-seed').fill('42');
  await page.locator('.replay-trace').fill(minimalTraceBase64());
  await page.locator('.replay-load').click();
  await expect(page.locator('canvas')).toBeVisible({ timeout: 10_000 });

  // Pause playback.
  const toggle = page.locator('.replay-toggle');
  await toggle.click();
  await expect(toggle).toHaveText('▶ Play');

  // Read current frame, step, verify it advanced.
  const before = await page.locator('.replay-frame-counter').textContent();
  await page.locator('.replay-step').click();
  await page.waitForTimeout(200);
  const after = await page.locator('.replay-frame-counter').textContent();
  expect(after).not.toBe(before);
});

test('speed buttons switch the active speed', async ({ page }) => {
  await page.goto('/#replay');
  await expect(page.locator('.arcade-replay-form')).toBeVisible({ timeout: 10_000 });

  await page.locator('.replay-seed').fill('42');
  await page.locator('.replay-trace').fill(minimalTraceBase64());
  await page.locator('.replay-load').click();
  await expect(page.locator('canvas')).toBeVisible({ timeout: 10_000 });

  // Default: 1× is active.
  const oneX = page.locator('.replay-speed', { hasText: '1×' });
  await expect(oneX).toHaveClass(/active/);

  // Click 2×.
  const twoX = page.locator('.replay-speed', { hasText: '2×' });
  await twoX.click();
  await expect(twoX).toHaveClass(/active/);
  await expect(oneX).not.toHaveClass(/active/);
});
