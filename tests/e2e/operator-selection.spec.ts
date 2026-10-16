import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { runningSceneKey, selectOperator } from './helpers';

test('database selection, traits, randomize and mirror matches work before ticket issuance', async ({ page }, testInfo) => {
  const external: string[] = [];
  let tickets = 0;
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.protocol.startsWith('http') && !['localhost', '127.0.0.1'].includes(url.hostname)) external.push(request.url());
    if (url.pathname === '/api/sessions') tickets += 1;
  });
  await page.goto('/');
  await page.locator('.arcade-game').first().click();
  await expect(page.getByRole('button', { name: 'Fight', exact: true })).toBeDisabled();
  await selectOperator(page, 'player', 42);
  await expect(page.locator('[data-side="player"]')).toContainText('Round Shell');
  await expect(page.locator('[data-side="player"] dt')).toHaveCount(8);
  await page.locator('[data-side="cpu"]').getByRole('button', { name: 'Randomize', exact: true }).click();
  await expect(page.locator('[data-side="cpu"] img')).toBeVisible();
  expect(await page.locator('#operator-cpu').inputValue()).not.toBe('42');
  await selectOperator(page, 'cpu', 42);
  expect(tickets).toBe(0);
  expect(await page.locator('canvas').count()).toBe(0);
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()).violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('operator-selection.png') });
  await page.getByRole('button', { name: 'Fight', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => runningSceneKey(page)).toBe('FightScene');
  expect(tickets).toBe(1);
  const appearances = await page.evaluate(() => {
    const game = (window as unknown as { __game: { registry: { get(key: string): unknown } } }).__game;
    const selection = game.registry.get('operatorSelection') as {
      player: { appearance: { tokenId: number; traits: object } }; cpu: { appearance: { tokenId: number } };
    };
    return { player: selection.player.appearance.tokenId, cpu: selection.cpu.appearance.tokenId,
      frozen: Object.isFrozen(selection) && Object.isFrozen(selection.player.appearance) && Object.isFrozen(selection.player.appearance.traits) };
  });
  expect(appearances).toEqual({ player: 42, cpu: 42, frozen: true });
  await page.screenshot({ path: testInfo.outputPath('operator-fight.png') });
  expect(external).toEqual([]);
});

