import { expect, test } from '@playwright/test';

test('fixture games prove real shell lifecycle and Phaser isolation', async ({ page }) => {
  await page.goto('/?arcadeFixtures=1');
  await expect(page.locator('.arcade-game')).toHaveCount(3);

  await page.getByRole('button', { name: /Button Fixture/ }).click();
  await expect(page.locator('canvas')).toHaveCount(1);
  await page.keyboard.down('Space');
  await expect(page.locator('.arcade-result')).toBeVisible({ timeout: 10_000 });
  await page.keyboard.up('Space');
  await expect(page.locator('.arcade-result-outcome')).toContainText('Button barrage complete');
  await expect(page.locator('.arcade-result-badge')).toContainText('Verified');
  await expect(page.locator('.fixture-owned-overlay')).toHaveCount(0);

  const probeBefore = await page.evaluate(() => (window as unknown as {
    __fixtureProbeCount?: number;
  }).__fixtureProbeCount ?? 0);
  await page.evaluate(() => window.dispatchEvent(new Event('fixture-global-probe')));
  expect(await page.evaluate(() => (window as unknown as {
    __fixtureProbeCount?: number;
  }).__fixtureProbeCount ?? 0)).toBe(probeBefore);

  await page.locator('.arcade-back-to-arcade').click();
  await page.setViewportSize({ width: 540, height: 960 });
  await page.getByRole('button', { name: /Analog Fixture/ }).click();
  await expect(page.locator('canvas')).toHaveCount(1);
  await expect(page.locator('.fixture-owned-overlay')).toHaveCount(1);

  const isolation = await page.evaluate(() => {
    const debug = window as unknown as {
      __game?: {
        textures: { exists(key: string): boolean };
        anims: { exists(key: string): boolean };
        registry: { get(key: string): unknown };
        sound: object;
        scene: { scenes: Array<{ sys: { settings: { key: string } }; physics?: unknown }> };
      };
      __fixturePreviousManagers?: {
        textures: object; animations: object; registry: object; sound: object;
      };
    };
    const game = debug.__game!;
    const previous = debug.__fixturePreviousManagers!;
    return {
      inheritedTexture: game.textures.exists('fixture.button.texture'),
      inheritedAnimation: game.anims.exists('fixture.button.animation'),
      owner: game.registry.get('fixture.owner'),
      sceneKeys: game.scene.scenes.map((scene) => scene.sys.settings.key),
      hasPhysics: Boolean(game.scene.scenes[0]?.physics),
      managersFresh: game.textures !== previous.textures
        && game.anims !== previous.animations
        && game.registry !== previous.registry
        && game.sound !== previous.sound,
    };
  });
  expect(isolation).toEqual({
    inheritedTexture: false,
    inheritedAnimation: false,
    owner: 'Analog Fixture',
    sceneKeys: ['AnalogFixtureScene'],
    hasPhysics: true,
    managersFresh: true,
  });

  const canvas = page.locator('canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('analog canvas has no bounds');
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.2);
  await page.mouse.down();
  await page.waitForTimeout(150);
  await page.mouse.up();
  await page.keyboard.down('Enter');
  await page.waitForTimeout(100);
  await page.keyboard.up('Enter');
  await expect(page.locator('.arcade-result')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.arcade-result-outcome')).toContainText('Analog landing locked');
  await expect(page.locator('.fixture-owned-overlay')).toHaveCount(0);

  await page.locator('.arcade-back-to-arcade').click();
  const callsBefore = await serviceCalls(page);
  await page.getByRole('button', { name: /Unranked Fixture/ }).click();
  await expect(page.locator('canvas')).toHaveCount(1);
  await page.keyboard.down('Space');
  await page.waitForTimeout(100);
  await page.keyboard.up('Space');
  await expect(page.locator('.arcade-result')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.arcade-result-outcome')).toContainText('Sandbox survived');
  await expect(page.locator('.arcade-result-badge')).toContainText('Unranked');
  expect(await serviceCalls(page)).toEqual(callsBefore);
});

test('fixture replay dispatch selects the exact game adapter', async ({ page }) => {
  await page.goto('/?arcadeFixtures=1#replay');
  const bytes = Buffer.from([2, 0, 0, 0, 1, 1]).toString('base64');
  await page.locator('.replay-envelope').fill(JSON.stringify({
    game: { id: 'fixture-button', version: '1.0.0' },
    seed: 17,
    evidence: {
      kind: 'input-trace',
      schema: { id: 'fixture-button.input', version: 1 },
      encodingVersion: 2,
      data: bytes,
    },
  }));
  await page.locator('.replay-load').click();
  await expect(page.locator('.fixture-replay-surface')).toHaveAttribute('data-game', 'fixture-button');
  await expect(page.locator('.replay-frame-counter')).toContainText('Frame 0 / 1');
});

async function serviceCalls(page: import('@playwright/test').Page) {
  return page.evaluate(() => ({ ...(window as unknown as {
    __fixtureServiceCalls: { sessions: number; submissions: number };
  }).__fixtureServiceCalls }));
}
