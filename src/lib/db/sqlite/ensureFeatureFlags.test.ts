/**
 * ensureFeatureFlags — 번들 화이트리스트 동기화.
 *
 * - 없는 플래그만 삽입 (기존 enabled 보존 — 운영자가 내린 킬스위치를 리부트 시 되돌리면 안 됨)
 * - 화이트리스트 밖 죽은 플래그 삭제 (프로덕션 2026-05 7행 정리)
 * - 멱등
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { eq, sql } from 'drizzle-orm';
import { createSqliteConnection, runSqliteMigrations, type SqliteDb } from './connection';
import * as schema from './schema';
import { ensureFeatureFlags, listSeededFlagNames } from './ensureFeatureFlags';
import flagsData from '@/data/featureFlags.json';

const BUNDLE_FLAGS = flagsData as Array<{ flag_name: string; enabled: boolean }>;
const BUNDLE_NAMES = BUNDLE_FLAGS.map((r) => r.flag_name);
const BUNDLE_COUNT = BUNDLE_NAMES.length;

/** 프로덕션에 남아 있던 2026-05 시절 죽은 플래그 이름(화이트리스트 밖). */
const DEAD_FLAG_NAMES = [
  'enable_dark_mode',
  'enable_template_system',
  'enable_api_marketplace',
  'enable_team_collab',
  'enable_analytics_dashboard',
  'enable_custom_domain',
  'enable_export_github',
] as const;

function countFlags(db: SqliteDb): number {
  return db.select({ c: sql<number>`count(*)` }).from(schema.featureFlags).get()?.c ?? 0;
}

function allFlagNames(db: SqliteDb): string[] {
  return db
    .select({ name: schema.featureFlags.flag_name })
    .from(schema.featureFlags)
    .all()
    .map((r) => r.name)
    .sort();
}

function getEnabled(db: SqliteDb, flagName: string): boolean | null {
  const row = db
    .select({ enabled: schema.featureFlags.enabled })
    .from(schema.featureFlags)
    .where(eq(schema.featureFlags.flag_name, flagName))
    .get();
  return row?.enabled ?? null;
}

describe('ensureFeatureFlags', () => {
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

  it('번들 JSON에 있는 누락 플래그를 삽입한다', () => {
    // 빈 테이블 → 번들 전부 삽입
    const result = ensureFeatureFlags(db);
    expect(result.inserted).toBe(BUNDLE_COUNT);
    expect(result.removed).toBe(0);
    expect(countFlags(db)).toBe(BUNDLE_COUNT);
    expect(allFlagNames(db)).toEqual([...BUNDLE_NAMES].sort());
  });

  it('화이트리스트에 없는 flag_name 행을 삭제한다', () => {
    // 죽은 플래그만 있는 프로덕션 상태 재현
    db.insert(schema.featureFlags)
      .values(DEAD_FLAG_NAMES.map((flag_name) => ({ flag_name, enabled: true })))
      .run();
    expect(countFlags(db)).toBe(DEAD_FLAG_NAMES.length);

    const result = ensureFeatureFlags(db);
    expect(result.removed).toBe(DEAD_FLAG_NAMES.length);
    expect(result.inserted).toBe(BUNDLE_COUNT);
    expect(allFlagNames(db)).toEqual([...BUNDLE_NAMES].sort());
    for (const dead of DEAD_FLAG_NAMES) {
      expect(getEnabled(db, dead)).toBeNull();
    }
  });

  it('두 번째 호출은 멱등이다(inserted:0, removed:0, 행 불변)', () => {
    ensureFeatureFlags(db);
    // 운영자가 스위치를 내린 상태 시뮬레이션
    db.update(schema.featureFlags)
      .set({ enabled: false })
      .where(eq(schema.featureFlags.flag_name, 'enable_generation'))
      .run();
    const namesBefore = allFlagNames(db);
    const enabledBefore = getEnabled(db, 'enable_generation');

    const second = ensureFeatureFlags(db);
    expect(second).toEqual({ inserted: 0, removed: 0 });
    expect(allFlagNames(db)).toEqual(namesBefore);
    expect(getEnabled(db, 'enable_generation')).toBe(enabledBefore);
    expect(countFlags(db)).toBe(BUNDLE_COUNT);
  });

  it('이미 존재하는 플래그의 enabled 값을 덮어쓰지 않는다(킬스위치 보존)', () => {
    // 번들 기본값은 true이지만, 운영자가 false로 내린 행이 이미 있을 때
    db.insert(schema.featureFlags)
      .values({
        flag_name: 'enable_generation',
        enabled: false,
        description: 'operator kill switch',
      })
      .run();
    // 화이트리스트 밖 죽은 행도 함께 둠
    db.insert(schema.featureFlags)
      .values({ flag_name: 'enable_template_system', enabled: false })
      .run();

    const result = ensureFeatureFlags(db);

    // enable_signup만 삽입, 죽은 1행 제거, enable_generation은 그대로 false
    expect(result.inserted).toBe(BUNDLE_COUNT - 1);
    expect(result.removed).toBe(1);
    expect(getEnabled(db, 'enable_generation')).toBe(false);
    expect(getEnabled(db, 'enable_signup')).toBe(true);
    expect(getEnabled(db, 'enable_template_system')).toBeNull();
  });

  it('listSeededFlagNames는 번들 화이트리스트와 일치한다', () => {
    expect(listSeededFlagNames().sort()).toEqual([...BUNDLE_NAMES].sort());
  });
});
