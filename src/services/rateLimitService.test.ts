import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/config/features', () => ({
  getLimits: vi.fn(() => ({ maxDailyGenerations: 10 })),
}));
vi.mock('@/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/lib/events/eventBus', () => ({
  eventBus: { emit: vi.fn() },
}));

import { RateLimitService } from './rateLimitService';
import { RateLimitError } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';
import { eventBus } from '@/lib/events/eventBus';
import type { IRateLimitRepository } from '@/repositories/interfaces';

const flush = () => new Promise<void>((r) => setTimeout(r, 0));

type MockRepo = IRateLimitRepository & {
  checkAndIncrementDailyLimit: ReturnType<typeof vi.fn>;
  decrementDailyLimit: ReturnType<typeof vi.fn>;
  getCurrentUsage: ReturnType<typeof vi.fn>;
};

function makeRepo(): MockRepo {
  return {
    checkAndIncrementDailyLimit: vi.fn(),
    decrementDailyLimit: vi.fn(),
    getCurrentUsage: vi.fn(),
  } as unknown as MockRepo;
}

const ORIGINAL_BYPASS = process.env.RATE_LIMIT_BYPASS_USER_IDS;

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.RATE_LIMIT_BYPASS_USER_IDS;
});

afterEach(() => {
  if (ORIGINAL_BYPASS === undefined) delete process.env.RATE_LIMIT_BYPASS_USER_IDS;
  else process.env.RATE_LIMIT_BYPASS_USER_IDS = ORIGINAL_BYPASS;
});

describe('RateLimitService.checkAndIncrementDailyLimit()', () => {
  it('우회 목록에 포함된 userId는 한도 검사를 건너뛰고 감사 로그를 남긴다', async () => {
    process.env.RATE_LIMIT_BYPASS_USER_IDS = 'admin-1, dev-2';
    const repo = makeRepo();
    const service = new RateLimitService(repo);

    await service.checkAndIncrementDailyLimit('admin-1');

    expect(repo.checkAndIncrementDailyLimit).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      'Rate limit bypass applied',
      expect.objectContaining({ userId: 'admin-1' })
    );
  });

  it('우회 목록에 없는 userId는 정상적으로 카운터를 검사·증가시킨다', async () => {
    const repo = makeRepo();
    repo.checkAndIncrementDailyLimit.mockResolvedValue(true);
    repo.getCurrentUsage.mockResolvedValue(3);
    const service = new RateLimitService(repo);

    await service.checkAndIncrementDailyLimit('user-1');

    expect(repo.checkAndIncrementDailyLimit).toHaveBeenCalledWith('user-1', 10);
  });

  it('사용량이 80% 미만이면 경고 이벤트를 발행하지 않는다', async () => {
    const repo = makeRepo();
    repo.checkAndIncrementDailyLimit.mockResolvedValue(true);
    repo.getCurrentUsage.mockResolvedValue(5); // 50%
    const service = new RateLimitService(repo);

    await service.checkAndIncrementDailyLimit('user-1');
    await flush();

    expect(eventBus.emit).not.toHaveBeenCalled();
  });

  it('사용량이 80% 이상이면 API_QUOTA_WARNING 이벤트를 발행한다', async () => {
    const repo = makeRepo();
    repo.checkAndIncrementDailyLimit.mockResolvedValue(true);
    repo.getCurrentUsage.mockResolvedValue(9); // 90%
    const service = new RateLimitService(repo);

    await service.checkAndIncrementDailyLimit('user-1');
    await flush();

    expect(eventBus.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'API_QUOTA_WARNING',
        payload: { service: 'daily_generations', usage: 9, limit: 10 },
      })
    );
  });

  it('80% 경고용 사용량 조회가 실패해도 메인 흐름은 throw하지 않는다', async () => {
    const repo = makeRepo();
    repo.checkAndIncrementDailyLimit.mockResolvedValue(true);
    repo.getCurrentUsage.mockRejectedValue(new Error('usage read fail'));
    const service = new RateLimitService(repo);

    await expect(service.checkAndIncrementDailyLimit('user-1')).resolves.toEqual({ charged: true });
    await flush();
    expect(eventBus.emit).not.toHaveBeenCalled();
  });

  it('한도 초과(allowed=false) 시 RateLimitError를 던진다', async () => {
    const repo = makeRepo();
    repo.checkAndIncrementDailyLimit.mockResolvedValue(false);
    const service = new RateLimitService(repo);

    await expect(service.checkAndIncrementDailyLimit('user-1')).rejects.toBeInstanceOf(RateLimitError);
  });

  it('DB 오류 시 fail-open으로 요청을 통과시키고 에러 로그를 남긴다', async () => {
    const repo = makeRepo();
    repo.checkAndIncrementDailyLimit.mockRejectedValue(new Error('db down'));
    const service = new RateLimitService(repo);

    // fail-open은 카운터를 올리지 않으므로 charged=false — 실패해도 환불하면 안 된다.
    await expect(service.checkAndIncrementDailyLimit('user-1')).resolves.toEqual({ charged: false });
    expect(logger.error).toHaveBeenCalledWith(
      'Rate limit check failed — failing open',
      expect.objectContaining({ userId: 'user-1', error: 'db down' })
    );
  });

  it('Error가 아닌 값으로 reject되어도 String(err)로 직렬화해 fail-open한다', async () => {
    const repo = makeRepo();
    repo.checkAndIncrementDailyLimit.mockRejectedValue('raw string failure');
    const service = new RateLimitService(repo);

    await expect(service.checkAndIncrementDailyLimit('user-1')).resolves.toEqual({ charged: false });
    expect(logger.error).toHaveBeenCalledWith(
      'Rate limit check failed — failing open',
      expect.objectContaining({ error: 'raw string failure' })
    );
  });
});

