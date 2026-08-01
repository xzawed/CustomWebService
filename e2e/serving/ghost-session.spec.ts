/**
 * D. Ghost session — getAuthUser DB row check.
 *
 * Log in as ghost user → cascadeDeleteUser (prod semantics) → same cookie on
 * GET /api/v1/projects must be 401 (not 200 + []).
 *
 * Do NOT assert middleware page gates — middleware is JWT-only by design.
 */
import { test, expect } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { loadFixtures } from '../helpers/loadFixtures';

test.describe('D. ghost session', () => {
  // Independent of owner storageState — uses ghost fixture credentials.
  test.use({ storageState: { cookies: [], origins: [] } });

  test('deleted user with live JWT gets 401 on GET /api/v1/projects', async ({ page }) => {
    const fixtures = loadFixtures();

    await page.goto('/login');
    await page.locator('#email').fill(fixtures.ghost.email);
    await page.locator('#password').fill(fixtures.ghost.password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/dashboard/, { timeout: 30_000 });

    // Sanity: session is valid before delete.
    const before = await page.request.get('/api/v1/projects');
    expect(before.status()).toBe(200);

    // Production cascade delete via a second SQLite connection (FK-safe).
    // Hand-rolled DELETE FROM users would hit FK constraints.
    // Run out-of-process so app TS + @/ aliases resolve via tsx (same as seed).
    const sqlitePath = process.env.SQLITE_PATH ?? fixtures.sqlitePath;
    const del = spawnSync(
      process.execPath,
      [
        '--import',
        'tsx',
        'e2e/helpers/runCascadeDelete.mjs',
        fixtures.ghost.userId,
        fixtures.ghost.email,
        'E2E Ghost',
      ],
      {
        encoding: 'utf8',
        env: { ...process.env, SQLITE_PATH: sqlitePath, DB_PROVIDER: 'sqlite' },
      },
    );
    expect(del.status, `cascade delete failed: ${del.stderr || del.stdout}`).toBe(0);

    // Same browser cookie jar — JWT still present, users row gone.
    const after = await page.request.get('/api/v1/projects');
    expect(
      after.status(),
      'ghost session must be 401; 200+[] means getAuthUser DB check was removed',
    ).toBe(401);

    const body = await after.json();
    expect(body).toMatchObject({
      success: false,
      error: { code: 'AUTH_REQUIRED' },
    });
    // Explicit contrast: must not look like an empty project list success.
    expect(body).not.toMatchObject({ success: true, data: [] });
  });
});
