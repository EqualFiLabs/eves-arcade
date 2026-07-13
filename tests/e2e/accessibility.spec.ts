import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const WCAG_AA_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] as const;

test('selection and replay form have no automated WCAG A/AA violations', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.arcade-select')).toBeVisible();
  expect((await new AxeBuilder({ page }).withTags([...WCAG_AA_TAGS]).analyze()).violations).toEqual([]);

  await page.goto('/#replay');
  await expect(page.locator('.arcade-replay-form')).toBeVisible();
  expect((await new AxeBuilder({ page }).withTags([...WCAG_AA_TAGS]).analyze()).violations).toEqual([]);
});
