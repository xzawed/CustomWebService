import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type Database from 'better-sqlite3';
import {
  createSqliteConnection,
  runSqliteMigrations,
  type SqliteDb,
} from '@/lib/db/sqlite/connection';
import { SqliteGenerationLockRepository } from '@/repositories/sqlite/SqliteGenerationLockRepository';

const PROJECT_ID = '22222222-2222-2222-2222-222222222222';
const USER_ID = '11111111-1111-1111-1111-111111111111';
const OTHER_USER = '44444444-4444-4444-4444-444444444444';

// 실제 SQLite 레포를 주입한다 — 락 상태를 mock 호출 횟수가 아니라 DB 사실로 검증하기 위함.
let db: SqliteDb;
let raw: Database.Database;
let repo: SqliteGenerationLockRepository;

vi.mock('@/repositories/factory', () => ({
  createGenerationLockRepository: () => repo,
}));

describe('generationLock', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-29T00:00:00.000Z'));
    const conn = createSqliteConnection(':memory:');
    db = conn.db;
    raw = conn.raw;
    runSqliteMigrations(db);
    repo = new SqliteGenerationLockRepository(db);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    raw.close();
  });

  describe('acquireGenerationLock', () => {
    it('락이 없으면 획득하고 DB에 기록한다', async () => {
      const { acquireGenerationLock } = await import('./generationLock');

      expect(await acquireGenerationLock(PROJECT_ID, USER_ID)).toBe(true);
      expect(await repo.find(PROJECT_ID)).toMatchObject({ userId: USER_ID });
    });

    it('이미 생성 중이면 두 번째 호출은 실패한다', async () => {
      const { acquireGenerationLock } = await import('./generationLock');

      expect(await acquireGenerationLock(PROJECT_ID, USER_ID)).toBe(true);
      expect(await acquireGenerationLock(PROJECT_ID, OTHER_USER)).toBe(false);
    });

    it('설정된 stale 시간이 지나면 탈취할 수 있다', async () => {
      const { acquireGenerationLock } = await import('./generationLock');
      const { GENERATION_LOCK_STALE_MS } = await import('@/lib/config/generation');

      await acquireGenerationLock(PROJECT_ID, USER_ID);
      vi.advanceTimersByTime(GENERATION_LOCK_STALE_MS + 1);

      expect(await acquireGenerationLock(PROJECT_ID, OTHER_USER)).toBe(true);
    });
  });

  describe('releaseGenerationLock', () => {
    it('해제하면 DB에서 사라져 즉시 재획득할 수 있다', async () => {
      const { acquireGenerationLock, releaseGenerationLock } = await import('./generationLock');

      await acquireGenerationLock(PROJECT_ID, USER_ID);
      await releaseGenerationLock(PROJECT_ID);

      expect(await repo.find(PROJECT_ID)).toBeNull();
      expect(await acquireGenerationLock(PROJECT_ID, OTHER_USER)).toBe(true);
    });

    it('레포가 던져도 예외를 밖으로 내보내지 않는다 — finally 경로에서 원래 오류를 덮으면 안 된다', async () => {
      const { releaseGenerationLock } = await import('./generationLock');
      vi.spyOn(repo, 'release').mockRejectedValue(new Error('db down'));

      await expect(releaseGenerationLock(PROJECT_ID)).resolves.toBeUndefined();
    });
  });

  describe('startLockHeartbeat', () => {
    it('heartbeat 간격마다 갱신해 stale 경계를 넘겨도 락이 유지된다', async () => {
      const { acquireGenerationLock, startLockHeartbeat } = await import('./generationLock');
      const { GENERATION_LOCK_STALE_MS, GENERATION_LOCK_HEARTBEAT_MS } = await import(
        '@/lib/config/generation'
      );

      await acquireGenerationLock(PROJECT_ID, USER_ID);
      const stop = startLockHeartbeat(PROJECT_ID);

      // stale 경계를 훌쩍 넘도록 진행하되, 그 사이 heartbeat가 계속 돈다.
      const ticks = Math.ceil((GENERATION_LOCK_STALE_MS * 2) / GENERATION_LOCK_HEARTBEAT_MS);
      for (let i = 0; i < ticks; i++) {
        await vi.advanceTimersByTimeAsync(GENERATION_LOCK_HEARTBEAT_MS);
      }

      expect(await repo.isHeld(PROJECT_ID, GENERATION_LOCK_STALE_MS)).toBe(true);
      stop();
    });

    it('stop() 이후에는 더 이상 갱신하지 않아 락이 stale해진다', async () => {
      const { acquireGenerationLock, startLockHeartbeat } = await import('./generationLock');
      const { GENERATION_LOCK_STALE_MS, GENERATION_LOCK_HEARTBEAT_MS } = await import(
        '@/lib/config/generation'
      );

      await acquireGenerationLock(PROJECT_ID, USER_ID);
      const stop = startLockHeartbeat(PROJECT_ID);
      await vi.advanceTimersByTimeAsync(GENERATION_LOCK_HEARTBEAT_MS);
      stop();

      await vi.advanceTimersByTimeAsync(GENERATION_LOCK_STALE_MS + 1);

      expect(await repo.isHeld(PROJECT_ID, GENERATION_LOCK_STALE_MS)).toBe(false);
    });

    it('락이 이미 사라졌으면 스스로 멈춘다 — 없는 락을 되살리지 않는다', async () => {
      const { acquireGenerationLock, releaseGenerationLock, startLockHeartbeat } = await import(
        './generationLock'
      );
      const { GENERATION_LOCK_HEARTBEAT_MS } = await import('@/lib/config/generation');

      await acquireGenerationLock(PROJECT_ID, USER_ID);
      const stop = startLockHeartbeat(PROJECT_ID);
      await releaseGenerationLock(PROJECT_ID);

      await vi.advanceTimersByTimeAsync(GENERATION_LOCK_HEARTBEAT_MS * 3);

      // heartbeat가 락을 재생성하지 않아야 한다.
      expect(await repo.find(PROJECT_ID)).toBeNull();
      stop();
    });

    it('heartbeat 중 레포가 던져도 unhandled rejection을 만들지 않는다', async () => {
      const { acquireGenerationLock, startLockHeartbeat } = await import('./generationLock');
      const { GENERATION_LOCK_HEARTBEAT_MS } = await import('@/lib/config/generation');

      await acquireGenerationLock(PROJECT_ID, USER_ID);
      vi.spyOn(repo, 'heartbeat').mockRejectedValue(new Error('db down'));

      const stop = startLockHeartbeat(PROJECT_ID);
      await expect(
        vi.advanceTimersByTimeAsync(GENERATION_LOCK_HEARTBEAT_MS * 2),
      ).resolves.not.toThrow();
      stop();
    });

    it('stop()을 두 번 불러도 안전하다', async () => {
      const { acquireGenerationLock, startLockHeartbeat } = await import('./generationLock');

      await acquireGenerationLock(PROJECT_ID, USER_ID);
      const stop = startLockHeartbeat(PROJECT_ID);

      stop();
      expect(() => stop()).not.toThrow();
    });
  });
});
