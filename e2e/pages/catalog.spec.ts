import { test, expect } from '@playwright/test';
import { checkNoHorizontalScroll } from '../helpers/responsive';

test.describe('API 카탈로그', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/catalog');
  });

  test('페이지가 정상 로드된다', async ({ page }) => {
    await expect(page.locator('h1, h2').first()).toBeVisible();
  });

  test('API 카드가 렌더링된다', async ({ page }) => {
    // Wait for cards to appear (they may load asynchronously)
    const cards = page.locator('[class*="card"]');
    await expect(cards.first()).toBeVisible({ timeout: 10000 });
  });

  test('가로 스크롤이 발생하지 않는다', async ({ page }) => {
    await checkNoHorizontalScroll(page);
  });
});
