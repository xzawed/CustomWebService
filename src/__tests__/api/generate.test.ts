import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------- Module mocks ----------
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
  createServiceClient: vi.fn(),
}));

vi.mock('@/lib/auth/index', () => ({
  getAuthUser: vi.fn(),
}));

vi.mock('@/services/factory', () => ({
  createProjectService: vi.fn(),
  createCatalogService: vi.fn(),
  createRateLimitService: vi.fn(),
}));

vi.mock('@/repositories/factory', () => ({
  createCodeRepository: vi.fn(),
  createEventRepository: vi.fn(),
}));

vi.mock('@/providers/ai/AiProviderFactory', () => ({
  AiProviderFactory: {
    create: vi.fn(),
    createForTask: vi.fn(),
  },
}));

vi.mock('@/lib/ai/promptBuilder', () => ({
  buildSystemPrompt: vi.fn().mockReturnValue('system prompt'),
  buildUserPrompt: vi.fn().mockReturnValue('user prompt'),
}));

vi.mock('@/lib/ai/codeParser', () => ({
  parseGeneratedCode: vi.fn().mockReturnValue({
    html: '<div>Hello</div>',
    css: 'div { color: red; }',
    js: '',
  }),
  assembleHtml: vi.fn().mockReturnValue('<!DOCTYPE html><html><body><div>Hello</div></body></html>'),
}));

vi.mock('@/lib/ai/codeValidator', () => ({
  validateAll: vi.fn().mockReturnValue({
    passed: true,
    errors: [],
    warnings: [],
  }),
  evaluateQuality: vi.fn().mockReturnValue({
    structuralScore: 80,
    mobileScore: 80,
    hasSemanticHtml: true,
    hasMockData: true,
    hasInteraction: true,
    hasResponsiveClasses: true,
    hasAdequateResponsive: true,
    noFixedOverflow: true,
    hasImageProtection: true,
    hasMobileNav: true,
    hasFooter: true,
    hasImgAlt: true,
    details: [],
  }),
}));

vi.mock('@/lib/ai/categoryDesignMap', () => ({
  inferDesignFromCategories: vi.fn().mockReturnValue({
    theme: 'clean-light',
    layout: 'hero-tabs-grid',
    useChart: false,
    useMap: false,
    description: 'test',
    allowedSections: ['히어로 섹션', '카테고리 탭', '콘텐츠 카드 그리드'],
  }),
}));

vi.mock('@/lib/ai/qualityLoop', () => ({
  shouldRetryGeneration: vi.fn().mockReturnValue(false),
  buildQualityImprovementPrompt: vi.fn().mockReturnValue('improvement prompt'),
}));

vi.mock('@/lib/events/eventBus', () => ({
  eventBus: { emit: vi.fn() },
}));

vi.mock('@/lib/qc', () => ({
  runFastQc: vi.fn().mockResolvedValue(null),
  runDeepQc: vi.fn().mockResolvedValue(null),
  isQcEnabled: vi.fn().mockReturnValue(false),
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@/lib/config/features', () => ({
  getLimits: vi.fn().mockReturnValue({ maxCodeVersionsPerProject: 5 }),
}));

vi.mock('@/lib/utils/correlationId', () => ({
  getCorrelationId: vi.fn().mockReturnValue('test-correlation-id'),
}));

// ---------- Test data ----------
const mockUser = { id: 'user-1', email: 'test@test.com', name: null, avatarUrl: null };
const mockProject = {
  id: 'proj-1',
  name: '테스트 프로젝트',
  userId: 'user-1',
  context: 'a'.repeat(100),
  status: 'draft',
  metadata: {},
};
const mockApis = [{
  id: 'api-1',
  name: 'Test API',
  description: 'desc',
  category: 'test',
  baseUrl: 'https://api.example.com',
  authType: 'none' as const,
  authConfig: {},
  rateLimit: null,
  isActive: true,
  iconUrl: null,
  docsUrl: null,
  endpoints: [{ path: '/data', method: 'GET' as const, description: 'Get data', params: [], responseExample: {} }],
  tags: [],
  apiVersion: null,
  deprecatedAt: null,
  successorId: null,
  corsSupported: true,
  requiresProxy: false,
  creditRequired: null,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
}];
const mockAiResponse = {
  content: '<html>...</html>',
  provider: 'claude',
  model: 'claude-sonnet-4-6',
  durationMs: 1500,
  tokensUsed: { input: 100, output: 200 },
};
const mockSavedCode = { id: 'code-1', projectId: 'proj-1', version: 1 };

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/v1/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function setupHappyPath() {
  const { getAuthUser } = await import('@/lib/auth/index');
  vi.mocked(getAuthUser).mockResolvedValue(mockUser);

  const { createProjectService, createCatalogService, createRateLimitService } = await import('@/services/factory');
  vi.mocked(createProjectService).mockReturnValue({
    getById: vi.fn().mockResolvedValue(mockProject),
    getProjectApiIds: vi.fn().mockResolvedValue(['api-1']),
    updateStatus: vi.fn().mockResolvedValue(undefined),
  } as never);
  vi.mocked(createCatalogService).mockReturnValue({
    getByIds: vi.fn().mockResolvedValue(mockApis),
  } as never);
  vi.mocked(createRateLimitService).mockReturnValue({
    checkAndIncrementDailyLimit: vi.fn().mockResolvedValue(undefined),
    decrementDailyLimit: vi.fn().mockResolvedValue(undefined),
  } as never);

  const { createCodeRepository, createEventRepository } = await import('@/repositories/factory');
  vi.mocked(createCodeRepository).mockReturnValue({
    getNextVersion: vi.fn().mockResolvedValue(1),
    create: vi.fn().mockResolvedValue(mockSavedCode),
    delete: vi.fn().mockResolvedValue(undefined),
    pruneOldVersions: vi.fn().mockResolvedValue(undefined),
  } as never);
  vi.mocked(createEventRepository).mockReturnValue({
    persistAsync: vi.fn(),
  } as never);

  const { AiProviderFactory } = await import('@/providers/ai/AiProviderFactory');
  vi.mocked(AiProviderFactory.createForTask).mockReturnValue({
    name: 'claude',
    generateCodeStream: vi.fn().mockImplementation((_prompt: unknown, onChunk: (chunk: string, accumulated: string) => void) => {
      onChunk(mockAiResponse.content, mockAiResponse.content);
      return Promise.resolve(mockAiResponse);
    }),
  } as never);
}

