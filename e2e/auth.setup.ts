import { test as setup, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { loadFixtures } from './helpers/loadFixtures';

const storageStatePath = 'e2e/.auth/user.json';

setup('authenticate as e2e owner via real login flow', async ({ page }) => {
  const fixtures = loadFixtures();

  await page.goto('/login');
  await page.locator('#email').fill(fixtures.owner.email);
  await page.locator('#password').fill(fixtures.owner.password);
  await page.locator('button[type="submit"]').click();

  // Successful credentials login assigns /dashboard.
  await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
  await expect(page).toHaveURL(/\/dashboard/);

  mkdirSync(dirname(storageStatePath), { recursive: true });
  await page.context().storageState({ path: storageStatePath });
});
