import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import {
  createSqliteConnection,
  runSqliteMigrations,
  type SqliteDb,
} from '@/lib/db/sqlite/connection';
import { SqliteGenerationLockRepository } from './SqliteGenerationLockRepository';

const PROJECT_A = '22222222-2222-2222-2222-222222222222';
const PROJECT_B = '33333333-3333-3333-3333-333333333333';
const USER_1 = '11111111-1111-1111-1111-111111111111';
const USER_2 = '44444444-4444-4444-4444-444444444444';

const STALE_MS = 5 * 60 * 1000;

describe('SqliteGenerationLockRepository', () => {
  let db: SqliteDb;
  let raw: Database.Database;
  let clock: number;
  let repo: SqliteGenerationLockRepository;

  beforeEach(() => {
    const conn = createSqliteConnection(':memory:');
    db = conn.db;
    raw = conn.raw;
    runSqliteMigrations(db);
    clock = Date.parse('2026-07-29T00:00:00.000Z');
    // 주입 시계 — stale 판정은 시간 경과가 본질이므로 실시간에 의존하면 검증할 수 없다.
    repo = new SqliteGenerationLockRepository(db, () => clock);
  });

  afterEach(() => {
    raw.close();
  });

  /** 밀리초 경과. */
  function advance(ms: number): void {
    clock += ms;
  }

  describe('acquire', () => {
    it('락이 없으면 획득에 성공한다', async () => {
      expect(await repo.acquire(PROJECT_A, USER_1, STALE_MS)).toBe(true);
    });

    it('유효한 락이 있으면 두 번째 획득은 실패한다 — 동시 요청 중 하나만 성공', async () => {
      expect(await repo.acquire(PROJECT_A, USER_1, STALE_MS)).toBe(true);
      expect(await repo.acquire(PROJECT_A, USER_2, STALE_MS)).toBe(false);
    });

    it('락 보유자 본인의 재획득도 실패한다 — 같은 프로젝트의 중복 파이프라인을 막는 것이 목적', async () => {
      expect(await repo.acquire(PROJECT_A, USER_1, STALE_MS)).toBe(true);
      expect(await repo.acquire(PROJECT_A, USER_1, STALE_MS)).toBe(false);
    });

    it('프로젝트가 다르면 서로 간섭하지 않는다', async () => {
      expect(await repo.acquire(PROJECT_A, USER_1, STALE_MS)).toBe(true);
      expect(await repo.acquire(PROJECT_B, USER_1, STALE_MS)).toBe(true);
    });

    it('heartbeat가 stale 경계를 넘긴 락은 다른 요청이 탈취한다 — 크래시된 파이프라인이 영구 잠금하지 않는다', async () => {
      expect(await repo.acquire(PROJECT_A, USER_1, STALE_MS)).toBe(true);
      advance(STALE_MS + 1);
      expect(await repo.acquire(PROJECT_A, USER_2, STALE_MS)).toBe(true);
    });

    it('stale 경계 직전에는 아직 탈취할 수 없다', async () => {
      expect(await repo.acquire(PROJECT_A, USER_1, STALE_MS)).toBe(true);
      advance(STALE_MS - 1);
      expect(await repo.acquire(PROJECT_A, USER_2, STALE_MS)).toBe(false);
    });

    it('탈취에 성공하면 소유자와 획득 시각이 새 요청으로 교체된다', async () => {
      await repo.acquire(PROJECT_A, USER_1, STALE_MS);
      advance(STALE_MS + 1);
      await repo.acquire(PROJECT_A, USER_2, STALE_MS);

      const lock = await repo.find(PROJECT_A);
      expect(lock?.userId).toBe(USER_2);
      expect(lock?.acquiredAt).toBe(new Date(clock).toISOString());
    });
  });

  describe('heartbeat', () => {
    it('heartbeat를 계속 보내면 stale 경계를 넘겨도 탈취되지 않는다', async () => {
      await repo.acquire(PROJECT_A, USER_1, STALE_MS);

      // 원래라면 만료됐을 시간까지 진행하되, 중간에 살아있음을 알린다.
      advance(STALE_MS - 1);
      expect(await repo.heartbeat(PROJECT_A)).toBe(true);
      advance(STALE_MS - 1);

      expect(await repo.acquire(PROJECT_A, USER_2, STALE_MS)).toBe(false);
    });

    it('락이 없으면 false를 반환한다 — 유실을 조용히 성공으로 위장하지 않는다', async () => {
      expect(await repo.heartbeat(PROJECT_A)).toBe(false);
    });

    it('acquired_at은 갱신하지 않는다 — 총 점유 시간을 관측할 수 있어야 한다', async () => {
      await repo.acquire(PROJECT_A, USER_1, STALE_MS);
      const acquiredAt = (await repo.find(PROJECT_A))?.acquiredAt;

      advance(1000);
      await repo.heartbeat(PROJECT_A);

      const lock = await repo.find(PROJECT_A);
      expect(lock?.acquiredAt).toBe(acquiredAt);
      expect(lock?.heartbeatAt).toBe(new Date(clock).toISOString());
    });
  });

  describe('release', () => {
    it('해제 후에는 즉시 재획득할 수 있다', async () => {
      await repo.acquire(PROJECT_A, USER_1, STALE_MS);
      await repo.release(PROJECT_A);

      expect(await repo.acquire(PROJECT_A, USER_2, STALE_MS)).toBe(true);
    });

    it('없는 락을 해제해도 오류가 나지 않는다 — finally 경로에서 안전해야 한다', async () => {
      await expect(repo.release(PROJECT_A)).resolves.toBeUndefined();
    });

    it('다른 프로젝트의 락은 건드리지 않는다', async () => {
      await repo.acquire(PROJECT_A, USER_1, STALE_MS);
      await repo.acquire(PROJECT_B, USER_1, STALE_MS);

      await repo.release(PROJECT_A);

      expect(await repo.isHeld(PROJECT_B, STALE_MS)).toBe(true);
    });
  });

  describe('isHeld', () => {
    it('유효한 락이 있으면 true', async () => {
      await repo.acquire(PROJECT_A, USER_1, STALE_MS);
      expect(await repo.isHeld(PROJECT_A, STALE_MS)).toBe(true);
    });

    it('락이 없으면 false', async () => {
      expect(await repo.isHeld(PROJECT_A, STALE_MS)).toBe(false);
    });

    it('stale 락은 보유로 보지 않는다', async () => {
      await repo.acquire(PROJECT_A, USER_1, STALE_MS);
      advance(STALE_MS + 1);
      expect(await repo.isHeld(PROJECT_A, STALE_MS)).toBe(false);
    });
  });

  describe('내구성', () => {
    it('프로세스 재시작(레포 인스턴스 교체)을 넘어 락 상태가 유지된다', async () => {
      await repo.acquire(PROJECT_A, USER_1, STALE_MS);

      // 같은 DB 파일을 보는 새 인스턴스 — 인메모리 tracker와 달리 상태가 남아야 한다.
      const afterRestart = new SqliteGenerationLockRepository(db, () => clock);

      expect(await afterRestart.isHeld(PROJECT_A, STALE_MS)).toBe(true);
      expect(await afterRestart.acquire(PROJECT_A, USER_2, STALE_MS)).toBe(false);
    });

    it('재시작 후 stale해진 락은 정상적으로 탈취된다 — 크래시로 잃은 락이 영구화되지 않는다', async () => {
      await repo.acquire(PROJECT_A, USER_1, STALE_MS);
      advance(STALE_MS + 1);

      const afterRestart = new SqliteGenerationLockRepository(db, () => clock);

      expect(await afterRestart.acquire(PROJECT_A, USER_2, STALE_MS)).toBe(true);
    });
  });

  describe('find', () => {
    it('락이 없으면 null', async () => {
      expect(await repo.find(PROJECT_A)).toBeNull();
    });

    it('stale 락도 반환한다 — 진단용이므로 유효성으로 거르지 않는다', async () => {
      await repo.acquire(PROJECT_A, USER_1, STALE_MS);
      advance(STALE_MS + 1);

      expect(await repo.find(PROJECT_A)).not.toBeNull();
    });
  });
});