// ---------- Tests ----------
describe('POST /api/v1/generate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('비로그인 시 401을 반환한다', async () => {
    const { getAuthUser } = await import('@/lib/auth/index');
    vi.mocked(getAuthUser).mockResolvedValue(null);

    const { POST } = await import('@/app/api/v1/generate/route');
    const response = await POST(makeRequest({ projectId: 'proj-1' }));
    expect(response.status).toBe(401);
  });

  it('projectId 없으면 400을 반환한다', async () => {
    const { getAuthUser } = await import('@/lib/auth/index');
    vi.mocked(getAuthUser).mockResolvedValue(mockUser);

    const { createRateLimitService } = await import('@/services/factory');
    vi.mocked(createRateLimitService).mockReturnValue({
      checkAndIncrementDailyLimit: vi.fn().mockResolvedValue(undefined),
      decrementDailyLimit: vi.fn().mockResolvedValue(undefined),
    } as never);

    const { POST } = await import('@/app/api/v1/generate/route');
    const response = await POST(makeRequest({}));
    expect(response.status).toBe(400);
  });

  it('잘못된 JSON이면 400을 반환한다', async () => {
    const { getAuthUser } = await import('@/lib/auth/index');
    vi.mocked(getAuthUser).mockResolvedValue(mockUser);

    const { POST } = await import('@/app/api/v1/generate/route');
    const request = new Request('http://localhost/api/v1/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it('정상 요청 시 SSE 스트림을 반환한다', async () => {
    await setupHappyPath();

    const { POST } = await import('@/app/api/v1/generate/route');
    const response = await POST(makeRequest({ projectId: 'proj-1' }));

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/event-stream; charset=utf-8');
    expect(response.headers.get('Cache-Control')).toBe('no-cache');
  });

  it('정상 요청 시 SSE 스트림에 complete 이벤트가 포함된다', async () => {
    await setupHappyPath();

    const { POST } = await import('@/app/api/v1/generate/route');
    const response = await POST(makeRequest({ projectId: 'proj-1' }));

    const text = await response.text();
    expect(text).toContain('event: complete');
    expect(text).toContain('event: progress');
    expect(text).toContain('"step":"analyzing"');
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

    const { POST } = await import('@/app/api/v1/generate/route');
    const response = await POST(makeRequest({ projectId: 'proj-1' }));
    expect(response.status).toBe(429);
  });

  it('AI 생성 실패 시 SSE error 이벤트를 전송하고 레이트리밋을 보상한다', async () => {
    await setupHappyPath();

    const { AiProviderFactory } = await import('@/providers/ai/AiProviderFactory');
    vi.mocked(AiProviderFactory.createForTask).mockReturnValue({
      name: 'claude',
      generateCodeStream: vi.fn().mockRejectedValue(new Error('AI service unavailable')),
    } as never);

    const decrementMock = vi.fn().mockResolvedValue(undefined);
    const { createRateLimitService } = await import('@/services/factory');
    vi.mocked(createRateLimitService).mockReturnValue({
      checkAndIncrementDailyLimit: vi.fn().mockResolvedValue(undefined),
      decrementDailyLimit: decrementMock,
    } as never);

    const { POST } = await import('@/app/api/v1/generate/route');
    const response = await POST(makeRequest({ projectId: 'proj-1' }));

    const text = await response.text();
    expect(text).toContain('event: error');
    expect(decrementMock).toHaveBeenCalledWith('user-1');
  });

  it('보안 검증 실패 시 SSE error 이벤트를 전송한다', async () => {
    await setupHappyPath();

    const { validateAll } = await import('@/lib/ai/codeValidator');
    vi.mocked(validateAll).mockReturnValue({
      passed: false,
      errors: ['XSS detected'],
      warnings: [],
    });

    const { POST } = await import('@/app/api/v1/generate/route');
    const response = await POST(makeRequest({ projectId: 'proj-1' }));

    const text = await response.text();
    expect(text).toContain('event: error');
    expect(text).toContain('보안 문제');
  });

  it('templateId 전달 시 buildSystemPrompt가 템플릿 힌트와 함께 호출된다', async () => {
    await setupHappyPath();

    const { buildSystemPrompt } = await import('@/lib/ai/promptBuilder');

    const { POST } = await import('@/app/api/v1/generate/route');
    await POST(makeRequest({ projectId: 'proj-1', templateId: 'dashboard' }));

    // 'dashboard' template은 TemplateRegistry에 등록되어 있으며 promptHint에 'Chart.js'를 포함함
    expect(vi.mocked(buildSystemPrompt)).toHaveBeenCalledWith(
      expect.stringContaining('Chart.js')
    );
  });
});
