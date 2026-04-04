import { expect, type Page } from '@playwright/test';

export async function checkNoHorizontalScroll(page: Page): Promise<void> {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
}

export async function checkNoConsoleErrors(page: Page, errors: string[]): Promise<void> {
  expect(errors).toHaveLength(0);
}
