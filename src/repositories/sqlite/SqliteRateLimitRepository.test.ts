import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import { createSqliteConnection, runSqliteMigrations, type SqliteDb } from '@/lib/db/sqlite/connection';
import * as schema from '@/lib/db/sqlite/schema';
import { SqliteRateLimitRepository } from './SqliteRateLimitRepository';

/** PG CURRENT_DATE에 대응하는 로컬 오늘 날짜 YYYY-MM-DD (레포 구현과 동일 규칙). */
function today(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

describe('SqliteRateLimitRepository', () => {
  let db: SqliteDb;
  let raw: Database.Database;
  let repo: SqliteRateLimitRepository;
  const USER_ID = '11111111-1111-1111-1111-111111111111';

  beforeEach(() => {
    const conn = createSqliteConnection(':memory:');
    db = conn.db;
    raw = conn.raw;
    runSqliteMigrations(db);
    // FK 선행 행: users 1행
    db.insert(schema.users).values({ id: USER_ID, email: 'user@example.com' }).run();
    repo = new SqliteRateLimitRepository(db);
  });

  afterEach(() => {
    raw.close();
  });

  /** user_daily_limits 오늘 행을 직접 조회 (검증 헬퍼). */
  function readRow(): { generation_count: number | null; deploy_count: number | null } | undefined {
    return raw
      .prepare(
        'SELECT generation_count, deploy_count FROM user_daily_limits WHERE user_id = ? AND usage_date = ?',
      )
      .get(USER_ID, today()) as
      | { generation_count: number | null; deploy_count: number | null }
      | undefined;
  }

  describe('checkAndIncrementDailyLimit', () => {
    it('첫 호출 시 행을 생성하고 카운트를 1로 올리며 true를 반환한다', async () => {
      const ok = await repo.checkAndIncrementDailyLimit(USER_ID, 5);
      expect(ok).toBe(true);
      expect(readRow()?.generation_count).toBe(1);
    });

    it('한도 미만이면 호출마다 증가하고 true를 반환한다', async () => {
      expect(await repo.checkAndIncrementDailyLimit(USER_ID, 3)).toBe(true);
      expect(await repo.checkAndIncrementDailyLimit(USER_ID, 3)).toBe(true);
      expect(await repo.checkAndIncrementDailyLimit(USER_ID, 3)).toBe(true);
      expect(readRow()?.generation_count).toBe(3);
    });

    it('한도 도달 시 더 이상 증가하지 않고 false를 반환한다', async () => {
      await repo.checkAndIncrementDailyLimit(USER_ID, 2);
      await repo.checkAndIncrementDailyLimit(USER_ID, 2);
      const blocked = await repo.checkAndIncrementDailyLimit(USER_ID, 2);
      expect(blocked).toBe(false);
      // 카운트는 한도(2)에서 멈춘다 — 증가하지 않음
      expect(readRow()?.generation_count).toBe(2);
    });

    it('한도가 0이면 즉시 false를 반환하고 증가하지 않는다', async () => {
      const ok = await repo.checkAndIncrementDailyLimit(USER_ID, 0);
      expect(ok).toBe(false);
      // 행은 생성되되 카운트는 0
      expect(readRow()?.generation_count).toBe(0);
    });

    it('deploy_count에는 영향을 주지 않는다', async () => {
      await repo.checkAndIncrementDailyLimit(USER_ID, 5);
      expect(readRow()?.deploy_count).toBe(0);
    });
  });

  describe('decrementDailyLimit', () => {
    it('카운트를 1 감소시킨다', async () => {
      await repo.checkAndIncrementDailyLimit(USER_ID, 5);
      await repo.checkAndIncrementDailyLimit(USER_ID, 5);
      await repo.decrementDailyLimit(USER_ID);
      expect(readRow()?.generation_count).toBe(1);
    });

    it('0 미만으로 내려가지 않는다 (GREATEST(0, ...))', async () => {
      await repo.checkAndIncrementDailyLimit(USER_ID, 5); // count=1
      await repo.decrementDailyLimit(USER_ID); // count=0
      await repo.decrementDailyLimit(USER_ID); // count=0 (floor)
      expect(readRow()?.generation_count).toBe(0);
    });

    it('오늘 행이 없으면 아무 일도 일어나지 않는다 (no-op)', async () => {
      await repo.decrementDailyLimit(USER_ID);
      expect(readRow()).toBeUndefined();
    });
  });

  describe('getCurrentUsage', () => {
    it('행이 없으면 0을 반환한다', async () => {
      expect(await repo.getCurrentUsage(USER_ID)).toBe(0);
    });

    it('현재 generation_count를 반환한다', async () => {
      await repo.checkAndIncrementDailyLimit(USER_ID, 5);
      await repo.checkAndIncrementDailyLimit(USER_ID, 5);
      expect(await repo.getCurrentUsage(USER_ID)).toBe(2);
    });

    it('다른 사용자의 카운트와 격리된다', async () => {
      const other = '22222222-2222-2222-2222-222222222222';
      db.insert(schema.users).values({ id: other, email: 'other@example.com' }).run();
      await repo.checkAndIncrementDailyLimit(USER_ID, 5);
      expect(await repo.getCurrentUsage(other)).toBe(0);
      expect(await repo.getCurrentUsage(USER_ID)).toBe(1);
    });
  });

  describe('checkAndIncrementDailyDeployLimit', () => {
    it('첫 호출 시 deploy_count를 1로 올리며 true를 반환한다', async () => {
      const ok = await repo.checkAndIncrementDailyDeployLimit(USER_ID, 5);
      expect(ok).toBe(true);
      expect(readRow()?.deploy_count).toBe(1);
    });

    it('한도 도달 시 false를 반환하고 증가하지 않는다', async () => {
      await repo.checkAndIncrementDailyDeployLimit(USER_ID, 1);
      const blocked = await repo.checkAndIncrementDailyDeployLimit(USER_ID, 1);
      expect(blocked).toBe(false);
      expect(readRow()?.deploy_count).toBe(1);
    });

    it('generation_count에는 영향을 주지 않는다', async () => {
      await repo.checkAndIncrementDailyDeployLimit(USER_ID, 5);
      expect(readRow()?.generation_count).toBe(0);
    });

    it('generation과 deploy 카운터는 같은 행에서 독립적으로 증가한다', async () => {
      await repo.checkAndIncrementDailyLimit(USER_ID, 5);
      await repo.checkAndIncrementDailyDeployLimit(USER_ID, 5);
      await repo.checkAndIncrementDailyDeployLimit(USER_ID, 5);
      const row = readRow();
      expect(row?.generation_count).toBe(1);
      expect(row?.deploy_count).toBe(2);
    });
  });

  describe('decrementDailyDeployLimit', () => {
    it('deploy_count를 1 감소시킨다', async () => {
      await repo.checkAndIncrementDailyDeployLimit(USER_ID, 5);
      await repo.checkAndIncrementDailyDeployLimit(USER_ID, 5);
      await repo.decrementDailyDeployLimit(USER_ID);
      expect(readRow()?.deploy_count).toBe(1);
    });

    it('0 미만으로 내려가지 않는다', async () => {
      await repo.checkAndIncrementDailyDeployLimit(USER_ID, 5); // 1
      await repo.decrementDailyDeployLimit(USER_ID); // 0
      await repo.decrementDailyDeployLimit(USER_ID); // 0 (floor)
      expect(readRow()?.deploy_count).toBe(0);
    });

    it('오늘 행이 없으면 no-op', async () => {
      await repo.decrementDailyDeployLimit(USER_ID);
      expect(readRow()).toBeUndefined();
    });
  });

  describe('원자성/시퀀스', () => {
    it('한도를 정확히 한도 횟수만큼만 허용한다 (test-and-set)', async () => {
      const limit = 4;
      let allowed = 0;
      for (let i = 0; i < 10; i += 1) {
         
        if (await repo.checkAndIncrementDailyLimit(USER_ID, limit)) allowed += 1;
      }
      expect(allowed).toBe(limit);
      expect(readRow()?.generation_count).toBe(limit);
    });
  });
});
