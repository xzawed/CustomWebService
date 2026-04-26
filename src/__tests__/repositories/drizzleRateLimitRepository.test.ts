import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '@/lib/db/schema';
import { DrizzleRateLimitRepository } from '@/repositories/drizzle/DrizzleRateLimitRepository';

function makeMockDb() {
  return {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    execute: vi.fn(),
  } as unknown as NodePgDatabase<typeof schema>;
}

describe('DrizzleRateLimitRepository', () => {
  let mockDb: ReturnType<typeof makeMockDb>;
  let repo: DrizzleRateLimitRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = makeMockDb();
    repo = new DrizzleRateLimitRepository(mockDb);
  });

  // ─── checkAndIncrementDailyLimit ──────────────────────────────────────────
  describe('checkAndIncrementDailyLimit()', () => {
    it('한도 이내면 true를 반환한다', async () => {
      vi.mocked(mockDb.execute).mockResolvedValue({ rows: [{ result: true }] } as never);

      const result = await repo.checkAndIncrementDailyLimit('user-1', 10);
      expect(result).toBe(true);
      expect(mockDb.execute).toHaveBeenCalledTimes(1);
    });

    it('한도 초과면 false를 반환한다', async () => {
      vi.mocked(mockDb.execute).mockResolvedValue({ rows: [{ result: false }] } as never);

      const result = await repo.checkAndIncrementDailyLimit('user-1', 10);
      expect(result).toBe(false);
    });

    it('rows가 비어있으면 false를 반환한다', async () => {
      vi.mocked(mockDb.execute).mockResolvedValue({ rows: [] } as never);

      const result = await repo.checkAndIncrementDailyLimit('user-1', 10);
      expect(result).toBe(false);
    });

    it('DB 에러를 그대로 던진다', async () => {
      vi.mocked(mockDb.execute).mockRejectedValue(new Error('DB 오류'));

      await expect(repo.checkAndIncrementDailyLimit('user-1', 10)).rejects.toThrow('DB 오류');
    });
  });

  // ─── decrementDailyLimit ──────────────────────────────────────────────────
  describe('decrementDailyLimit()', () => {
    it('일일 한도를 감소시킨다', async () => {
      vi.mocked(mockDb.execute).mockResolvedValue({ rows: [] } as never);

      await repo.decrementDailyLimit('user-1');
      expect(mockDb.execute).toHaveBeenCalledTimes(1);
    });

    it('DB 에러를 그대로 던진다', async () => {
      vi.mocked(mockDb.execute).mockRejectedValue(new Error('감소 실패'));

      await expect(repo.decrementDailyLimit('user-1')).rejects.toThrow('감소 실패');
    });
  });

  // ─── getCurrentUsage ──────────────────────────────────────────────────────
  describe('getCurrentUsage()', () => {
    it('현재 사용량을 반환한다', async () => {
      vi.mocked(mockDb.execute).mockResolvedValue({ rows: [{ count: 5 }] } as never);

      const result = await repo.getCurrentUsage('user-1');
      expect(result).toBe(5);
    });

    it('rows가 비어있으면 0을 반환한다', async () => {
      vi.mocked(mockDb.execute).mockResolvedValue({ rows: [] } as never);

      const result = await repo.getCurrentUsage('user-1');
      expect(result).toBe(0);
    });

    it('count가 0이면 0을 반환한다', async () => {
      vi.mocked(mockDb.execute).mockResolvedValue({ rows: [{ count: 0 }] } as never);

      const result = await repo.getCurrentUsage('user-1');
      expect(result).toBe(0);
    });

    it('DB 에러를 그대로 던진다', async () => {
      vi.mocked(mockDb.execute).mockRejectedValue(new Error('조회 실패'));

      await expect(repo.getCurrentUsage('user-1')).rejects.toThrow('조회 실패');
    });
  });

  // ─── checkAndIncrementDailyDeployLimit ────────────────────────────────────
  describe('checkAndIncrementDailyDeployLimit()', () => {
    it('배포 한도 이내면 true를 반환한다', async () => {
      vi.mocked(mockDb.execute).mockResolvedValue({ rows: [{ result: true }] } as never);

      const result = await repo.checkAndIncrementDailyDeployLimit('user-1', 5);
      expect(result).toBe(true);
      expect(mockDb.execute).toHaveBeenCalledTimes(1);
    });

    it('배포 한도 초과면 false를 반환한다', async () => {
      vi.mocked(mockDb.execute).mockResolvedValue({ rows: [{ result: false }] } as never);

      const result = await repo.checkAndIncrementDailyDeployLimit('user-1', 5);
      expect(result).toBe(false);
    });

    it('rows가 비어있으면 false를 반환한다', async () => {
      vi.mocked(mockDb.execute).mockResolvedValue({ rows: [] } as never);

      const result = await repo.checkAndIncrementDailyDeployLimit('user-1', 5);
      expect(result).toBe(false);
    });

    it('DB 에러를 그대로 던진다', async () => {
      vi.mocked(mockDb.execute).mockRejectedValue(new Error('배포 한도 확인 실패'));

      await expect(repo.checkAndIncrementDailyDeployLimit('user-1', 5)).rejects.toThrow(
        '배포 한도 확인 실패'
      );
    });
  });
});
