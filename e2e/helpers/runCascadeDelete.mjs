/**
 * CLI: cascade-delete a user against SQLITE_PATH using the app's cascadeDeleteUser.
 * Usage: node --import tsx e2e/helpers/runCascadeDelete.mjs <userId> <email> [name]
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
process.chdir(root);

const userId = process.argv[2];
const email = process.argv[3] ?? null;
const name = process.argv[4] ?? null;

if (!userId) {
  console.error('usage: runCascadeDelete.mjs <userId> <email> [name]');
  process.exit(2);
}

const sqlitePath = process.env.SQLITE_PATH;
if (!sqlitePath) {
  console.error('SQLITE_PATH is required');
  process.exit(2);
}

const { createSqliteConnection } = await import('../../src/lib/db/sqlite/connection.ts');
const { cascadeDeleteUser } = await import('../../src/lib/auth/deleteAccountCascade.ts');

const { db, raw } = createSqliteConnection(sqlitePath);
try {
  cascadeDeleteUser(db, { userId, email, name });
  console.log(`[e2e] cascadeDeleteUser ok userId=${userId}`);
} finally {
  raw.close();
}
