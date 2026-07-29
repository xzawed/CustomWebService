import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------- Module mocks ----------
vi.mock('@/lib/auth/index', () => ({
  getAuthUser: vi.fn(),
}));

vi.mock('@/lib/auth/verifiedGuard', () => ({
  assertEmailVerified: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/services/factory', () => ({
  createRateLimitService: vi.fn(),
  createCatalogService: vi.fn(),
}));

vi.mock('@/lib/ai/preferencesRecommender', () => ({
  recommendPreferences: vi.fn(),
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ---------- Test data ----------
const mockUser = { id: 'user-1', email: 'test@test.com', name: null, avatarUrl: null };

const mockApiIds = [
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  'b2c3d4e5-f6a7-8901-bcde-f12345678901',
];

const mockApis = [
  { id: mockApiIds[0], name: 'Weather API', category: 'weather', description: '날씨 정보 제공' },
  { id: mockApiIds[1], name: 'News API', category: 'news', description: '뉴스 기사 제공' },
];

const mockHighScoreResult = {
  relevanceScore: 85,
  suggestion: {
    template: 'dashboard' as const,
    mood: 'light' as const,
    audience: 'general' as const,
    layoutPreference: 'dashboard' as const,
    reason: '날씨 정보와 뉴스를 결합한 대시보드에 적합합니다.',
  },
  resolutionOptions: null,
};

const mockFallbackResult = {
  relevanceScore: null,
  suggestion: null,
  resolutionOptions: null,
};

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/v1/suggest-preferences', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeRawRequest(rawBody: string) {
  return new Request('http://localhost/api/v1/suggest-preferences', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: rawBody,
  });
}

async function setupAuth(user: typeof mockUser | null = mockUser) {
  const { getAuthUser } = await import('@/lib/auth/index');
  vi.mocked(getAuthUser).mockResolvedValue(user);

  const { createRateLimitService, createCatalogService } = await import('@/services/factory');
  vi.mocked(createRateLimitService).mockReturnValue({
    checkAndIncrementDailySuggestionLimit: vi.fn().mockResolvedValue({ charged: true }),
    decrementDailySuggestionLimit: vi.fn().mockResolvedValue(undefined),
  } as never);

  vi.mocked(createCatalogService).mockReturnValue({
    getByIds: vi.fn().mockResolvedValue(mockApis),
  } as never);
}

// ---------- Tests ----------
describe('POST /api/v1/suggest-preferences', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    const { assertEmailVerified } = await import('@/lib/auth/verifiedGuard');
    vi.mocked(assertEmailVerified).mockResolvedValue(undefined);
  });

  it('비로그인 시 401을 반환한다', async () => {
    const { getAuthUser } = await import('@/lib/auth/index');
    vi.mocked(getAuthUser).mockResolvedValue(null);

    const { POST } = await import('@/app/api/v1/suggest-preferences/route');
    const response = await POST(makeRequest({ context: '날씨와 뉴스를 결합한 대시보드를 만들고 싶어요', apiIds: mockApiIds }));
    expect(response.status).toBe(401);
  });

  it('미인증 이메일이면 charge 전에 차단한다', async () => {
    await setupAuth();
    const { assertEmailVerified } = await import('@/lib/auth/verifiedGuard');
    const { EmailNotVerifiedError } = await import('@/lib/utils/errors');
    vi.mocked(assertEmailVerified).mockRejectedValue(new EmailNotVerifiedError());

    const { POST } = await import('@/app/api/v1/suggest-preferences/route');
    const response = await POST(
      makeRequest({
        context: '날씨와 뉴스를 결합한 대시보드 서비스를 만들고 싶어요.',
        apiIds: mockApiIds,
      }),
    );
    expect(response.status).toBe(403);

    const { createRateLimitService } = await import('@/services/factory');
    expect(createRateLimitService).not.toHaveBeenCalled();
  });

  it('body 없으면 400을 반환하고 limiter를 호출하지 않는다', async () => {
    await setupAuth();

    const { POST } = await import('@/app/api/v1/suggest-preferences/route');
    const response = await POST(makeRawRequest('not-json'));
    expect(response.status).toBe(400);

    const { createRateLimitService } = await import('@/services/factory');
    expect(createRateLimitService).not.toHaveBeenCalled();
  });

  it('context가 너무 짧으면(19자) 400을 반환한다', async () => {
    await setupAuth();

    const { POST } = await import('@/app/api/v1/suggest-preferences/route');
    const response = await POST(makeRequest({ context: '짧은 컨텍스트야', apiIds: mockApiIds }));
    expect(response.status).toBe(400);
  });

  it('apiIds 없으면 400을 반환하고 limiter를 호출하지 않는다', async () => {
    await setupAuth();

    const { POST } = await import('@/app/api/v1/suggest-preferences/route');
    const response = await POST(makeRequest({ context: '날씨와 뉴스를 결합한 대시보드 서비스를 만들고 싶어요.' }));
    expect(response.status).toBe(400);

    const { createRateLimitService } = await import('@/services/factory');
    expect(createRateLimitService).not.toHaveBeenCalled();
  });

  it('apiIds 6개 이상이면 400을 반환한다', async () => {
    await setupAuth();

    const sixIds = Array.from(
      { length: 6 },
      (_, i) => `a${i}b2c3d4-e5f6-7890-abcd-ef123456789${i}`,
    );

    const { POST } = await import('@/app/api/v1/suggest-preferences/route');
    const response = await POST(
      makeRequest({ context: '날씨와 뉴스를 결합한 대시보드 서비스를 만들고 싶어요.', apiIds: sixIds }),
    );
    expect(response.status).toBe(400);
  });

  it('AI throw 후 charged=true 이면 환불을 1회 호출한다', async () => {
    await setupAuth();

    const { createRateLimitService } = await import('@/services/factory');
    const rateLimitService = {
      checkAndIncrementDailySuggestionLimit: vi.fn().mockResolvedValue({ charged: true }),
      decrementDailySuggestionLimit: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(createRateLimitService).mockReturnValue(rateLimitService as never);

    const { recommendPreferences } = await import('@/lib/ai/preferencesRecommender');
    vi.mocked(recommendPreferences).mockRejectedValue(new Error('AI down'));

    const { POST } = await import('@/app/api/v1/suggest-preferences/route');
    const response = await POST(
      makeRequest({
        context: '날씨와 뉴스를 결합한 대시보드 서비스를 만들고 싶어요.',
        apiIds: mockApiIds,
      }),
    );
    expect(response.status).toBe(500);
    expect(rateLimitService.decrementDailySuggestionLimit).toHaveBeenCalledTimes(1);
  });

  it('charged=false 이면 환불하지 않는다', async () => {
    await setupAuth();

    const { createRateLimitService } = await import('@/services/factory');
    const rateLimitService = {
      checkAndIncrementDailySuggestionLimit: vi.fn().mockResolvedValue({ charged: false }),
      decrementDailySuggestionLimit: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(createRateLimitService).mockReturnValue(rateLimitService as never);

    const { recommendPreferences } = await import('@/lib/ai/preferencesRecommender');
    vi.mocked(recommendPreferences).mockRejectedValue(new Error('AI down'));

    const { POST } = await import('@/app/api/v1/suggest-preferences/route');
    await POST(
      makeRequest({
        context: '날씨와 뉴스를 결합한 대시보드 서비스를 만들고 싶어요.',
        apiIds: mockApiIds,
      }),
    );
    expect(rateLimitService.decrementDailySuggestionLimit).not.toHaveBeenCalled();
  });

  it('정상 요청 시 relevanceScore와 suggestion을 반환한다', async () => {
    await setupAuth();

    const { recommendPreferences } = await import('@/lib/ai/preferencesRecommender');
    vi.mocked(recommendPreferences).mockResolvedValue(mockHighScoreResult);

    const { POST } = await import('@/app/api/v1/suggest-preferences/route');
    const response = await POST(
      makeRequest({
        context: '날씨와 뉴스를 결합한 대시보드 서비스를 만들고 싶어요.',
        apiIds: mockApiIds,
      }),
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.success).toBe(true);
    expect(json.data.relevanceScore).toBe(85);
    expect(json.data.suggestion).not.toBeNull();
    expect(json.data.suggestion.template).toBe('dashboard');
  });

  it('recommendPreferences 폴백 반환 시에도 200을 반환하고 환불하지 않는다', async () => {
    await setupAuth();

    const { createRateLimitService } = await import('@/services/factory');
    const rateLimitService = {
      checkAndIncrementDailySuggestionLimit: vi.fn().mockResolvedValue({ charged: true }),
      decrementDailySuggestionLimit: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(createRateLimitService).mockReturnValue(rateLimitService as never);

    const { recommendPreferences } = await import('@/lib/ai/preferencesRecommender');
    vi.mocked(recommendPreferences).mockResolvedValue(mockFallbackResult);

    const { POST } = await import('@/app/api/v1/suggest-preferences/route');
    const response = await POST(
      makeRequest({
        context: '날씨와 뉴스를 결합한 대시보드 서비스를 만들고 싶어요.',
        apiIds: mockApiIds,
      }),
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.success).toBe(true);
    expect(json.data.relevanceScore).toBeNull();
    expect(json.data.suggestion).toBeNull();
    expect(json.data.resolutionOptions).toBeNull();
    // soft success — 토큰을 이미 썼으므로 환불하지 않는다
    expect(rateLimitService.decrementDailySuggestionLimit).not.toHaveBeenCalled();
  });
});
