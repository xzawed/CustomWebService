import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------- Module mocks ----------
vi.mock('@/providers/ai/AiProviderFactory', () => ({
  AiProviderFactory: {
    createForTask: vi.fn(),
  },
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ---------- Helpers ----------
function makeProvider(content: string) {
  return {
    name: 'claude',
    model: 'claude-haiku-4-5',
    generateCode: vi.fn().mockResolvedValue({
      content,
      provider: 'claude',
      model: 'claude-haiku-4-5',
      durationMs: 300,
      tokensUsed: { input: 40, output: 60 },
    }),
    generateCodeStream: vi.fn(),
    checkAvailability: vi.fn(),
  };
}

// ---------- Tests ----------
describe('suggestSlugs()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('정상 응답 → 3개 반환, 모두 유효한 slug 형식', async () => {
    const { AiProviderFactory } = await import('@/providers/ai/AiProviderFactory');
    vi.mocked(AiProviderFactory.createForTask).mockReturnValue(
      makeProvider('["weather-app", "daily-forecast", "rain-checker"]') as never,
    );

    const { suggestSlugs } = await import('./slugSuggester');
    const result = await suggestSlugs({ context: '날씨 정보를 보여주는 대시보드' });

    expect(result).toHaveLength(3);
    expect(result).toEqual(['weather-app', 'daily-forecast', 'rain-checker']);
    // 모두 유효한 slug 형식: 소문자 영문/숫자/하이픈, 3자 이상
    for (const slug of result) {
      expect(slug).toMatch(/^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/);
    }
  });

  it('AI가 예약어(admin, dashboard)를 응답에 포함 → isValidSlug()로 필터링됨', async () => {
    const { AiProviderFactory } = await import('@/providers/ai/AiProviderFactory');
    vi.mocked(AiProviderFactory.createForTask).mockReturnValue(
      makeProvider('["admin", "dashboard", "my-weather-app"]') as never,
    );

    const { suggestSlugs } = await import('./slugSuggester');
    const result = await suggestSlugs({ context: '날씨 앱' });

    // admin, dashboard 는 RESERVED_SLUGS — 필터링되어야 함
    expect(result).not.toContain('admin');
    expect(result).not.toContain('dashboard');
    expect(result).toContain('my-weather-app');
    expect(result).toHaveLength(1);
  });

  it('AI 에러(throw) → 빈 배열 반환 (에러 전파 없음)', async () => {
    const { AiProviderFactory } = await import('@/providers/ai/AiProviderFactory');
    vi.mocked(AiProviderFactory.createForTask).mockReturnValue({
      name: 'claude',
      model: 'claude-haiku-4-5',
      generateCode: vi.fn().mockRejectedValue(new Error('API 연결 실패')),
      generateCodeStream: vi.fn(),
      checkAvailability: vi.fn(),
    } as never);

    const { suggestSlugs } = await import('./slugSuggester');
    await expect(suggestSlugs({ context: '테스트 서비스' })).resolves.toEqual([]);
  });

  it('응답에 중복 slug 포함 → 중복 제거됨', async () => {
    const { AiProviderFactory } = await import('@/providers/ai/AiProviderFactory');
    vi.mocked(AiProviderFactory.createForTask).mockReturnValue(
      makeProvider('["my-app", "my-app", "my-app"]') as never,
    );

    const { suggestSlugs } = await import('./slugSuggester');
    const result = await suggestSlugs({ context: '중복 테스트' });

    expect(result).toHaveLength(1);
    expect(result).toEqual(['my-app']);
  });

  it('50자 초과 slug → toSlug().slice(0,50) 후 isValidSlug() 통과하면 포함', async () => {
    const longSlug = 'a-very-long-slug-that-exceeds-fifty-characters-in-total-length-yes';
    expect(longSlug.length).toBeGreaterThan(50);

    const { AiProviderFactory } = await import('@/providers/ai/AiProviderFactory');
    vi.mocked(AiProviderFactory.createForTask).mockReturnValue(
      makeProvider(`["${longSlug}", "short-slug", "another-slug"]`) as never,
    );

    const { suggestSlugs } = await import('./slugSuggester');
    const result = await suggestSlugs({ context: '긴 slug 테스트' });

    // 잘린 slug가 포함되거나, isValidSlug 실패로 제외될 수 있음
    // 어떤 경우든 50자를 초과하는 slug는 없어야 함
    for (const slug of result) {
      expect(slug.length).toBeLessThanOrEqual(50);
    }
    expect(result).toContain('short-slug');
    expect(result).toContain('another-slug');
  });

  it('pageTitle과 categoryHints 있을 때 user prompt에 포함됨', async () => {
    const { AiProviderFactory } = await import('@/providers/ai/AiProviderFactory');
    const mockProvider = makeProvider('["news-reader", "daily-news", "news-feed"]');
    vi.mocked(AiProviderFactory.createForTask).mockReturnValue(mockProvider as never);

    const { suggestSlugs } = await import('./slugSuggester');
    await suggestSlugs({
      context: '뉴스를 보여주는 서비스',
      pageTitle: 'Daily News Dashboard',
      categoryHints: ['news', 'media'],
    });

    expect(mockProvider.generateCode).toHaveBeenCalledOnce();
    const callArgs = mockProvider.generateCode.mock.calls[0][0] as { user: string };
    expect(callArgs.user).toContain('Daily News Dashboard');
    expect(callArgs.user).toContain('news');
    expect(callArgs.user).toContain('media');
  });
});
