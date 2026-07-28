import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createSqliteConnection, runSqliteMigrations, type SqliteDb } from '@/lib/db/sqlite/connection';
import { SqliteUserRepository } from './SqliteUserRepository';
import { SqliteAuthTokenRepository } from './SqliteAuthTokenRepository';

describe('SqliteAuthTokenRepository', () => {
  let db: SqliteDb;
  let raw: Database.Database;
  let repo: SqliteAuthTokenRepository;
  let userId: string;

  beforeEach(async () => {
    const conn = createSqliteConnection(':memory:');
    db = conn.db;
    raw = conn.raw;
    runSqliteMigrations(db);
    repo = new SqliteAuthTokenRepository(db);
    const user = await new SqliteUserRepository(db).create({
      email: 'u@example.com', name: null, avatarUrl: null,
      preferences: {}, passwordHash: 'salt:hash', emailVerified: null,
    });
    userId = user.id;
  });
  afterEach(() => raw.close());

  const future = new Date(Date.now() + 3600_000).toISOString();
  const past = new Date(Date.now() - 1000).toISOString();
  const now = new Date().toISOString();

  it('유효한 토큰을 소비하면 userId를 반환한다', async () => {
    await repo.create(userId, 'hash-a', 'email_verify', future);
    expect(await repo.consumeValid('hash-a', 'email_verify', now)).toBe(userId);
  });

  it('만료된 토큰은 소비되지 않는다', async () => {
    await repo.create(userId, 'hash-b', 'email_verify', past);
    expect(await repo.consumeValid('hash-b', 'email_verify', now)).toBeNull();
  });

  // 원자성의 실체는 UPDATE ... WHERE consumed_at IS NULL 한 문장이다.
  // 인메모리 fake가 아니라 실 SQLite에 대해 이중 소비가 막히는지 확인한다.
  it('같은 토큰을 두 번 소비하면 두 번째는 null (실 SQLite 원자성)', async () => {
    await repo.create(userId, 'hash-c', 'password_reset', future);
    expect(await repo.consumeValid('hash-c', 'password_reset', now)).toBe(userId);
    expect(await repo.consumeValid('hash-c', 'password_reset', now)).toBeNull();
  });

  it('타입이 다르면 소비되지 않는다', async () => {
    await repo.create(userId, 'hash-d', 'email_verify', future);
    expect(await repo.consumeValid('hash-d', 'password_reset', now)).toBeNull();
  });

  it('invalidateByUserAndType 이후에는 소비되지 않는다', async () => {
    await repo.create(userId, 'hash-e', 'password_reset', future);
    await repo.create(userId, 'hash-f', 'password_reset', future);
    await repo.invalidateByUserAndType(userId, 'password_reset', now);
    expect(await repo.consumeValid('hash-e', 'password_reset', now)).toBeNull();
    expect(await repo.consumeValid('hash-f', 'password_reset', now)).toBeNull();
  });
});
