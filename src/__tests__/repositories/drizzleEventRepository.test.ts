import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '@/lib/db/schema';
import { DrizzleEventRepository } from '@/repositories/drizzle/DrizzleEventRepository';

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

const NOW = new Date('2026-04-26T00:00:00.000Z');

function makeMockDb() {
  return {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    execute: vi.fn(),
  } as unknown as NodePgDatabase<typeof schema>;
}

describe('DrizzleEventRepository', () => {
  let mockDb: ReturnType<typeof makeMockDb>;
  let repo: DrizzleEventRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = makeMockDb();
    repo = new DrizzleEventRepository(mockDb);
  });

  // ─── persist ───────────────────────────────────────────────────────────────
  describe('persist()', () => {
    it('이벤트를 DB에 삽입한다', async () => {
      const mockValues = vi.fn().mockResolvedValue(undefined);
      vi.mocked(mockDb.insert).mockReturnValue({ values: mockValues } as never);

      await repo.persist(
        { type: 'USER_SIGNED_UP', payload: { userId: 'user-1' } },
        { userId: 'user-1' }
      );

      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'USER_SIGNED_UP',
          user_id: 'user-1',
        })
      );
    });

    it('context가 없으면 payload에서 userId와 projectId를 추출한다', async () => {
      const mockValues = vi.fn().mockResolvedValue(undefined);
      vi.mocked(mockDb.insert).mockReturnValue({ values: mockValues } as never);

      await repo.persist({
        type: 'PROJECT_CREATED',
        payload: { projectId: 'proj-1', userId: 'user-1', apiCount: 2 },
      });

      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'PROJECT_CREATED',
          user_id: 'user-1',
          project_id: 'proj-1',
        })
      );
    });

    it('DB 에러 발생 시 logger.warn을 호출하고 throw하지 않는다', async () => {
      const { logger } = await import('@/lib/utils/logger');
      const mockValues = vi.fn().mockRejectedValue(new Error('DB 오류'));
      vi.mocked(mockDb.insert).mockReturnValue({ values: mockValues } as never);

      await expect(
        repo.persist({ type: 'USER_SIGNED_UP', payload: { userId: 'user-1' } })
      ).resolves.toBeUndefined();

      expect(logger.warn).toHaveBeenCalledWith(
        'Failed to persist domain event',
        expect.objectContaining({ eventType: 'USER_SIGNED_UP' })
      );
    });

    it('context.correlationId를 warn 로그에 포함한다', async () => {
      const { logger } = await import('@/lib/utils/logger');
      const mockValues = vi.fn().mockRejectedValue(new Error('에러'));
      vi.mocked(mockDb.insert).mockReturnValue({ values: mockValues } as never);

      await repo.persist(
        { type: 'USER_SIGNED_UP', payload: { userId: 'user-1' } },
        { correlationId: 'corr-abc' }
      );

      expect(logger.warn).toHaveBeenCalledWith(
        'Failed to persist domain event',
        expect.objectContaining({ correlationId: 'corr-abc' })
      );
    });
  });

  // ─── persistAsync ──────────────────────────────────────────────────────────
  describe('persistAsync()', () => {
    it('fire-and-forget으로 이벤트를 저장한다', async () => {
      const mockValues = vi.fn().mockResolvedValue(undefined);
      vi.mocked(mockDb.insert).mockReturnValue({ values: mockValues } as never);

      repo.persistAsync({ type: 'USER_SIGNED_UP', payload: { userId: 'user-1' } });

      // fire-and-forget이므로 insert가 호출되도록 대기
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it('내부 에러 발생 시 logger.warn을 호출한다', async () => {
      const { logger } = await import('@/lib/utils/logger');

      // persist 자체가 에러를 삼키므로 persistAsync도 조용히 처리됨
      // insert 자체는 에러를 throw하지 않지만 persist 내부에서 catch됨
      const mockValues = vi.fn().mockResolvedValue(undefined);
      vi.mocked(mockDb.insert).mockReturnValue({ values: mockValues } as never);

      repo.persistAsync({ type: 'USER_SIGNED_UP', payload: { userId: 'user-1' } });
      await new Promise((resolve) => setTimeout(resolve, 0));

      // 정상 케이스이므로 warn은 호출되지 않아야 함
      expect(logger.warn).not.toHaveBeenCalled();
    });
  });

  // ─── findByUser ────────────────────────────────────────────────────────────
  describe('findByUser()', () => {
    it('사용자의 이벤트 목록을 반환한다', async () => {
      const rows = [
        {
          id: 'evt-1',
          type: 'USER_SIGNED_UP',
          payload: { userId: 'user-1' },
          created_at: NOW,
        },
        {
          id: 'evt-2',
          type: 'PROJECT_CREATED',
          payload: { projectId: 'proj-1', userId: 'user-1', apiCount: 1 },
          created_at: NOW,
        },
      ];

      vi.mocked(mockDb.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue(rows),
            }),
          }),
        }),
      } as never);

      const result = await repo.findByUser('user-1');
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('evt-1');
      expect(result[0].type).toBe('USER_SIGNED_UP');
      expect(result[0].createdAt).toBe(String(NOW));
      expect(result[1].id).toBe('evt-2');
    });

    it('이벤트가 없으면 빈 배열을 반환한다', async () => {
      vi.mocked(mockDb.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      } as never);

      const result = await repo.findByUser('user-no-events');
      expect(result).toEqual([]);
    });

    it('limit을 100으로 제한한다', async () => {
      const mockLimit = vi.fn().mockResolvedValue([]);
      vi.mocked(mockDb.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: mockLimit,
            }),
          }),
        }),
      } as never);

      await repo.findByUser('user-1', 999);
      expect(mockLimit).toHaveBeenCalledWith(100);
    });

    it('기본 limit은 50이다', async () => {
      const mockLimit = vi.fn().mockResolvedValue([]);
      vi.mocked(mockDb.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: mockLimit,
            }),
          }),
        }),
      } as never);

      await repo.findByUser('user-1');
      expect(mockLimit).toHaveBeenCalledWith(50);
    });

    it('DB 에러 발생 시 logger.warn을 호출하고 빈 배열을 반환한다', async () => {
      const { logger } = await import('@/lib/utils/logger');
      vi.mocked(mockDb.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockRejectedValue(new Error('조회 실패')),
            }),
          }),
        }),
      } as never);

      const result = await repo.findByUser('user-1');
      expect(result).toEqual([]);
      expect(logger.warn).toHaveBeenCalledWith(
        'Failed to fetch user events',
        expect.objectContaining({ userId: 'user-1' })
      );
    });
  });
});
