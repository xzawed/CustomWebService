import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { createSqliteConnection, runSqliteMigrations, type SqliteDb } from './connection';
import * as schema from './schema';
import { seedAdminUser } from './seedAdmin';

const ADMIN_ID = '00000000-0000-0000-0000-000000000001';

/**
 * seedAdminUser 단위 테스트 — :memory: DB로 격리.
 * 단일 관리자(AUTH_PROVIDER=local) 부팅 시드의 멱등성·env 게이팅을 검증한다.
 */
describe('seedAdminUser', () => {
  let db: SqliteDb;
  let raw: Database.Database;
  const ORIG = { ...process.env };

  beforeEach(() => {
    const conn = createSqliteConnection(':memory:');
    db = conn.db;
    raw = conn.raw;
    runSqliteMigrations(db);
    process.env.ADMIN_EMAIL = 'admin@example.com';
    process.env.ADMIN_USER_ID = ADMIN_ID;
    delete process.env.ADMIN_NAME;
  });

  afterEach(() => {
    raw.close();
    process.env = { ...ORIG };
  });

  it('ADMIN_EMAIL이 설정되면 관리자 행을 시드하고 true를 반환한다', () => {
    const seeded = seedAdminUser(db);
    expect(seeded).toBe(true);

    const row = db.select().from(schema.users).where(eq(schema.users.id, ADMIN_ID)).get();
    expect(row?.email).toBe('admin@example.com');
    expect(row?.name).toBe('Admin'); // ADMIN_NAME 미설정 시 기본값
  });

  it('ADMIN_NAME을 반영한다', () => {
    process.env.ADMIN_NAME = '운영자';
    seedAdminUser(db);

    const row = db.select().from(schema.users).where(eq(schema.users.id, ADMIN_ID)).get();
    expect(row?.name).toBe('운영자');
  });

  it('멱등 — 두 번 호출해도 행은 하나이고 두 번째 호출은 false', () => {
    expect(seedAdminUser(db)).toBe(true);
    expect(seedAdminUser(db)).toBe(false);

    expect(db.select().from(schema.users).all()).toHaveLength(1);
  });

  it('ADMIN_EMAIL 미설정 시 no-op(false)이고 행을 만들지 않는다', () => {
    delete process.env.ADMIN_EMAIL;
    expect(seedAdminUser(db)).toBe(false);
    expect(db.select().from(schema.users).all()).toHaveLength(0);
  });

  it('이미 같은 id의 행이 있으면(이메일이 달라도) 덮어쓰지 않는다', () => {
    raw
      .prepare('INSERT INTO users (id, email, created_at, updated_at) VALUES (?, ?, ?, ?)')
      .run(ADMIN_ID, 'existing@example.com', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');

    expect(seedAdminUser(db)).toBe(false);

    const row = db.select().from(schema.users).where(eq(schema.users.id, ADMIN_ID)).get();
    expect(row?.email).toBe('existing@example.com');
  });
});
