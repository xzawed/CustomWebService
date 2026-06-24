import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { sql } from 'drizzle-orm';
import { createSqliteConnection, type SqliteDb } from './connection';
import * as schema from './schema';
import { bootstrapSqlite } from './bootstrap';
import catalogData from '@/data/apiCatalog.json';

const CATALOG_TOTAL = (catalogData as unknown[]).length;

/**
 * bootstrapSqlite — 부팅 시 마이그레이션 적용 후 카탈로그·플래그 시드(멱등)를 검증한다.
 * 핵심: 순서 보장 — 시드가 마이그레이션보다 먼저면 테이블이 없어 throw한다.
 */
describe('bootstrapSqlite', () => {
  let db: SqliteDb;
  let raw: Database.Database;

  beforeEach(() => {
    const conn = createSqliteConnection(':memory:');
    db = conn.db;
    raw = conn.raw;
  });

  afterEach(() => {
    raw.close();
  });

  it('빈 DB에서 마이그레이션을 적용한 뒤 카탈로그·플래그를 시드한다', () => {
    bootstrapSqlite(db);

    // 카탈로그(번들 전체)·플래그(7개)도 함께 시드된다
    const catalog = db.select({ c: sql<number>`count(*)` }).from(schema.apiCatalog).get();
    expect(catalog?.c).toBe(CATALOG_TOTAL);
    const flags = db.select({ c: sql<number>`count(*)` }).from(schema.featureFlags).get();
    expect(flags?.c).toBe(7);
  });

  it('두 번 호출해도 마이그레이션·시드가 멱등이다(throw 없음)', () => {
    bootstrapSqlite(db);
    expect(() => bootstrapSqlite(db)).not.toThrow();

    const catalog = db.select({ c: sql<number>`count(*)` }).from(schema.apiCatalog).get();
    expect(catalog?.c).toBe(CATALOG_TOTAL);
  });

  it('users 테이블이 생성됐으므로 조회가 throw하지 않고 빈 결과를 반환한다', () => {
    bootstrapSqlite(db);
    expect(db.select().from(schema.users).all()).toHaveLength(0);
  });
});
