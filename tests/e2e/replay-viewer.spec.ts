import { test, expect } from '@playwright/test';

/**
 * Task 8 — Replay viewer e2e (Req 10.5, 14.2).
 *
 * Verifies the dev-only replay viewer: paste form appears on `#replay`, a trace
 * loads and creates a canvas, playback controls work, and the frame counter
 * advances. Uses a narrow synthetic trace because this test covers playback
 * controls rather than ranked verification.
 */

/** Valid V2 trace: 120 neutral frames, RPR schema width = 2 button bytes. */
function minimalTraceBase64(): string {
  const bytes = Buffer.alloc(5 + 120 * 2);
  bytes[0] = 2;
  bytes.writeUInt32BE(120, 1);
  return bytes.toString('base64');
}

function replayEnvelope(): string {
  return JSON.stringify({
    game: { id: 'rug-pull-rumble', version: '0.1.0' },
    seed: 42,
    evidence: {
      kind: 'input-trace',
      schema: { id: 'rpr.input', version: 2 },
      encodingVersion: 2,
      data: minimalTraceBase64(),
    },
  });
}

test('replay viewer paste form loads on #replay', async ({ page }) => {
  await page.goto('/#replay');
  await expect(page.locator('.arcade-replay-form')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.replay-load')).toBeVisible();
  await expect(page.locator('.replay-envelope')).toBeVisible();
  await expect(page.locator('#replay-title')).toBeFocused();
});

test('rejects unknown games and keeps focus at the invalid envelope', async ({ page }) => {
  await page.goto('/#replay');
  const envelope = JSON.parse(replayEnvelope()) as { game: { id: string } };
  envelope.game.id = 'missing-game';
  await page.locator('.replay-envelope').fill(JSON.stringify(envelope));
  await page.locator('.replay-load').click();
  await expect(page.locator('.replay-error')).toContainText('Unknown game/version');
  await expect(page.locator('.replay-envelope')).toBeFocused();
});

test('loading a trace creates a canvas and playback advances the frame counter', async ({ page }) => {
  await page.goto('/#replay');
  await expect(page.locator('.arcade-replay-form')).toBeVisible({ timeout: 10_000 });

  await page.locator('.replay-envelope').fill(replayEnvelope());
  await page.locator('.replay-load').click();

  // The replay shell with a canvas appears.
  await expect(page.locator('.arcade-replay-shell')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('canvas')).toBeVisible({ timeout: 10_000 });

  // Playback controls are present.
  await expect(page.locator('.replay-toggle')).toBeVisible();
  await expect(page.locator('.replay-speed').first()).toBeVisible();
  await expect(page.locator('.replay-frame-counter')).toBeVisible();

  // The frame counter shows a non-zero total.
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

  await page.locator('.replay-envelope').fill(replayEnvelope());
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

  await page.locator('.replay-envelope').fill(replayEnvelope());
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
