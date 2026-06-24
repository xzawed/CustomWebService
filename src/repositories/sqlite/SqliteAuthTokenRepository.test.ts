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

  it('유효한 토큰을 찾는다', async () => {
    await repo.create(userId, 'hash-a', 'email_verify', future);
    const found = await repo.findValidByHash('hash-a', 'email_verify', now);
    expect(found?.userId).toBe(userId);
  });

  it('만료된 토큰은 못 찾는다', async () => {
    await repo.create(userId, 'hash-b', 'email_verify', past);
    expect(await repo.findValidByHash('hash-b', 'email_verify', now)).toBeNull();
  });

  it('소비된 토큰은 못 찾는다', async () => {
    await repo.create(userId, 'hash-c', 'password_reset', future);
    const found = await repo.findValidByHash('hash-c', 'password_reset', now);
    await repo.consume(found!.id, now);
    expect(await repo.findValidByHash('hash-c', 'password_reset', now)).toBeNull();
  });

  it('타입이 다르면 못 찾는다', async () => {
    await repo.create(userId, 'hash-d', 'email_verify', future);
    expect(await repo.findValidByHash('hash-d', 'password_reset', now)).toBeNull();
  });

  it('invalidateByUserAndType은 해당 타입 미소비 토큰을 모두 소비 처리', async () => {
    await repo.create(userId, 'hash-e', 'password_reset', future);
    await repo.create(userId, 'hash-f', 'password_reset', future);
    await repo.invalidateByUserAndType(userId, 'password_reset', now);
    expect(await repo.findValidByHash('hash-e', 'password_reset', now)).toBeNull();
    expect(await repo.findValidByHash('hash-f', 'password_reset', now)).toBeNull();
  });
});
