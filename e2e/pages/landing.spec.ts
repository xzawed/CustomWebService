import { test, expect } from '@playwright/test';
import { checkNoHorizontalScroll } from '../helpers/responsive';

test.describe('랜딩 페이지', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('페이지가 정상 로드된다', async ({ page }) => {
    await expect(page).toHaveTitle(/CustomWebService/);
  });

  test('헤더가 표시된다', async ({ page }) => {
    const header = page.locator('header').first();
    await expect(header).toBeVisible();
  });

  test('CTA 버튼이 존재한다', async ({ page }) => {
    const cta = page.locator('a:has-text("무료로 시작하기")');
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute('href', '/login');
  });

  test('푸터가 표시된다', async ({ page }) => {
    const footer = page.locator('footer');
    await expect(footer).toBeVisible();
  });

  test('가로 스크롤이 발생하지 않는다', async ({ page }) => {
    await checkNoHorizontalScroll(page);
  });

  test('콘솔 에러가 없다', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', err => errors.push(err.message));
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    expect(errors).toHaveLength(0);
  });
});
