import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

const e2eSqlitePath =
  process.env.SQLITE_PATH ?? path.join(process.cwd(), '.tmp', 'e2e-app.db');
const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'xzawed.xyz';

/** Env shared by webServer (seed + start) and tests. */
const e2eEnv: Record<string, string> = {
  ...process.env,
  DB_PROVIDER: 'sqlite',
  SQLITE_PATH: e2eSqlitePath,
  SQLITE_BACKUP_ENABLED: 'false',
  AUTH_SECRET: process.env.AUTH_SECRET ?? 'e2e-ci-secret-not-for-production',
  AUTH_TRUST_HOST: 'true',
  // http:// so Auth.js does not force Secure cookies against plain localhost.
  AUTH_URL: process.env.AUTH_URL ?? 'http://127.0.0.1:3000',
  NEXT_PUBLIC_ROOT_DOMAIN: rootDomain,
  NEXT_PUBLIC_AUTH_PROVIDER: process.env.NEXT_PUBLIC_AUTH_PROVIDER ?? 'local',
};

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }]]
    : 'list',
  use: {
    // 127.0.0.1 matches AUTH_URL / Host helper (avoid localhost subdomain quirks).
    baseURL: 'http://127.0.0.1:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },
    {
      // Request-level serving contracts — run once (not × device matrix).
      name: 'serving',
      testMatch: /serving\/.*\.spec\.ts/,
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/user.json',
      },
    },
    {
      name: 'mobile',
      testMatch: /pages\/.*\.spec\.ts|health\.spec\.ts/,
      use: { ...devices['iPhone 14'] },
    },
    {
      name: 'tablet',
      testMatch: /pages\/.*\.spec\.ts|health\.spec\.ts/,
      use: { ...devices['iPad Mini'] },
    },
    {
      name: 'desktop',
      testMatch: /pages\/.*\.spec\.ts|health\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    // Seed before start so fixtures exist regardless of Playwright hook semantics.
    command: 'node --import tsx e2e/seed.mjs && pnpm start',
    url: 'http://127.0.0.1:3000/api/v1/health',
    reuseExistingServer: !process.env.CI,
    env: e2eEnv,
    timeout: 120_000,
  },
});
