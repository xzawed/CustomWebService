import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------- Module mocks ----------
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

vi.mock('@/lib/auth/index', () => ({
  getAuthUser: vi.fn(),
}));

vi.mock('@/services/factory', () => ({
  createRateLimitService: vi.fn(),
  createCatalogService: vi.fn(),
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

vi.mock('@/lib/config/providers', () => ({
  getDbProvider: vi.fn().mockReturnValue('supabase'),
}));

// contextMinLength 기본값 50에 맞춰 고정
vi.mock('@/lib/config/features', () => ({
  LIMITS: { contextMinLength: 50, contextMaxLength: 2000 },
  getLimits: vi.fn().mockReturnValue({ contextMinLength: 50, contextMaxLength: 2000 }),
}));

// ---------- Test data ----------
const mockUser = { id: 'user-1', email: 'test@test.com', name: null, avatarUrl: null };
const mockApis = [
  { id: 'api-1', name: 'Weather API', description: '날씨 정보', category: 'weather' },
  { id: 'api-2', name: 'News API', description: '뉴스 제공', category: 'news' },
];
// contextMinLength=50 이상이어야 통과 (라우트 유효성 검사)
const validContext = '날씨와 뉴스를 조합한 실시간 대시보드를 만들고 싶어요. 기상 데이터와 최신 뉴스를 함께 보여주는 서비스입니다.';

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/v1/suggest-apis', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function setupAuth() {
  const { getAuthUser } = await import('@/lib/auth/index');
  vi.mocked(getAuthUser).mockResolvedValue(mockUser);

  const { createRateLimitService } = await import('@/services/factory');
  vi.mocked(createRateLimitService).mockReturnValue({
    checkAndIncrementDailyLimit: vi.fn().mockResolvedValue(undefined),
    decrementDailyLimit: vi.fn().mockResolvedValue(undefined),
  } as never);
}

async function setupCatalog() {
  const { createCatalogService } = await import('@/services/factory');
  vi.mocked(createCatalogService).mockReturnValue({
    search: vi.fn().mockResolvedValue({ items: mockApis, total: mockApis.length }),
  } as never);
}

// ---------- Tests ----------
describe('POST /api/v1/suggest-apis', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('비로그인 시 401을 반환한다', async () => {
    const { getAuthUser } = await import('@/lib/auth/index');
    vi.mocked(getAuthUser).mockResolvedValue(null);

    const { POST } = await import('@/app/api/v1/suggest-apis/route');
    const response = await POST(makeRequest({ context: validContext }));
    expect(response.status).toBe(401);
  });

  it('context 없으면 400을 반환한다', async () => {
    await setupAuth();

    const { POST } = await import('@/app/api/v1/suggest-apis/route');
    const response = await POST(makeRequest({}));
    expect(response.status).toBe(400);
  });

  it('context 50자 미만이면 400을 반환한다', async () => {
    await setupAuth();

    const { POST } = await import('@/app/api/v1/suggest-apis/route');
    const response = await POST(makeRequest({ context: '짧은 설명' }));
    expect(response.status).toBe(400);
  });

  it('잘못된 JSON이면 400을 반환한다', async () => {
    await setupAuth();

    const { POST } = await import('@/app/api/v1/suggest-apis/route');
    const request = new Request('http://localhost/api/v1/suggest-apis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it('레이트리밋 초과 시 429를 반환한다', async () => {
    const { getAuthUser } = await import('@/lib/auth/index');
    vi.mocked(getAuthUser).mockResolvedValue(mockUser);

    const { createRateLimitService } = await import('@/services/factory');
    const { RateLimitError } = await import('@/lib/utils/errors');
    vi.mocked(createRateLimitService).mockReturnValue({
      checkAndIncrementDailyLimit: vi.fn().mockRejectedValue(new RateLimitError('한도 초과')),
      decrementDailyLimit: vi.fn().mockResolvedValue(undefined),
    } as never);

    const { POST } = await import('@/app/api/v1/suggest-apis/route');
    const response = await POST(makeRequest({ context: validContext }));
    expect(response.status).toBe(429);
  });

  it('정상 요청 시 AI 응답 기반 API 추천 결과를 반환한다', async () => {
    await setupAuth();
    await setupCatalog();

    const recommendations = [
      { id: 'api-1', reason: '날씨 데이터를 실시간으로 제공' },
      { id: 'api-2', reason: '뉴스 피드 통합에 적합' },
    ];

    const { AiProviderFactory } = await import('@/providers/ai/AiProviderFactory');
    vi.mocked(AiProviderFactory.createForTask).mockReturnValue({
      name: 'claude',
      generateCode: vi.fn().mockResolvedValue({
        content: JSON.stringify(recommendations),
        provider: 'claude',
        model: 'claude-sonnet-4-6',
        durationMs: 600,
        tokensUsed: { input: 80, output: 120 },
      }),
    } as never);

    const { POST } = await import('@/app/api/v1/suggest-apis/route');
    const response = await POST(makeRequest({ context: validContext }));

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.success).toBe(true);
    expect(json.data.recommendations).toHaveLength(2);
    expect(json.data.recommendations[0].api.id).toBe('api-1');
    expect(json.data.recommendations[0].reason).toBe('날씨 데이터를 실시간으로 제공');
  });

  it('AI 응답 파싱 실패 시 빈 배열을 반환한다', async () => {
    await setupAuth();
    await setupCatalog();

    const { AiProviderFactory } = await import('@/providers/ai/AiProviderFactory');
    vi.mocked(AiProviderFactory.createForTask).mockReturnValue({
      name: 'claude',
      generateCode: vi.fn().mockResolvedValue({
        content: 'JSON이 아닌 응답입니다.',
        provider: 'claude',
        model: 'claude-sonnet-4-6',
        durationMs: 600,
        tokensUsed: { input: 80, output: 120 },
      }),
    } as never);

    const { POST } = await import('@/app/api/v1/suggest-apis/route');
    const response = await POST(makeRequest({ context: validContext }));

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.success).toBe(true);
    expect(json.data.recommendations).toEqual([]);
  });

  it('AI가 존재하지 않는 API ID를 추천하면 필터링하여 반환한다', async () => {
    await setupAuth();
    await setupCatalog();

    const { AiProviderFactory } = await import('@/providers/ai/AiProviderFactory');
    vi.mocked(AiProviderFactory.createForTask).mockReturnValue({
      name: 'claude',
      generateCode: vi.fn().mockResolvedValue({
        content: JSON.stringify([
          { id: 'api-1', reason: '유효한 ID' },
          { id: 'api-999', reason: '존재하지 않는 ID' },
        ]),
        provider: 'claude',
        model: 'claude-sonnet-4-6',
        durationMs: 600,
        tokensUsed: { input: 80, output: 120 },
      }),
    } as never);

    const { POST } = await import('@/app/api/v1/suggest-apis/route');
    const response = await POST(makeRequest({ context: validContext }));

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.data.recommendations).toHaveLength(1);
    expect(json.data.recommendations[0].api.id).toBe('api-1');
  });
});
