import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------- Module mocks ----------
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
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

vi.mock('@/services/rateLimitService', () => ({
  RateLimitService: vi.fn().mockImplementation(() => ({
    checkAndIncrementDailyLimit: vi.fn().mockResolvedValue(undefined),
  })),
}));

// ---------- Test data ----------
const mockUser = { id: 'user-1', email: 'test@test.com' };

function makeSupabaseMock(user: typeof mockUser | null = mockUser) {
  return { auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) } };
}

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

function mockAiProvider(content: string) {
  return {
    name: 'claude',
    generateCode: vi.fn().mockResolvedValue({
      content,
      provider: 'claude',
      model: 'claude-haiku-4-5',
      durationMs: 500,
      tokensUsed: { input: 50, output: 100 },
    }),
  };
}

function mockAiProviderError(error: Error) {
  return {
    name: 'claude',
    generateCode: vi.fn().mockRejectedValue(error),
  };
}

async function setupProvider(providerMock: ReturnType<typeof mockAiProvider>) {
  const { createClient } = await import('@/lib/supabase/server');
  vi.mocked(createClient).mockResolvedValue(makeSupabaseMock() as never);
  const { AiProviderFactory } = await import('@/providers/ai/AiProviderFactory');
  (AiProviderFactory.createForTask as ReturnType<typeof vi.fn>).mockReturnValue(providerMock);
}

