import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RateLimitService } from '@/services/rateLimitService';
import { RateLimitError } from '@/lib/utils/errors';
import type { IRateLimitRepository } from '@/repositories/interfaces';

vi.mock('@/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

function makeRepo(opts: {
  allowed?: boolean;
  throwOnCheck?: boolean;
  throwOnDecrement?: boolean;
  usage?: number;
  throwOnUsage?: boolean;
}): IRateLimitRepository {
  return {
    checkAndIncrementDailyLimit: opts.throwOnCheck
      ? vi.fn().mockRejectedValue(new Error('DB down'))
      : vi.fn().mockResolvedValue(opts.allowed ?? true),
    decrementDailyLimit: opts.throwOnDecrement
      ? vi.fn().mockRejectedValue(new Error('fail'))
      : vi.fn().mockResolvedValue(undefined),
    getCurrentUsage: opts.throwOnUsage
      ? vi.fn().mockRejectedValue(new Error('error'))
      : vi.fn().mockResolvedValue(opts.usage ?? 0),
  } as unknown as IRateLimitRepository;
}

describe('RateLimitService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('checkAndIncrementDailyLimit', () => {
    it('allowed=true이면 정상 통과한다', async () => {
      const service = new RateLimitService(makeRepo({ allowed: true }));
      await expect(service.checkAndIncrementDailyLimit('user-1')).resolves.toBeUndefined();
    });

    it('allowed=false이면 RateLimitError를 던진다', async () => {
      const service = new RateLimitService(makeRepo({ allowed: false }));
      await expect(service.checkAndIncrementDailyLimit('user-1')).rejects.toBeInstanceOf(
        RateLimitError
      );
    });

    it('DB 오류 발생 시 fail-open — 예외 없이 통과한다', async () => {
      const service = new RateLimitService(makeRepo({ throwOnCheck: true }));
      // Should NOT throw — fail open
      await expect(service.checkAndIncrementDailyLimit('user-1')).resolves.toBeUndefined();
    });

    it('올바른 limit 파라미터로 호출한다', async () => {
      const repo = makeRepo({ allowed: true });
      const service = new RateLimitService(repo);
      await service.checkAndIncrementDailyLimit('user-abc');
      expect(repo.checkAndIncrementDailyLimit).toHaveBeenCalledWith('user-abc', expect.any(Number));
    });

    describe('RATE_LIMIT_BYPASS_USER_IDS', () => {
      afterEach(() => {
        vi.unstubAllEnvs();
      });

      it('우회 목록의 userId는 리밋 검사를 건너뛰고 감사 로그를 남긴다', async () => {
        vi.stubEnv('RATE_LIMIT_BYPASS_USER_IDS', 'admin-1, admin-2');
        const { logger } = await import('@/lib/utils/logger');
        const repo = makeRepo({ allowed: true });
        const service = new RateLimitService(repo);

        await expect(service.checkAndIncrementDailyLimit('admin-2')).resolves.toBeUndefined();

        // 리밋 검사(증가)는 건너뛴다
        expect(repo.checkAndIncrementDailyLimit).not.toHaveBeenCalled();
        // 우회는 무로깅이 아니라 감사 로그를 남겨야 한다
        expect(vi.mocked(logger.info)).toHaveBeenCalledWith(
          'Rate limit bypass applied',
          expect.objectContaining({ userId: 'admin-2' })
        );
      });

      it('우회 목록에 없는 userId는 정상적으로 리밋 검사를 수행한다', async () => {
        vi.stubEnv('RATE_LIMIT_BYPASS_USER_IDS', 'admin-1');
        const repo = makeRepo({ allowed: true });
        const service = new RateLimitService(repo);

        await service.checkAndIncrementDailyLimit('normal-user');
        expect(repo.checkAndIncrementDailyLimit).toHaveBeenCalledWith('normal-user', expect.any(Number));
      });
    });
  });

  describe('decrementDailyLimit', () => {
    it('정상적으로 decrement를 호출한다', async () => {
      const repo = makeRepo({});
      const service = new RateLimitService(repo);
      await expect(service.decrementDailyLimit('user-1')).resolves.toBeUndefined();
      expect(repo.decrementDailyLimit).toHaveBeenCalledWith('user-1');
    });

    it('오류가 발생해도 예외를 던지지 않는다 (best-effort)', async () => {
      const service = new RateLimitService(makeRepo({ throwOnDecrement: true }));
      await expect(service.decrementDailyLimit('user-1')).resolves.toBeUndefined();
    });
  });

  describe('getCurrentUsage', () => {
    it('현재 사용량을 반환한다', async () => {
      const service = new RateLimitService(makeRepo({ usage: 3 }));
      const usage = await service.getCurrentUsage('user-1');
      expect(usage).toBe(3);
    });

    it('usage가 0이면 0을 반환한다', async () => {
      const service = new RateLimitService(makeRepo({ usage: 0 }));
      const usage = await service.getCurrentUsage('user-1');
      expect(usage).toBe(0);
    });

    it('DB 오류 시 0을 반환한다', async () => {
      const service = new RateLimitService(makeRepo({ throwOnUsage: true }));
      const usage = await service.getCurrentUsage('user-1');
      expect(usage).toBe(0);
    });
  });
});