describe('RateLimitService.decrementDailyLimit()', () => {
  it('보상 감소를 리포지토리에 위임한다', async () => {
    const repo = makeRepo();
    repo.decrementDailyLimit.mockResolvedValue(undefined);
    const service = new RateLimitService(repo);

    await service.decrementDailyLimit('user-1');

    expect(repo.decrementDailyLimit).toHaveBeenCalledWith('user-1');
  });

  it('감소 실패는 삼키고 경고 로그만 남긴다(best-effort)', async () => {
    const repo = makeRepo();
    repo.decrementDailyLimit.mockRejectedValue(new Error('decrement fail'));
    const service = new RateLimitService(repo);

    await expect(service.decrementDailyLimit('user-1')).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Failed to decrement'),
      expect.objectContaining({ userId: 'user-1', error: 'decrement fail' })
    );
  });

  it('Error가 아닌 값으로 reject되어도 String(err)로 직렬화한다', async () => {
    const repo = makeRepo();
    repo.decrementDailyLimit.mockRejectedValue(42);
    const service = new RateLimitService(repo);

    await expect(service.decrementDailyLimit('user-1')).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Failed to decrement'),
      expect.objectContaining({ error: '42' })
    );
  });
});

describe('RateLimitService.getCurrentUsage()', () => {
  it('리포지토리의 사용량을 그대로 반환한다', async () => {
    const repo = makeRepo();
    repo.getCurrentUsage.mockResolvedValue(7);
    const service = new RateLimitService(repo);

    await expect(service.getCurrentUsage('user-1')).resolves.toBe(7);
  });

  it('조회 실패 시 UI를 깨뜨리지 않도록 0을 반환하고 경고 로그를 남긴다', async () => {
    const repo = makeRepo();
    repo.getCurrentUsage.mockRejectedValue(new Error('read fail'));
    const service = new RateLimitService(repo);

    await expect(service.getCurrentUsage('user-1')).resolves.toBe(0);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Failed to read'),
      expect.objectContaining({ userId: 'user-1', error: 'read fail' })
    );
  });

  it('Error가 아닌 값으로 reject되어도 0을 반환하고 String(err)로 직렬화한다', async () => {
    const repo = makeRepo();
    repo.getCurrentUsage.mockRejectedValue(null);
    const service = new RateLimitService(repo);

    await expect(service.getCurrentUsage('user-1')).resolves.toBe(0);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Failed to read'),
      expect.objectContaining({ error: 'null' })
    );
  });
});
