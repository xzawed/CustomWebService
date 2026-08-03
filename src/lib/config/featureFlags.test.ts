/**
 * featureFlags — 킬스위치 읽기/쓰기·캐시·fail-open.
 *
 * 가장 중요한 성질: DB 장애가 제품 중단으로 번지면 안 된다(fail-open → true).
 * 캐시는 TTL 동안 조회를 줄이되, 쓰기 직후·읽기 실패 시에는 오염되지 않아야 한다.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import * as schema from '@/lib/db/sqlite/schema';

const { getSqliteDbMock } = vi.hoisted(() => ({
  getSqliteDbMock: vi.fn(),
}));

vi.mock('@/lib/db/sqlite/connection', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db/sqlite/connection')>();
  return {
    ...actual,
    getSqliteDb: getSqliteDbMock,
  };
});

import {
  createSqliteConnection,
  runSqliteMigrations,
  type SqliteDb,
} from '@/lib/db/sqlite/connection';
import {
  isFeatureEnabled,
  setFeatureFlag,
  listFeatureFlags,
  __resetFeatureFlagCacheForTests,
} from '@/lib/config/featureFlags';

function insertFlag(db: SqliteDb, flagName: string, enabled: boolean): void {
  db.insert(schema.featureFlags)
    .values({ flag_name: flagName, enabled })
    .run();
}

function readEnabled(db: SqliteDb, flagName: string): boolean | null {
  const row = db
    .select({ enabled: schema.featureFlags.enabled })
    .from(schema.featureFlags)
    .where(eq(schema.featureFlags.flag_name, flagName))
    .get();
  return row?.enabled ?? null;
}

describe('featureFlags', () => {
  let db: SqliteDb;
  let raw: Database.Database;

  beforeEach(() => {
    const conn = createSqliteConnection(':memory:');
    db = conn.db;
    raw = conn.raw;
    runSqliteMigrations(db);
    getSqliteDbMock.mockReset();
    getSqliteDbMock.mockImplementation(() => db);
    __resetFeatureFlagCacheForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
    raw.close();
    __resetFeatureFlagCacheForTests();
  });

  describe('isFeatureEnabled — 저장값·fail-open', () => {
    it('행이 있으면 저장된 값(true)을 반환한다', () => {
      insertFlag(db, 'enable_generation', true);
      expect(isFeatureEnabled('enable_generation')).toBe(true);
    });

    it('행이 있으면 저장된 값(false)을 반환한다', () => {
      insertFlag(db, 'enable_generation', false);
      expect(isFeatureEnabled('enable_generation')).toBe(false);
    });

    it('행이 없으면 true(fail-open)를 반환한다', () => {
      expect(isFeatureEnabled('enable_generation')).toBe(true);
      expect(isFeatureEnabled('enable_signup')).toBe(true);
    });

    it('enabled 컬럼이 NULL인 행은 true(enabled)로 취급한다', () => {
      // drizzle boolean 모드는 NULL 삽입을 거부할 수 있어 raw SQL로 NULL을 박는다.
      raw
        .prepare(
          `INSERT INTO feature_flags (id, flag_name, enabled) VALUES (?, ?, NULL)`,
        )
        .run(crypto.randomUUID(), 'enable_generation');

      expect(isFeatureEnabled('enable_generation')).toBe(true);
    });

    it('DB 읽기 실패 시 true를 반환하고 캐시를 오염시키지 않는다', () => {
      insertFlag(db, 'enable_generation', false);

      getSqliteDbMock.mockImplementationOnce(() => {
        throw new Error('sqlite busy');
      });
      expect(isFeatureEnabled('enable_generation')).toBe(true);

      // 다음 성공 읽기는 실제 DB 값(false)이어야 한다 — 실패 시 true를 캐시하면 안 됨
      getSqliteDbMock.mockImplementation(() => db);
      expect(isFeatureEnabled('enable_generation')).toBe(false);
    });
  });

  describe('isFeatureEnabled — 인프로세스 캐시', () => {
    it('TTL 안에서는 두 번째 호출이 DB를 다시 조회하지 않는다', () => {
      insertFlag(db, 'enable_generation', true);

      expect(isFeatureEnabled('enable_generation')).toBe(true);
      const callsAfterFirst = getSqliteDbMock.mock.calls.length;

      expect(isFeatureEnabled('enable_generation')).toBe(true);
      expect(getSqliteDbMock.mock.calls.length).toBe(callsAfterFirst);
    });

    it('캐시 맵에 요청 플래그 항목이 없으면 true(fail-open)를 반환한다', () => {
      // enable_generation만 DB에 있어 캐시 맵에는 그 키만 들어간다.
      // 이후 enable_signup 조회는 캐시 히트 경로에서 values.get(name) ?? true 를 탄다.
      insertFlag(db, 'enable_generation', false);

      expect(isFeatureEnabled('enable_generation')).toBe(false);
      const callsAfterWarm = getSqliteDbMock.mock.calls.length;

      expect(isFeatureEnabled('enable_signup')).toBe(true);
      // 캐시 TTL 안이므로 DB를 다시 치지 않아야 한다
      expect(getSqliteDbMock.mock.calls.length).toBe(callsAfterWarm);
    });

    it('TTL 만료 후에는 다시 DB를 조회한다', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-01T00:00:00.000Z'));

      insertFlag(db, 'enable_generation', true);
      expect(isFeatureEnabled('enable_generation')).toBe(true);
      const callsAfterFirst = getSqliteDbMock.mock.calls.length;

      // CACHE_TTL_MS = 10_000
      vi.advanceTimersByTime(10_000);

      expect(isFeatureEnabled('enable_generation')).toBe(true);
      expect(getSqliteDbMock.mock.calls.length).toBeGreaterThan(callsAfterFirst);
    });
  });

  describe('setFeatureFlag — upsert·캐시 무효화', () => {
    it('기존 행이 있으면 값을 갱신한다', () => {
      insertFlag(db, 'enable_generation', true);
      setFeatureFlag('enable_generation', false);
      expect(readEnabled(db, 'enable_generation')).toBe(false);
    });

    it('행이 없으면 새로 생성한다', () => {
      expect(readEnabled(db, 'enable_signup')).toBeNull();
      setFeatureFlag('enable_signup', false);
      expect(readEnabled(db, 'enable_signup')).toBe(false);
    });

    it('쓰기 직후 캐시를 무효화해 즉시 새 값이 반영된다', () => {
      insertFlag(db, 'enable_generation', true);
      expect(isFeatureEnabled('enable_generation')).toBe(true); // 캐시 채움

      setFeatureFlag('enable_generation', false);
      // TTL 대기 없이 즉시 false
      expect(isFeatureEnabled('enable_generation')).toBe(false);
    });
  });

  describe('listFeatureFlags', () => {
    it('DB에 있는 플래그 목록을 반환한다', () => {
      insertFlag(db, 'enable_generation', false);
      insertFlag(db, 'enable_signup', true);
      const listed = listFeatureFlags();
      expect(listed).toEqual(
        expect.arrayContaining([
          { name: 'enable_generation', enabled: false },
          { name: 'enable_signup', enabled: true },
        ]),
      );
      expect(listed).toHaveLength(2);
    });
  });
});