// ---------- Tests ----------
describe('POST /api/v1/suggest-context', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  // ── 인증 ──
  it('비로그인 시 401을 반환한다', async () => {
    const { createClient } = await import('@/lib/supabase/server');
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock(null) as never);

    const { POST } = await import('@/app/api/v1/suggest-context/route');
    const response = await POST(makeRequest({ apis: [{ name: 'A', description: 'd', category: 'c' }] }));
    expect(response.status).toBe(401);
  });

  // ── 입력 유효성 ──
  it('apis 없으면 400을 반환한다', async () => {
    const { createClient } = await import('@/lib/supabase/server');
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock() as never);

    const { POST } = await import('@/app/api/v1/suggest-context/route');
    expect((await POST(makeRequest({}))).status).toBe(400);
  });

  it('apis 빈 배열이면 400을 반환한다', async () => {
    const { createClient } = await import('@/lib/supabase/server');
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock() as never);

    const { POST } = await import('@/app/api/v1/suggest-context/route');
    expect((await POST(makeRequest({ apis: [] }))).status).toBe(400);
  });

  it('apis 6개 초과 시 400을 반환한다', async () => {
    const { createClient } = await import('@/lib/supabase/server');
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock() as never);

    const sixApis = Array.from({ length: 6 }, (_, i) => ({
      name: `API ${i}`, description: `desc`, category: `cat`,
    }));
    const { POST } = await import('@/app/api/v1/suggest-context/route');
    expect((await POST(makeRequest({ apis: sixApis }))).status).toBe(400);
  });

  it('잘못된 JSON이면 400을 반환한다', async () => {
    const { createClient } = await import('@/lib/supabase/server');
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock() as never);

    const { POST } = await import('@/app/api/v1/suggest-context/route');
    expect((await POST(makeRawRequest('not-json'))).status).toBe(400);
  });

  // ── API 1개 선택 시나리오 (핵심 테스트) ──
  it('API 1개만 선택해도 suggestions를 반환한다', async () => {
    const suggestions = ['날씨 대시보드를 만들고 싶어요', '일기예보 알림 서비스', '여행 날씨 플래너'];
    await setupProvider(mockAiProvider(JSON.stringify(suggestions)));

    const { POST } = await import('@/app/api/v1/suggest-context/route');
    const response = await POST(makeRequest({
      apis: [{ name: 'Weather API', description: '날씨 정보', category: 'weather' }],
    }));

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.success).toBe(true);
    expect(json.data.suggestions).toHaveLength(3);
  });

  it('API 1개 선택 시 createForTask를 suggestion 태스크로 호출한다', async () => {
    await setupProvider(mockAiProvider('["a","b","c"]'));

    const { AiProviderFactory } = await import('@/providers/ai/AiProviderFactory');
    const { POST } = await import('@/app/api/v1/suggest-context/route');
    await POST(makeRequest({
      apis: [{ name: 'Weather API', description: '날씨', category: 'weather' }],
    }));

    expect(AiProviderFactory.createForTask).toHaveBeenCalledWith('suggestion');
  });

  // ── 다양한 API 조합 ──
  it('API 2개 선택 시 정상 동작한다', async () => {
    await setupProvider(mockAiProvider('["아이디어1","아이디어2","아이디어3"]'));

    const { POST } = await import('@/app/api/v1/suggest-context/route');
    const response = await POST(makeRequest({
      apis: [
        { name: 'Weather API', description: '날씨', category: 'weather' },
        { name: 'News API', description: '뉴스', category: 'news' },
      ],
    }));

    const json = await response.json();
    expect(json.data.suggestions).toHaveLength(3);
  });

  it('API 5개 (최대) 선택 시 정상 동작한다', async () => {
    await setupProvider(mockAiProvider('["a","b","c"]'));

    const fiveApis = Array.from({ length: 5 }, (_, i) => ({
      name: `API${i}`, description: `desc${i}`, category: `cat${i}`,
    }));
    const { POST } = await import('@/app/api/v1/suggest-context/route');
    const response = await POST(makeRequest({ apis: fiveApis }));

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.data.suggestions).toHaveLength(3);
  });

  // ── AI 응답 파싱 엣지 케이스 ──
  it('AI 응답이 코드 블록으로 감싸져 있어도 파싱한다', async () => {
    await setupProvider(mockAiProvider('```json\n["제안1","제안2","제안3"]\n```'));

    const { POST } = await import('@/app/api/v1/suggest-context/route');
    const response = await POST(makeRequest({
      apis: [{ name: 'A', description: 'd', category: 'c' }],
    }));

    const json = await response.json();
    expect(json.data.suggestions).toHaveLength(3);
  });

  it('AI 응답에 추가 텍스트가 있어도 JSON 배열을 추출한다', async () => {
    await setupProvider(mockAiProvider('다음은 제안입니다:\n["제안A","제안B","제안C"]\n참고하세요.'));

    const { POST } = await import('@/app/api/v1/suggest-context/route');
    const response = await POST(makeRequest({
      apis: [{ name: 'A', description: 'd', category: 'c' }],
    }));

    const json = await response.json();
    expect(json.data.suggestions).toEqual(['제안A', '제안B', '제안C']);
  });

  it('AI 응답이 JSON이 아니면 빈 배열을 반환한다', async () => {
    await setupProvider(mockAiProvider('이것은 JSON이 아닌 일반 텍스트입니다.'));

    const { POST } = await import('@/app/api/v1/suggest-context/route');
    const response = await POST(makeRequest({
      apis: [{ name: 'A', description: 'd', category: 'c' }],
    }));

    const json = await response.json();
    expect(json.success).toBe(true);
    expect(json.data.suggestions).toEqual([]);
  });

  it('AI 응답이 빈 배열이면 빈 배열을 반환한다', async () => {
    await setupProvider(mockAiProvider('[]'));

    const { POST } = await import('@/app/api/v1/suggest-context/route');
    const response = await POST(makeRequest({
      apis: [{ name: 'A', description: 'd', category: 'c' }],
    }));

    const json = await response.json();
    expect(json.data.suggestions).toEqual([]);
  });

  it('AI 응답이 4개 이상이면 3개만 반환한다', async () => {
    await setupProvider(mockAiProvider('["a","b","c","d","e"]'));

    const { POST } = await import('@/app/api/v1/suggest-context/route');
    const response = await POST(makeRequest({
      apis: [{ name: 'A', description: 'd', category: 'c' }],
    }));

    const json = await response.json();
    expect(json.data.suggestions).toHaveLength(3);
  });

  // ── AI Provider 에러 처리 ──
  it('AI Provider 생성 실패 시 빈 배열을 반환한다 (500 아님)', async () => {
    const { createClient } = await import('@/lib/supabase/server');
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock() as never);

    const { AiProviderFactory } = await import('@/providers/ai/AiProviderFactory');
    (AiProviderFactory.createForTask as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('ANTHROPIC_API_KEY is not set');
    });

    const { POST } = await import('@/app/api/v1/suggest-context/route');
    const response = await POST(makeRequest({
      apis: [{ name: 'A', description: 'd', category: 'c' }],
    }));

    expect(response.status).toBe(503);
    const json = await response.json();
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('AI_UNAVAILABLE');
  });

  it('AI generateCode 실패 시 502를 반환한다', async () => {
    const error400 = Object.assign(new Error('invalid_request_error'), { status: 400 });
    await setupProvider(mockAiProviderError(error400));

    const { POST } = await import('@/app/api/v1/suggest-context/route');
    const response = await POST(makeRequest({
      apis: [{ name: 'A', description: 'd', category: 'c' }],
    }));

    expect(response.status).toBe(502);
    const json = await response.json();
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('AI_GENERATION_FAILED');
  });

  it('AI generateCode 타임아웃 시 502를 반환한다', async () => {
    const timeoutError = new Error('Request timed out');
    await setupProvider(mockAiProviderError(timeoutError));

    const { POST } = await import('@/app/api/v1/suggest-context/route');
    const response = await POST(makeRequest({
      apis: [{ name: 'A', description: 'd', category: 'c' }],
    }));

    expect(response.status).toBe(502);
    const json = await response.json();
    expect(json.success).toBe(false);
  });

  it('AI generateCode 429 에러 시 502를 반환한다', async () => {
    const error429 = Object.assign(new Error('rate limited'), { status: 429 });
    await setupProvider(mockAiProviderError(error429));

    const { POST } = await import('@/app/api/v1/suggest-context/route');
    const response = await POST(makeRequest({
      apis: [{ name: 'A', description: 'd', category: 'c' }],
    }));

    expect(response.status).toBe(502);
    const json = await response.json();
    expect(json.success).toBe(false);
  });
});
