import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------- Module mocks ----------
vi.mock('@/lib/auth/index', () => ({
  getAuthUser: vi.fn(),
}));

vi.mock('@/services/factory', () => ({
  createDeployService: vi.fn(),
}));

vi.mock('@/providers/deploy/DeployProviderFactory', () => ({
  DeployProviderFactory: {
    getSupportedPlatforms: vi.fn().mockReturnValue(['railway', 'github_pages']),
  },
}));

vi.mock('@/lib/events/eventBus', () => ({
  eventBus: { emit: vi.fn() },
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@/lib/config/features', () => ({
  getLimits: vi.fn().mockReturnValue({
    maxDeployPerDay: 5,
    maxApisPerProject: 5,
    maxDailyGenerations: 10,
    maxProjects: 20,
    maxRegenerations: 5,
    contextMinLength: 50,
    contextMaxLength: 2000,
  }),
}));

vi.mock('@/repositories/factory', () => ({
  createRateLimitRepository: vi.fn().mockReturnValue({
    checkAndIncrementDailyDeployLimit: vi.fn().mockResolvedValue(true),
  }),
}));

vi.mock('@/lib/auth/verifiedGuard', () => ({
  assertEmailVerified: vi.fn().mockResolvedValue(undefined),
}));

// ---------- Test data ----------
const mockUser = { id: 'user-1', email: 'test@test.com', name: null, avatarUrl: null };

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/v1/deploy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function readSseText(response: Response): Promise<string> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let result = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    result += decoder.decode(value, { stream: true });
  }
  return result;
}

