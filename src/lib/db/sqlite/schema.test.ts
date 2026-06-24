import { describe, it, expect, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createSqliteConnection, runSqliteMigrations } from '@/lib/db/sqlite/connection';

describe('schema migration: auth fields', () => {
  let raw: Database.Database;
  afterEach(() => raw.close());

  it('users 테이블에 password_hash 컬럼이 있다', () => {
    const conn = createSqliteConnection(':memory:');
    raw = conn.raw;
    runSqliteMigrations(conn.db);
    const cols = raw.prepare(`PRAGMA table_info(users)`).all() as Array<{ name: string }>;
    expect(cols.map((c) => c.name)).toContain('password_hash');
  });

  it('auth_tokens 테이블이 존재하고 필요한 컬럼을 가진다', () => {
    const conn = createSqliteConnection(':memory:');
    raw = conn.raw;
    runSqliteMigrations(conn.db);
    const cols = raw.prepare(`PRAGMA table_info(auth_tokens)`).all() as Array<{ name: string }>;
    const names = cols.map((c) => c.name);
    expect(names).toEqual(
      expect.arrayContaining(['id', 'user_id', 'token_hash', 'type', 'expires_at', 'consumed_at', 'created_at']),
    );
  });
});