test('failed catalog or portrait loads offer retry and never allow a guest fight', async ({ page }) => {
  // Transport fault injection is isolated to this page; other workers use the real DB.
  let unavailable = true;
  await page.route('**/api/operators/42', async (route) => {
    if (unavailable) await route.fulfill({ status: 503, json: { error: 'unavailable' } });
    else await route.continue();
  });
  await page.goto('/');
  await page.locator('.arcade-game').first().click();
  const player = page.locator('[data-side="player"]');
  await player.getByLabel('Operator token ID').fill('42');
  await player.getByRole('button', { name: 'Load', exact: true }).click();
  await expect(player.getByRole('alert')).toContainText('catalog unavailable');
  await expect(page.getByRole('button', { name: 'Fight', exact: true })).toBeDisabled();
  unavailable = false;
  await player.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(player.getByRole('img')).toBeVisible();
  let badPortrait = true;
  await page.route('**/api/operators/5555/image.svg?*', async (route) => {
    if (badPortrait) await route.abort();
    else await route.continue();
  });
  const cpu = page.locator('[data-side="cpu"]');
  await cpu.getByLabel('Operator token ID').fill('5555');
  await cpu.getByRole('button', { name: 'Load', exact: true }).click();
  await expect(cpu.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Fight', exact: true })).toBeDisabled();
  badPortrait = false;
  await cpu.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(cpu.getByRole('img')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Fight', exact: true })).toBeEnabled();
  await player.getByLabel('Operator token ID').fill('0');
  await player.getByRole('button', { name: 'Load', exact: true }).click();
  await expect(player.getByRole('alert')).toContainText('1 to 5555');
  await expect(page.getByRole('button', { name: 'Fight', exact: true })).toBeDisabled();
});

test('randomize rechecks the opposite identity after delayed and concurrent loads', async ({ page }) => {
  // Deterministic transport ordering exercises collisions; metadata and SVGs
  // still come from the real seeded database.
  let release!: () => void;
  let held = 0;
  let delayed = new Promise<void>((resolve) => { release = resolve; });
  const exclusions: (string | null)[] = [];
  await page.route('**/api/operators/random*', async (route) => {
    const exclude = new URL(route.request().url()).searchParams.get('exclude');
    exclusions.push(exclude);
    const response = await route.fetch({ url: `http://localhost:5173/api/operators/${exclude === '42' ? 43 : 42}` });
    if (exclude === null) { held += 1; await delayed; }
    await route.fulfill({ response });
  });
  await page.goto('/');
  await page.locator('.arcade-game').first().click();
  const randomize = (side: string) => page.locator(`[data-side="${side}"]`).getByRole('button', { name: 'Randomize', exact: true }).click();
  await randomize('cpu');
  await expect.poll(() => held).toBe(1);
  await selectOperator(page, 'player', 42);
  release();
  await expect(page.locator('#operator-cpu')).toHaveValue('43');
  expect(exclusions).toEqual([null, '42']);

  // With both sides initially empty, simultaneous random results must also
  // settle on distinct IDs even when the first two responses return ID 42.
  await page.locator('.arcade-cancel').click();
  await page.locator('.arcade-game').first().click();
  held = 0;
  exclusions.length = 0;
  delayed = new Promise<void>((resolve) => { release = resolve; });
  await randomize('player');
  await randomize('cpu');
  await expect.poll(() => held).toBe(2);
  release();
  await expect(page.getByRole('button', { name: 'Fight', exact: true })).toBeEnabled();
  expect(await page.locator('#operator-player').inputValue()).not.toBe(await page.locator('#operator-cpu').inputValue());
  expect(exclusions).toEqual([null, null, '42']);
});

test('editing IDs discards delayed responses and cancellation leaves a fresh setup', async ({ page }) => {
  let release!: () => void;
  const delayed = new Promise<void>((resolve) => { release = resolve; });
  let held = false;
  await page.route('**/api/operators/42', async (route) => {
    const response = await route.fetch();
    held = true;
    await delayed;
    await route.fulfill({ response });
  });
  await page.goto('/');
  await page.locator('.arcade-game').first().click();
  const player = page.locator('[data-side="player"]');
  await player.getByLabel('Operator token ID').fill('42');
  await player.getByRole('button', { name: 'Load', exact: true }).click();
  await expect.poll(() => held).toBe(true);
  await selectOperator(page, 'player', 43);
  release();
  await expect(player.getByRole('img', { name: 'Operator #43', exact: true })).toBeVisible();
  await page.locator('.arcade-cancel').click();
  await expect(page.locator('.arcade-select')).toBeVisible();
  await page.locator('.arcade-game').first().click();
  await expect(page.locator('#operator-player')).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Fight', exact: true })).toBeDisabled();
  await expect(page.locator('canvas')).toHaveCount(0);
});

test('cancelling a pending catalog request never launches or acquires a ticket', async ({ page }) => {
  let release!: () => void;
  const delayed = new Promise<void>((resolve) => { release = resolve; });
  let held = false;
  let tickets = 0;
  page.on('request', (request) => { if (request.url().endsWith('/api/sessions')) tickets += 1; });
  await page.route('**/api/operators/42', async (route) => {
    const response = await route.fetch(); held = true; await delayed; await route.fulfill({ response });
  });
  await page.goto('/');
  await page.locator('.arcade-game').first().click();
  await page.locator('#operator-player').fill('42');
  await page.locator('[data-side="player"]').getByRole('button', { name: 'Load', exact: true }).click();
  await expect.poll(() => held).toBe(true);
  await page.locator('.arcade-cancel').click();
  release();
  await expect(page.locator('.arcade-select')).toBeVisible();
  expect(tickets).toBe(0);
  await expect(page.locator('canvas')).toHaveCount(0);
});