// ---------- Tests ----------
describe('POST /api/v1/deploy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('비로그인 시 401을 반환한다', async () => {
    const { getAuthUser } = await import('@/lib/auth/index');
    vi.mocked(getAuthUser).mockResolvedValue(null);

    const { POST } = await import('@/app/api/v1/deploy/route');
    const response = await POST(makeRequest({ projectId: '11111111-1111-4111-a111-111111111111' }));
    expect(response.status).toBe(401);
  });

  it('projectId 누락 시 400을 반환한다', async () => {
    const { getAuthUser } = await import('@/lib/auth/index');
    vi.mocked(getAuthUser).mockResolvedValue(mockUser);

    const { POST } = await import('@/app/api/v1/deploy/route');
    const response = await POST(makeRequest({ platform: 'railway' }));
    expect(response.status).toBe(400);

    const { createRateLimitRepository } = await import('@/repositories/factory');
    expect(createRateLimitRepository).not.toHaveBeenCalled();
  });

  it('잘못된 JSON이면 400을 반환한다', async () => {
    const { getAuthUser } = await import('@/lib/auth/index');
    vi.mocked(getAuthUser).mockResolvedValue(mockUser);

    const { POST } = await import('@/app/api/v1/deploy/route');
    const request = new Request('http://localhost/api/v1/deploy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    });
    const response = await POST(request);
    expect(response.status).toBe(400);

    const { createRateLimitRepository } = await import('@/repositories/factory');
    expect(createRateLimitRepository).not.toHaveBeenCalled();
  });

  it('지원하지 않는 플랫폼이면 400을 반환한다', async () => {
    const { getAuthUser } = await import('@/lib/auth/index');
    vi.mocked(getAuthUser).mockResolvedValue(mockUser);

    const { DeployProviderFactory } = await import('@/providers/deploy/DeployProviderFactory');
    vi.mocked(DeployProviderFactory.getSupportedPlatforms).mockReturnValue(['railway', 'github_pages']);

    const { POST } = await import('@/app/api/v1/deploy/route');
    const response = await POST(makeRequest({ projectId: '11111111-1111-4111-a111-111111111111', platform: 'vercel' }));
    expect(response.status).toBe(400);
  });

  it('해피패스: SSE에 progress + complete 이벤트가 포함된다', async () => {
    const { getAuthUser } = await import('@/lib/auth/index');
    vi.mocked(getAuthUser).mockResolvedValue(mockUser);

    const { createRateLimitRepository } = await import('@/repositories/factory');
    vi.mocked(createRateLimitRepository).mockReturnValue({
      checkAndIncrementDailyDeployLimit: vi.fn().mockResolvedValue(true),
    } as never);

    const deployMock = vi.fn().mockImplementation(
      async (_projectId: string, _userId: string, _platform: string, onProgress: (p: number, msg: string) => void) => {
        onProgress(50, '배포 중...');
        return { deployUrl: 'https://example.railway.app', repoUrl: 'https://github.com/user/repo' };
      }
    );
    const { createDeployService } = await import('@/services/factory');
    vi.mocked(createDeployService).mockReturnValue({ deploy: deployMock } as never);

    const { POST } = await import('@/app/api/v1/deploy/route');
    const response = await POST(makeRequest({ projectId: '11111111-1111-4111-a111-111111111111', platform: 'railway' }));

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/event-stream; charset=utf-8');

    const text = await readSseText(response);
    expect(text).toContain('event: progress');
    expect(text).toContain('event: complete');
    expect(text).toContain('11111111-1111-4111-a111-111111111111');
    expect(deployMock).toHaveBeenCalledWith('11111111-1111-4111-a111-111111111111', 'user-1', 'railway', expect.any(Function));
  });

  describe('일일 배포 rate limit', () => {
    it('한도 이내 배포 → 200', async () => {
      const { getAuthUser } = await import('@/lib/auth/index');
      vi.mocked(getAuthUser).mockResolvedValue(mockUser);

      const { createRateLimitRepository } = await import('@/repositories/factory');
      vi.mocked(createRateLimitRepository).mockReturnValue({
        checkAndIncrementDailyDeployLimit: vi.fn().mockResolvedValue(true),
      } as never);

      const { createDeployService } = await import('@/services/factory');
      vi.mocked(createDeployService).mockReturnValue({
        deploy: vi.fn().mockResolvedValue({ deployUrl: 'https://example.com', repoUrl: '' }),
      } as never);

      const { POST } = await import('@/app/api/v1/deploy/route');
      const response = await POST(makeRequest({ projectId: '11111111-1111-4111-a111-111111111111', platform: 'railway' }));
      expect(response.status).toBe(200);
    });

    it('일일 한도 초과 → 429', async () => {
      const { getAuthUser } = await import('@/lib/auth/index');
      vi.mocked(getAuthUser).mockResolvedValue(mockUser);

      const { createRateLimitRepository } = await import('@/repositories/factory');
      vi.mocked(createRateLimitRepository).mockReturnValue({
        checkAndIncrementDailyDeployLimit: vi.fn().mockResolvedValue(false),
      } as never);

      const { POST } = await import('@/app/api/v1/deploy/route');
      const response = await POST(makeRequest({ projectId: '11111111-1111-4111-a111-111111111111', platform: 'railway' }));
      expect(response.status).toBe(429);
    });
  });

  it('배포 실패 시 SSE error 이벤트와 DEPLOYMENT_FAILED 이벤트가 발생한다', async () => {
    const { getAuthUser } = await import('@/lib/auth/index');
    vi.mocked(getAuthUser).mockResolvedValue(mockUser);

    const { createRateLimitRepository } = await import('@/repositories/factory');
    vi.mocked(createRateLimitRepository).mockReturnValue({
      checkAndIncrementDailyDeployLimit: vi.fn().mockResolvedValue(true),
      decrementDailyDeployLimit: vi.fn().mockResolvedValue(undefined),
    } as never);

    const { createDeployService } = await import('@/services/factory');
    vi.mocked(createDeployService).mockReturnValue({
      deploy: vi.fn().mockRejectedValue(new Error('Railway 연결 실패')),
    } as never);

    const { eventBus } = await import('@/lib/events/eventBus');

    const { POST } = await import('@/app/api/v1/deploy/route');
    const response = await POST(makeRequest({ projectId: '11111111-1111-4111-a111-111111111111', platform: 'railway' }));

    expect(response.status).toBe(200);
    const text = await readSseText(response);
    expect(text).toContain('event: error');
    expect(vi.mocked(eventBus.emit)).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'DEPLOYMENT_FAILED' })
    );
  });

  it('배포 실패 시 일일 배포 카운터를 환불(decrement)한다', async () => {
    const { getAuthUser } = await import('@/lib/auth/index');
    vi.mocked(getAuthUser).mockResolvedValue(mockUser);

    const decrementMock = vi.fn().mockResolvedValue(undefined);
    const { createRateLimitRepository } = await import('@/repositories/factory');
    vi.mocked(createRateLimitRepository).mockReturnValue({
      checkAndIncrementDailyDeployLimit: vi.fn().mockResolvedValue(true),
      decrementDailyDeployLimit: decrementMock,
    } as never);

    const { createDeployService } = await import('@/services/factory');
    vi.mocked(createDeployService).mockReturnValue({
      deploy: vi.fn().mockRejectedValue(new Error('Repo not found for project: secret-proj')),
    } as never);

    const { POST } = await import('@/app/api/v1/deploy/route');
    const response = await POST(makeRequest({ projectId: '11111111-1111-4111-a111-111111111111', platform: 'railway' }));
    await readSseText(response);

    expect(decrementMock).toHaveBeenCalledWith('user-1');
  });

  it('환불(decrement)이 실패해도 요청을 막지 않되 warn 로그를 남긴다', async () => {
    // 이전에는 `.catch(() => {})`로 에러를 통째로 버려, 환불이 실패해 사용자가 하루치
    // 배포 슬롯을 잃어도 아무 흔적이 남지 않았다. generate 경로(RateLimitService)와 동일하게
    // 삼키되 기록은 남기는 것이 규약이다.
    const { getAuthUser } = await import('@/lib/auth/index');
    vi.mocked(getAuthUser).mockResolvedValue(mockUser);

    const { createRateLimitRepository } = await import('@/repositories/factory');
    vi.mocked(createRateLimitRepository).mockReturnValue({
      checkAndIncrementDailyDeployLimit: vi.fn().mockResolvedValue(true),
      decrementDailyDeployLimit: vi.fn().mockRejectedValue(new Error('DB unavailable')),
    } as never);

    const { createDeployService } = await import('@/services/factory');
    vi.mocked(createDeployService).mockReturnValue({
      deploy: vi.fn().mockRejectedValue(new Error('Railway 연결 실패')),
    } as never);

    const { logger } = await import('@/lib/utils/logger');
    const { POST } = await import('@/app/api/v1/deploy/route');
    const response = await POST(
      makeRequest({ projectId: '11111111-1111-4111-a111-111111111111', platform: 'railway' })
    );
    const text = await readSseText(response);

    // 환불 실패가 응답 경로를 깨뜨리지 않는다
    expect(text).toContain('event: error');
    // 그러나 조용히 사라지지도 않는다
    expect(vi.mocked(logger.warn)).toHaveBeenCalledWith(
      'Failed to decrement daily deploy count (compensation)',
      expect.objectContaining({ userId: 'user-1', error: 'DB unavailable' })
    );
  });

  it('배포 실패 시 내부 에러 메시지(프로바이더 원문)를 클라이언트에 노출하지 않는다', async () => {
    const { getAuthUser } = await import('@/lib/auth/index');
    vi.mocked(getAuthUser).mockResolvedValue(mockUser);

    const { createRateLimitRepository } = await import('@/repositories/factory');
    vi.mocked(createRateLimitRepository).mockReturnValue({
      checkAndIncrementDailyDeployLimit: vi.fn().mockResolvedValue(true),
      decrementDailyDeployLimit: vi.fn().mockResolvedValue(undefined),
    } as never);

    const { createDeployService } = await import('@/services/factory');
    vi.mocked(createDeployService).mockReturnValue({
      deploy: vi.fn().mockRejectedValue(new Error('Repo not found for project: secret-proj-id')),
    } as never);

    const { POST } = await import('@/app/api/v1/deploy/route');
    const response = await POST(makeRequest({ projectId: '11111111-1111-4111-a111-111111111111', platform: 'railway' }));
    const text = await readSseText(response);

    expect(text).toContain('event: error');
    // 내부 구현 정보(repo 경로/projectId)는 마스킹되어야 함
    expect(text).not.toContain('secret-proj-id');
    expect(text).not.toContain('Repo not found');
    expect(text).toContain('배포 중 오류가 발생했습니다');
  });

  it('AppError(사용자 대상 에러)는 메시지를 그대로 노출한다', async () => {
    const { getAuthUser } = await import('@/lib/auth/index');
    vi.mocked(getAuthUser).mockResolvedValue(mockUser);

    const { createRateLimitRepository } = await import('@/repositories/factory');
    vi.mocked(createRateLimitRepository).mockReturnValue({
      checkAndIncrementDailyDeployLimit: vi.fn().mockResolvedValue(true),
      decrementDailyDeployLimit: vi.fn().mockResolvedValue(undefined),
    } as never);

    const { ValidationError } = await import('@/lib/utils/errors');
    const { createDeployService } = await import('@/services/factory');
    vi.mocked(createDeployService).mockReturnValue({
      deploy: vi.fn().mockRejectedValue(new ValidationError('게시된 코드가 없습니다.')),
    } as never);

    const { POST } = await import('@/app/api/v1/deploy/route');
    const response = await POST(makeRequest({ projectId: '11111111-1111-4111-a111-111111111111', platform: 'railway' }));
    const text = await readSseText(response);

    expect(text).toContain('게시된 코드가 없습니다.');
  });
});
