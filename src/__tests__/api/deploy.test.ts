import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------- Module mocks ----------
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

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

vi.mock('@/lib/config/providers', () => ({
  getDbProvider: vi.fn().mockReturnValue('supabase'),
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
    generationTimeoutMs: 120000,
  }),
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
    const response = await POST(makeRequest({ projectId: 'proj-1' }));
    expect(response.status).toBe(401);
  });

  it('projectId 누락 시 400을 반환한다', async () => {
    const { getAuthUser } = await import('@/lib/auth/index');
    vi.mocked(getAuthUser).mockResolvedValue(mockUser);

    const { POST } = await import('@/app/api/v1/deploy/route');
    const response = await POST(makeRequest({ platform: 'railway' }));
    expect(response.status).toBe(400);
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
  });

  it('지원하지 않는 플랫폼이면 400을 반환한다', async () => {
    const { getAuthUser } = await import('@/lib/auth/index');
    vi.mocked(getAuthUser).mockResolvedValue(mockUser);

    const { DeployProviderFactory } = await import('@/providers/deploy/DeployProviderFactory');
    vi.mocked(DeployProviderFactory.getSupportedPlatforms).mockReturnValue(['railway', 'github_pages']);

    const { POST } = await import('@/app/api/v1/deploy/route');
    const response = await POST(makeRequest({ projectId: 'proj-1', platform: 'vercel' }));
    expect(response.status).toBe(400);
  });

  it('해피패스: SSE에 progress + complete 이벤트가 포함된다', async () => {
    const { getAuthUser } = await import('@/lib/auth/index');
    vi.mocked(getAuthUser).mockResolvedValue(mockUser);

    const deployMock = vi.fn().mockImplementation(
      async (_projectId: string, _userId: string, _platform: string, onProgress: (p: number, msg: string) => void) => {
        onProgress(50, '배포 중...');
        return { deployUrl: 'https://example.railway.app', repoUrl: 'https://github.com/user/repo' };
      }
    );
    const { createDeployService } = await import('@/services/factory');
    vi.mocked(createDeployService).mockReturnValue({ deploy: deployMock } as never);

    const { POST } = await import('@/app/api/v1/deploy/route');
    const response = await POST(makeRequest({ projectId: 'proj-1', platform: 'railway' }));

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/event-stream; charset=utf-8');

    const text = await readSseText(response);
    expect(text).toContain('event: progress');
    expect(text).toContain('event: complete');
    expect(text).toContain('proj-1');
    expect(deployMock).toHaveBeenCalledWith('proj-1', 'user-1', 'railway', expect.any(Function));
  });

  describe('일일 배포 rate limit', () => {
    it('한도 이내 배포 → 200', async () => {
      const { getAuthUser } = await import('@/lib/auth/index');
      vi.mocked(getAuthUser).mockResolvedValue(mockUser);

      // getLimits mock
      vi.doMock('@/lib/config/features', () => ({
        getLimits: vi.fn().mockReturnValue({ maxDeployPerDay: 5 }),
      }));

      const { createDeployService } = await import('@/services/factory');
      vi.mocked(createDeployService).mockReturnValue({
        deploy: vi.fn().mockResolvedValue({ deployUrl: 'https://example.com', repoUrl: '' }),
      } as never);

      const { POST } = await import('@/app/api/v1/deploy/route');
      const response = await POST(makeRequest({ projectId: 'proj-1', platform: 'railway' }));
      expect(response.status).toBe(200);
    });

    it('일일 한도 초과 → 429', async () => {
      const { getAuthUser } = await import('@/lib/auth/index');
      vi.mocked(getAuthUser).mockResolvedValue(mockUser);

      vi.doMock('@/lib/config/features', () => ({
        getLimits: vi.fn().mockReturnValue({ maxDeployPerDay: 2 }),
      }));

      const { createDeployService } = await import('@/services/factory');
      vi.mocked(createDeployService).mockReturnValue({
        deploy: vi.fn().mockResolvedValue({ deployUrl: 'https://example.com', repoUrl: '' }),
      } as never);

      const { POST } = await import('@/app/api/v1/deploy/route');

      // 2회 성공
      for (let i = 0; i < 2; i++) {
        const res = await POST(makeRequest({ projectId: 'proj-1', platform: 'railway' }));
        expect(res.status).toBe(200);
      }

      // 3번째 → 429
      const res = await POST(makeRequest({ projectId: 'proj-1', platform: 'railway' }));
      expect(res.status).toBe(429);
    });
  });

  it('배포 실패 시 SSE error 이벤트와 DEPLOYMENT_FAILED 이벤트가 발생한다', async () => {
    const { getAuthUser } = await import('@/lib/auth/index');
    vi.mocked(getAuthUser).mockResolvedValue(mockUser);

    const { createDeployService } = await import('@/services/factory');
    vi.mocked(createDeployService).mockReturnValue({
      deploy: vi.fn().mockRejectedValue(new Error('Railway 연결 실패')),
    } as never);

    const { eventBus } = await import('@/lib/events/eventBus');

    const { POST } = await import('@/app/api/v1/deploy/route');
    const response = await POST(makeRequest({ projectId: 'proj-1', platform: 'railway' }));

    expect(response.status).toBe(200);
    const text = await readSseText(response);
    expect(text).toContain('event: error');
    expect(vi.mocked(eventBus.emit)).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'DEPLOYMENT_FAILED' })
    );
  });
});
