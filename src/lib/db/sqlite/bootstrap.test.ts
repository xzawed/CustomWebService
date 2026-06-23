import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { eq, sql } from 'drizzle-orm';
import { createSqliteConnection, type SqliteDb } from './connection';
import * as schema from './schema';
import { getAdminUserId } from '@/lib/auth/adminCredentials';
import { bootstrapSqlite } from './bootstrap';

/**
 * bootstrapSqlite — 부팅 시 마이그레이션 적용 후 관리자 시드(멱등)를 검증한다.
 * 핵심: 순서 보장 — 시드가 마이그레이션보다 먼저면 users 테이블이 없어 throw한다.
 */
describe('bootstrapSqlite', () => {
  let db: SqliteDb;
  let raw: Database.Database;
  const ORIG = { ...process.env };

  beforeEach(() => {
    const conn = createSqliteConnection(':memory:');
    db = conn.db;
    raw = conn.raw;
    process.env.ADMIN_EMAIL = 'admin@example.com';
    delete process.env.ADMIN_USER_ID;
    delete process.env.ADMIN_NAME;
  });

  afterEach(() => {
    raw.close();
    process.env = { ...ORIG };
  });

  it('빈 DB에서 마이그레이션을 적용한 뒤 관리자·카탈로그·플래그를 시드한다', () => {
    bootstrapSqlite(db);

    const row = db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, getAdminUserId()))
      .get();
    expect(row?.email).toBe('admin@example.com');

    // 카탈로그(프로덕션 미러 49행)·플래그(7개)도 함께 시드된다
    const catalog = db.select({ c: sql<number>`count(*)` }).from(schema.apiCatalog).get();
    expect(catalog?.c).toBe(49);
    const flags = db.select({ c: sql<number>`count(*)` }).from(schema.featureFlags).get();
    expect(flags?.c).toBe(7);
  });

  it('두 번 호출해도 마이그레이션·시드가 멱등이다(throw 없음, 행 1개)', () => {
    bootstrapSqlite(db);
    expect(() => bootstrapSqlite(db)).not.toThrow();

    expect(db.select().from(schema.users).all()).toHaveLength(1);
  });

  it('ADMIN_EMAIL 미설정 시에도 마이그레이션은 적용되고(테이블 존재) 시드만 건너뛴다', () => {
    delete process.env.ADMIN_EMAIL;
    bootstrapSqlite(db);

    // 테이블이 생성됐으므로 조회가 throw하지 않고 빈 결과를 반환한다
    expect(db.select().from(schema.users).all()).toHaveLength(0);
  });
});
