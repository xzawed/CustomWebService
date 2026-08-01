/**
 * E2E SQLite seed — runs before `pnpm start` (see playwright.config webServer.command).
 *
 * Deletes SQLITE_PATH (+ wal/shm), bootstraps with the app's own bootstrapSqlite
 * (same migrations as prod), inserts fixture rows, closes the connection, writes
 * e2e/fixtures.json for specs.
 *
 * Invoked as: node --import tsx e2e/seed.mjs
 * (tsx so we can import app TS modules + @/ path aliases.)
 */
import { existsSync, unlinkSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

// Ensure path aliases and relative migration folder resolve from repo root.
process.chdir(root);

const sqlitePath = process.env.SQLITE_PATH ?? join(root, '.tmp', 'e2e-app.db');
process.env.SQLITE_PATH = sqlitePath;
// bootstrap path does not require DB_PROVIDER, but keep env consistent for any helpers.
process.env.DB_PROVIDER = process.env.DB_PROVIDER ?? 'sqlite';

const { createSqliteConnection } = await import('../src/lib/db/sqlite/connection.ts');
const { bootstrapSqlite } = await import('../src/lib/db/sqlite/bootstrap.ts');
const { hashPassword } = await import('../src/lib/auth/password.ts');
const schema = await import('../src/lib/db/sqlite/schema.ts');

function removeIfExists(path) {
  if (existsSync(path)) unlinkSync(path);
}

mkdirSync(dirname(sqlitePath), { recursive: true });
removeIfExists(sqlitePath);
removeIfExists(`${sqlitePath}-wal`);
removeIfExists(`${sqlitePath}-shm`);

const MARKER = 'E2E_FIXTURE_OK';
const DRAFT_MARKER = 'E2E_DRAFT_SECRET';
const SLUG = 'e2e-fixture';
const DRAFT_SLUG = 'e2e-draft';
const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'xzawed.xyz';

const ownerUserId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ghostUserId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const publishedProjectId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const draftProjectId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const publishedCodeId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const draftCodeId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

const ownerEmail = 'e2e-owner@example.com';
const ownerPassword = 'E2eOwnerPass!234';
const ghostEmail = 'e2e-ghost@example.com';
const ghostPassword = 'E2eGhostPass!234';

const now = new Date().toISOString();
const ownerHash = hashPassword(ownerPassword);
const ghostHash = hashPassword(ghostPassword);

const { db, raw } = createSqliteConnection(sqlitePath);
try {
  bootstrapSqlite(db);

  db.insert(schema.users)
    .values([
      {
        id: ownerUserId,
        email: ownerEmail,
        name: 'E2E Owner',
        email_verified: now,
        password_hash: ownerHash,
        created_at: now,
        updated_at: now,
      },
      {
        id: ghostUserId,
        email: ghostEmail,
        name: 'E2E Ghost',
        email_verified: now,
        password_hash: ghostHash,
        created_at: now,
        updated_at: now,
      },
    ])
    .run();

  db.insert(schema.projects)
    .values([
      {
        id: publishedProjectId,
        user_id: ownerUserId,
        name: 'E2E Published Fixture',
        context: 'e2e published site',
        status: 'published',
        current_version: 1,
        slug: SLUG,
        published_at: now,
        created_at: now,
        updated_at: now,
      },
      {
        id: draftProjectId,
        user_id: ownerUserId,
        name: 'E2E Draft Fixture',
        context: 'e2e draft site',
        status: 'draft',
        current_version: 1,
        slug: DRAFT_SLUG,
        published_at: null,
        created_at: now,
        updated_at: now,
      },
    ])
    .run();

  const publishedHtml = `<!DOCTYPE html><html><head><title>E2E Fixture</title></head><body><main data-e2e="${MARKER}"><h1>${MARKER}</h1><p>Published fixture body.</p></main></body></html>`;
  const draftHtml = `<!DOCTYPE html><html><body><div>${DRAFT_MARKER}</div></body></html>`;

  db.insert(schema.generatedCodes)
    .values([
      {
        id: publishedCodeId,
        project_id: publishedProjectId,
        version: 1,
        code_html: publishedHtml,
        code_css: '/* e2e */',
        code_js: `console.log('${MARKER}');`,
        framework: 'vanilla',
        ai_provider: 'e2e',
        ai_model: 'fixture',
        created_at: now,
      },
      {
        id: draftCodeId,
        project_id: draftProjectId,
        version: 1,
        code_html: draftHtml,
        code_css: '',
        code_js: '',
        framework: 'vanilla',
        ai_provider: 'e2e',
        ai_model: 'fixture',
        created_at: now,
      },
    ])
    .run();
} finally {
  raw.close();
}

const fixtures = {
  marker: MARKER,
  draftMarker: DRAFT_MARKER,
  slug: SLUG,
  draftSlug: DRAFT_SLUG,
  rootDomain: ROOT_DOMAIN,
  subdomainHost: `${SLUG}.${ROOT_DOMAIN}`,
  owner: {
    userId: ownerUserId,
    email: ownerEmail,
    password: ownerPassword,
  },
  ghost: {
    userId: ghostUserId,
    email: ghostEmail,
    password: ghostPassword,
  },
  publishedProjectId,
  draftProjectId,
  sqlitePath,
  seededAt: now,
  // unused but kept so tests can assert stable ids
  seedId: randomUUID(),
};

const fixturesPath = join(__dirname, 'fixtures.json');
writeFileSync(fixturesPath, `${JSON.stringify(fixtures, null, 2)}\n`, 'utf8');

console.log(`[e2e/seed] seeded ${sqlitePath}`);
console.log(`[e2e/seed] wrote ${fixturesPath}`);
console.log(`[e2e/seed] slug=${SLUG} marker=${MARKER}`);
