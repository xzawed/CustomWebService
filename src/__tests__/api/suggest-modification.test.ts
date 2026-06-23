import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------- Module mocks ----------
vi.mock('@/lib/auth/index', () => ({
  getAuthUser: vi.fn(),
}));

vi.mock('@/providers/ai/AiProviderFactory', () => ({
  AiProviderFactory: {
    create: vi.fn(),
    createForTask: vi.fn(),
  },
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@/services/factory', () => ({
  createRateLimitService: vi.fn().mockReturnValue({
    checkAndIncrementDailyLimit: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock('@/repositories/factory', () => ({
  createProjectRepository: vi.fn(),
  createCatalogRepository: vi.fn(),
}));

// ---------- Test data ----------
const mockUser = { id: 'user-1', email: 'test@test.com', name: null, avatarUrl: null };
const VALID_PROJECT_ID = '11111111-1111-4111-a111-111111111111';
const mockProject = {
  id: VALID_PROJECT_ID,
  userId: 'user-1',
  context: '날씨 대시보드',
};
const mockApis = [
  { name: 'Weather API', description: '날씨 정보 제공' },
];

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/v1/suggest-modification', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeRawRequest(rawBody: string) {
  return new Request('http://localhost/api/v1/suggest-modification', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: rawBody,
  });
}

async function setupAuth(user: typeof mockUser | null = mockUser) {
  const { getAuthUser } = await import('@/lib/auth/index');
  vi.mocked(getAuthUser).mockResolvedValue(user);
}

async function setupProjectRepo(project: typeof mockProject | null = mockProject, apiIds: string[] = ['api-1']) {
  const { createProjectRepository } = await import('@/repositories/factory');
  vi.mocked(createProjectRepository).mockReturnValue({
    findById: vi.fn().mockResolvedValue(project),
    getProjectApiIds: vi.fn().mockResolvedValue(apiIds),
  } as never);
}

async function setupCatalogRepo(apis = mockApis) {
  const { createCatalogRepository } = await import('@/repositories/factory');
  vi.mocked(createCatalogRepository).mockReturnValue({
    findByIds: vi.fn().mockResolvedValue(apis),
  } as never);
}

// ---------- Tests ----------
describe('POST /api/v1/suggest-modification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('비로그인 시 401을 반환한다', async () => {
    const { getAuthUser } = await import('@/lib/auth/index');
    vi.mocked(getAuthUser).mockResolvedValue(null);

    const { POST } = await import('@/app/api/v1/suggest-modification/route');
    const response = await POST(makeRequest({ projectId: VALID_PROJECT_ID }));
    expect(response.status).toBe(401);
  });

  it('projectId 없으면 400을 반환한다', async () => {
    await setupAuth();

    const { POST } = await import('@/app/api/v1/suggest-modification/route');
    const response = await POST(makeRequest({}));
    expect(response.status).toBe(400);
  });

  it('잘못된 JSON이면 400을 반환한다', async () => {
    await setupAuth();

    const { POST } = await import('@/app/api/v1/suggest-modification/route');
    const response = await POST(makeRawRequest('not-json'));
    expect(response.status).toBe(400);
  });

  it('프로젝트가 없으면 404를 반환한다', async () => {
    await setupAuth();
    await setupProjectRepo(null);

    const { POST } = await import('@/app/api/v1/suggest-modification/route');
    const response = await POST(makeRequest({ projectId: VALID_PROJECT_ID }));
    expect(response.status).toBe(404);
  });

  it('다른 사용자의 프로젝트면 404를 반환한다', async () => {
    await setupAuth();
    await setupProjectRepo({ ...mockProject, userId: 'other-user' });

    const { POST } = await import('@/app/api/v1/suggest-modification/route');
    const response = await POST(makeRequest({ projectId: VALID_PROJECT_ID }));
    expect(response.status).toBe(404);
  });

  it('정상 요청 시 suggestions를 반환한다', async () => {
    await setupAuth();
    await setupProjectRepo();
    await setupCatalogRepo();

    const suggestions = [
      '헤더에 날씨 아이콘을 추가해주세요.',
      '7일 예보 차트를 추가해주세요.',
      '야간 모드를 지원해주세요.',
    ];

    const { AiProviderFactory } = await import('@/providers/ai/AiProviderFactory');
    vi.mocked(AiProviderFactory.create).mockReturnValue({
      name: 'claude',
      generateCode: vi.fn().mockResolvedValue({
        content: JSON.stringify(suggestions),
        provider: 'claude',
        model: 'claude-haiku-4-5',
        durationMs: 500,
        tokensUsed: { input: 50, output: 100 },
      }),
    } as never);

    const { POST } = await import('@/app/api/v1/suggest-modification/route');
    const response = await POST(makeRequest({ projectId: VALID_PROJECT_ID }));

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.success).toBe(true);
    expect(json.data.suggestions).toEqual(suggestions);
  });

  it('prompt 전달 시 suggestions를 반환한다', async () => {
    await setupAuth();
    await setupProjectRepo();
    await setupCatalogRepo();

    const { AiProviderFactory } = await import('@/providers/ai/AiProviderFactory');
    vi.mocked(AiProviderFactory.create).mockReturnValue({
      name: 'claude',
      generateCode: vi.fn().mockResolvedValue({
        content: '["제안1", "제안2", "제안3"]',
        provider: 'claude',
        model: 'claude-haiku-4-5',
        durationMs: 400,
        tokensUsed: { input: 40, output: 80 },
      }),
    } as never);

    const { POST } = await import('@/app/api/v1/suggest-modification/route');
    const response = await POST(makeRequest({ projectId: VALID_PROJECT_ID, prompt: '모바일 개선' }));

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.success).toBe(true);
    expect(json.data.suggestions).toHaveLength(3);
  });

  it('AI 응답 파싱 실패 시 빈 배열을 반환한다', async () => {
    await setupAuth();
    await setupProjectRepo();
    await setupCatalogRepo();

    const { AiProviderFactory } = await import('@/providers/ai/AiProviderFactory');
    vi.mocked(AiProviderFactory.create).mockReturnValue({
      name: 'claude',
      generateCode: vi.fn().mockResolvedValue({
        content: '이것은 JSON이 아닌 텍스트입니다.',
        provider: 'claude',
        model: 'claude-haiku-4-5',
        durationMs: 300,
        tokensUsed: { input: 30, output: 60 },
      }),
    } as never);

    const { POST } = await import('@/app/api/v1/suggest-modification/route');
    const response = await POST(makeRequest({ projectId: VALID_PROJECT_ID }));

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.success).toBe(true);
    expect(json.data.suggestions).toEqual([]);
  });

  it('API 없는 프로젝트도 정상 처리한다', async () => {
    await setupAuth();
    await setupProjectRepo(mockProject, []);
    await setupCatalogRepo([]);

    const { AiProviderFactory } = await import('@/providers/ai/AiProviderFactory');
    vi.mocked(AiProviderFactory.create).mockReturnValue({
      name: 'claude',
      generateCode: vi.fn().mockResolvedValue({
        content: '["제안1", "제안2", "제안3"]',
        provider: 'claude',
        model: 'claude-haiku-4-5',
        durationMs: 300,
        tokensUsed: { input: 30, output: 60 },
      }),
    } as never);

    const { POST } = await import('@/app/api/v1/suggest-modification/route');
    const response = await POST(makeRequest({ projectId: VALID_PROJECT_ID }));

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.success).toBe(true);
  });
});
