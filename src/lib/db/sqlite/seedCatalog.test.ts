import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { sql, eq } from 'drizzle-orm';
import { createSqliteConnection, runSqliteMigrations, type SqliteDb } from './connection';
import * as schema from './schema';
import { seedCatalog, seedFeatureFlags } from './seedCatalog';
import catalogData from '@/data/apiCatalog.json';
import flagsData from '@/data/featureFlags.json';

const TOTAL = (catalogData as unknown[]).length;
const ACTIVE = (catalogData as Array<{ is_active: boolean }>).filter((x) => x.is_active).length;

/**
 * 번들된 시드 데이터(src/data/*.json, 프로덕션 미러)를 :memory: SQLite에 시드하는지 검증.
 */
describe('seedCatalog / seedFeatureFlags', () => {
  let db: SqliteDb;
  let raw: Database.Database;

  beforeEach(() => {
    const conn = createSqliteConnection(':memory:');
    db = conn.db;
    raw = conn.raw;
    runSqliteMigrations(db);
  });

  afterEach(() => {
    raw.close();
  });

  function count(table: typeof schema.apiCatalog | typeof schema.featureFlags): number {
    return db.select({ c: sql<number>`count(*)` }).from(table).get()?.c ?? 0;
  }

  it('seedCatalog는 번들 전체 행을 시드한다(활성 카운트 일치)', () => {
    const n = seedCatalog(db);
    expect(n).toBe(TOTAL);
    expect(count(schema.apiCatalog)).toBe(TOTAL);

    const active = db
      .select({ c: sql<number>`count(*)` })
      .from(schema.apiCatalog)
      .where(eq(schema.apiCatalog.is_active, true))
      .get();
    expect(active?.c).toBe(ACTIVE);
  });

  it('seedCatalog는 멱등이다(두 번째 호출 0, 행 유지)', () => {
    expect(seedCatalog(db)).toBe(TOTAL);
    expect(seedCatalog(db)).toBe(0);
    expect(count(schema.apiCatalog)).toBe(TOTAL);
  });

  it('json/array/boolean 필드가 올바른 타입으로 역직렬화된다', () => {
    seedCatalog(db);
    const row = db
      .select()
      .from(schema.apiCatalog)
      .where(eq(schema.apiCatalog.auth_type, 'api_key'))
      .limit(1)
      .get();
    expect(row).toBeTruthy();
    expect(typeof row?.auth_config).toBe('object');
    expect(Array.isArray(row?.endpoints)).toBe(true);
    expect(Array.isArray(row?.tags)).toBe(true);
    expect(typeof row?.is_active).toBe('boolean');
  });

  it('seedFeatureFlags는 번들 플래그를 시드하고 멱등이다', () => {
    // 개수를 하드코딩하지 않는다 — 번들 JSON이 진실원이고, 숫자를 박아 두면
    // 플래그가 늘거나 줄 때마다 무관한 테스트가 깨진다(2026-08-04에 실제로 깨졌다).
    const expected = flagsData.length;
    expect(seedFeatureFlags(db)).toBe(expected);
    expect(seedFeatureFlags(db)).toBe(0);
    expect(count(schema.featureFlags)).toBe(expected);

    // 킬스위치는 기본이 "켜짐"이어야 한다 — 배포 직후 기능이 꺼져 있으면 안 된다.
    const generation = db
      .select()
      .from(schema.featureFlags)
      .where(eq(schema.featureFlags.flag_name, 'enable_generation'))
      .get();
    expect(generation?.enabled).toBe(true);
  });
});
