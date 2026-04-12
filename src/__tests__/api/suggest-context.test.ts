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

// ---------- Test data ----------
const mockUser = { id: 'user-1', email: 'test@test.com', name: null, avatarUrl: null };
const mockApis = [
  { name: 'Weather API', description: '날씨 정보 제공', category: 'weather' },
  { name: 'News API', description: '뉴스 기사 제공', category: 'news' },
];

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/v1/suggest-context', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeRawRequest(rawBody: string) {
  return new Request('http://localhost/api/v1/suggest-context', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: rawBody,
  });
}

async function setupAuth(user: typeof mockUser | null = mockUser) {
  const { getAuthUser } = await import('@/lib/auth/index');
  vi.mocked(getAuthUser).mockResolvedValue(user);

  const { createRateLimitService } = await import('@/services/factory');
  vi.mocked(createRateLimitService).mockReturnValue({
    checkAndIncrementDailyLimit: vi.fn().mockResolvedValue(undefined),
    decrementDailyLimit: vi.fn().mockResolvedValue(undefined),
  } as never);
}

// ---------- Tests ----------
describe('POST /api/v1/suggest-context', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('비로그인 시 401을 반환한다', async () => {
    const { getAuthUser } = await import('@/lib/auth/index');
    vi.mocked(getAuthUser).mockResolvedValue(null);

    const { POST } = await import('@/app/api/v1/suggest-context/route');
    const response = await POST(makeRequest({ apis: mockApis }));
    expect(response.status).toBe(401);
  });

  it('apis 없으면 400을 반환한다', async () => {
    await setupAuth();

    const { POST } = await import('@/app/api/v1/suggest-context/route');
    const response = await POST(makeRequest({}));
    expect(response.status).toBe(400);
  });

  it('apis 빈 배열이면 400을 반환한다', async () => {
    await setupAuth();

    const { POST } = await import('@/app/api/v1/suggest-context/route');
    const response = await POST(makeRequest({ apis: [] }));
    expect(response.status).toBe(400);
  });

  it('apis 6개 초과 시 400을 반환한다', async () => {
    await setupAuth();

    const sixApis = Array.from({ length: 6 }, (_, i) => ({
      name: `API ${i}`,
      description: `desc ${i}`,
      category: `cat ${i}`,
    }));

    const { POST } = await import('@/app/api/v1/suggest-context/route');
    const response = await POST(makeRequest({ apis: sixApis }));
    expect(response.status).toBe(400);
  });

  it('잘못된 JSON이면 400을 반환한다', async () => {
    await setupAuth();

    const { POST } = await import('@/app/api/v1/suggest-context/route');
    const response = await POST(makeRawRequest('not-json'));
    expect(response.status).toBe(400);
  });

  it('정상 요청 시 suggestions를 반환한다', async () => {
    await setupAuth();

    const suggestions = [
      '날씨와 뉴스를 결합한 대시보드를 만들고 싶어요',
      '지역별 날씨에 맞는 뉴스를 추천해주는 서비스',
      '날씨 변화에 따른 뉴스 트렌드 분석 도구',
    ];

    const { AiProviderFactory } = await import('@/providers/ai/AiProviderFactory');
    vi.mocked(AiProviderFactory.createForTask).mockReturnValue({
      name: 'claude',
      generateCode: vi.fn().mockResolvedValue({
        content: JSON.stringify(suggestions),
        provider: 'claude',
        model: 'claude-sonnet-4-6',
        durationMs: 800,
        tokensUsed: { input: 50, output: 100 },
      }),
    } as never);

    const { POST } = await import('@/app/api/v1/suggest-context/route');
    const response = await POST(makeRequest({ apis: mockApis }));

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.success).toBe(true);
    expect(json.data.suggestions).toEqual(suggestions);
  });

  it('AI 응답 파싱 실패 시 빈 배열을 반환한다', async () => {
    await setupAuth();

    const { AiProviderFactory } = await import('@/providers/ai/AiProviderFactory');
    vi.mocked(AiProviderFactory.createForTask).mockReturnValue({
      name: 'claude',
      generateCode: vi.fn().mockResolvedValue({
        content: '이것은 JSON이 아닌 일반 텍스트 응답입니다.',
        provider: 'claude',
        model: 'claude-sonnet-4-6',
        durationMs: 800,
        tokensUsed: { input: 50, output: 100 },
      }),
    } as never);

    const { POST } = await import('@/app/api/v1/suggest-context/route');
    const response = await POST(makeRequest({ apis: mockApis }));

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.success).toBe(true);
    expect(json.data.suggestions).toEqual([]);
  });
});
