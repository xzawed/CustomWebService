import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------- Module mocks ----------
// 재생성 라우트(src/app/api/v1/generate/regenerate/route.ts)의 고유 가드를 검증한다.
// generate.test.ts와 동일한 모킹 컨벤션을 따르되, 무거운 AI 파이프라인은 runGenerationPipeline
// 자체를 모킹해 실제 Anthropic 호출을 차단한다(generate.test는 provider까지 실제로 태우지만,
// 재생성 테스트의 관심사는 파이프라인 진입 전 가드이므로 파이프라인을 통째로 no-op 처리한다).

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
  createProjectRepository: vi.fn(),
}));

// 중복 파이프라인 차단은 DB 락(generation_locks)이 담당한다 — 라우트는 락 모듈만 알면 된다.
vi.mock('@/lib/ai/generationLock', () => ({
  acquireGenerationLock: vi.fn().mockResolvedValue(true),
  releaseGenerationLock: vi.fn().mockResolvedValue(undefined),
  startLockHeartbeat: vi.fn().mockReturnValue(() => {}),
}));

vi.mock('@/lib/events/eventPersister', () => ({
  registerEventPersister: vi.fn(),
}));

vi.mock('@/lib/monitoring/errorRateMonitor', () => ({
  registerErrorRateMonitor: vi.fn(),
}));

vi.mock('@/lib/ai/promptBuilder', () => ({
  buildStage1SystemPrompt: vi.fn().mockReturnValue('stage1 system'),
  buildStage1RegenerationUserPrompt: vi.fn().mockReturnValue('stage1 regen user'),
  buildStage2SystemPrompt: vi.fn().mockReturnValue('stage2 system'),
  buildStage2RegenerationUserPrompt: vi.fn().mockReturnValue('stage2 regen user'),
  buildStage2FunctionSystemPrompt: vi.fn().mockReturnValue('stage2 function system'),
  buildStage2FunctionRegenerationUserPrompt: vi.fn().mockReturnValue('stage2 function regen user'),
}));

vi.mock('@/lib/ai/generationPipeline', () => ({
  runGenerationPipeline: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/config/features', () => ({
  // 재생성 라우트는 limits.maxRegenerationsPerProject만 사용한다.
  getLimits: vi.fn().mockReturnValue({ maxRegenerationsPerProject: 5 }),
}));

vi.mock('@/lib/utils/correlationId', () => ({
  getCorrelationId: vi.fn().mockReturnValue('test-correlation-id'),
}));

vi.mock('@/lib/auth/verifiedGuard', () => ({
  assertEmailVerified: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/config/featureFlags', () => ({ isFeatureEnabled: vi.fn(() => true) }));

vi.mock('@/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ---------- Test data ----------
const PROJECT_ID = '11111111-1111-4111-a111-111111111111';
const FEEDBACK = '헤더를 더 눈에 띄게 바꿔주세요.';

const mockUser = { id: 'user-1', email: 'test@test.com', name: null, avatarUrl: null };
const mockProject = {
  id: PROJECT_ID,
  name: '테스트 프로젝트',
  userId: 'user-1',
  context: 'a'.repeat(100),
  status: 'generated',
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
const mockPreviousCode = {
  id: 'code-prev',
  projectId: PROJECT_ID,
  version: 1,
  codeHtml: '<div>old</div>',
  codeCss: 'div { color: blue; }',
  codeJs: '',
};

interface ApiErrorBody {
  success: boolean;
  error: { code: string; message: string };
}

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/v1/generate/regenerate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/**
 * 정상 재생성이 가능한 상태로 모든 팩토리 목을 배선한다.
 * decrementDailyLimit 스파이를 반환해 환불 검증에 재사용한다.
 */
async function setupHappyPath(overrides?: {
  getNextVersion?: number;
  previousCode?: typeof mockPreviousCode | null;
  getByIdReject?: Error;
}): Promise<{ decrementMock: ReturnType<typeof vi.fn> }> {
  const { getAuthUser } = await import('@/lib/auth/index');
  vi.mocked(getAuthUser).mockResolvedValue(mockUser);

  const { createProjectService, createCatalogService, createRateLimitService } = await import('@/services/factory');

  const getByIdMock = overrides?.getByIdReject
    ? vi.fn().mockRejectedValue(overrides.getByIdReject)
    : vi.fn().mockResolvedValue(mockProject);

  vi.mocked(createProjectService).mockReturnValue({
    getById: getByIdMock,
    getProjectApiIds: vi.fn().mockResolvedValue(['api-1']),
    updateStatus: vi.fn().mockResolvedValue(undefined),
  } as never);
  vi.mocked(createCatalogService).mockReturnValue({
    getByIds: vi.fn().mockResolvedValue(mockApis),
  } as never);

  const decrementMock = vi.fn().mockResolvedValue(undefined);
  vi.mocked(createRateLimitService).mockReturnValue({
    checkAndIncrementDailyLimit: vi.fn().mockResolvedValue({ charged: true }),
    decrementDailyLimit: decrementMock,
  } as never);

  const { createCodeRepository, createProjectRepository } = await import('@/repositories/factory');
  vi.mocked(createCodeRepository).mockReturnValue({
    getNextVersion: vi.fn().mockResolvedValue(overrides?.getNextVersion ?? 2),
    findByProject: vi.fn().mockResolvedValue(
      overrides?.previousCode === undefined ? mockPreviousCode : overrides.previousCode,
    ),
    create: vi.fn().mockResolvedValue({ id: 'code-new', projectId: PROJECT_ID, version: 2 }),
    delete: vi.fn().mockResolvedValue(undefined),
    pruneOldVersions: vi.fn().mockResolvedValue(undefined),
  } as never);
  vi.mocked(createProjectRepository).mockReturnValue({
    updateSuggestedSlugs: vi.fn().mockResolvedValue(undefined),
  } as never);

  return { decrementMock };
}

// ---------- Tests ----------
describe('POST /api/v1/generate/regenerate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('비로그인 시 401을 반환한다', async () => {
    const { getAuthUser } = await import('@/lib/auth/index');
    vi.mocked(getAuthUser).mockResolvedValue(null);

    const { POST } = await import('@/app/api/v1/generate/regenerate/route');
    const response = await POST(makeRequest({ projectId: PROJECT_ID, feedback: FEEDBACK }));
    expect(response.status).toBe(401);
  });

  it('생성 킬스위치가 꺼져 있으면 503을 반환하고 일일 한도를 차감하지 않는다', async () => {
    const { getAuthUser } = await import('@/lib/auth/index');
    vi.mocked(getAuthUser).mockResolvedValue(mockUser);

    const { isFeatureEnabled } = await import('@/lib/config/featureFlags');
    vi.mocked(isFeatureEnabled).mockReturnValue(false);

    const { createRateLimitService } = await import('@/services/factory');
    const checkAndIncrementDailyLimit = vi.fn();
    vi.mocked(createRateLimitService).mockReturnValue({
      checkAndIncrementDailyLimit,
      decrementDailyLimit: vi.fn().mockResolvedValue(undefined),
    } as never);

    try {
      const { POST } = await import('@/app/api/v1/generate/regenerate/route');
      const response = await POST(makeRequest({ projectId: PROJECT_ID, feedback: FEEDBACK }));

      expect(response.status).toBe(503);
      const body = (await response.json()) as ApiErrorBody;
      expect(body.error.code).toBe('GENERATION_DISABLED');
      expect(checkAndIncrementDailyLimit).not.toHaveBeenCalled();
    } finally {
      vi.mocked(isFeatureEnabled).mockReturnValue(true);
    }
  });

  it('feedback가 없으면 400을 반환한다', async () => {
    const { getAuthUser } = await import('@/lib/auth/index');
    vi.mocked(getAuthUser).mockResolvedValue(mockUser);

    const { POST } = await import('@/app/api/v1/generate/regenerate/route');
    const response = await POST(makeRequest({ projectId: PROJECT_ID }));
    expect(response.status).toBe(400);
  });

  it('projectId가 uuid가 아니면 400을 반환한다', async () => {
    const { getAuthUser } = await import('@/lib/auth/index');
    vi.mocked(getAuthUser).mockResolvedValue(mockUser);

    const { POST } = await import('@/app/api/v1/generate/regenerate/route');
    const response = await POST(makeRequest({ projectId: 'not-a-uuid', feedback: FEEDBACK }));
    expect(response.status).toBe(400);
  });

  it('잘못된 JSON이면 400을 반환한다', async () => {
    const { getAuthUser } = await import('@/lib/auth/index');
    vi.mocked(getAuthUser).mockResolvedValue(mockUser);

    const { POST } = await import('@/app/api/v1/generate/regenerate/route');
    const request = new Request('http://localhost/api/v1/generate/regenerate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it('타인 프로젝트(소유자 아님)면 403을 반환한다', async () => {
    const { ForbiddenError } = await import('@/lib/utils/errors');
    await setupHappyPath({ getByIdReject: new ForbiddenError() });

    const { POST } = await import('@/app/api/v1/generate/regenerate/route');
    const response = await POST(makeRequest({ projectId: PROJECT_ID, feedback: FEEDBACK }));
    expect(response.status).toBe(403);
  });

  it('일일 생성 한도 초과 시 429를 반환하고 환불하지 않는다', async () => {
    const { getAuthUser } = await import('@/lib/auth/index');
    vi.mocked(getAuthUser).mockResolvedValue(mockUser);

    const { RateLimitError } = await import('@/lib/utils/errors');
    const { createRateLimitService } = await import('@/services/factory');
    const decrementMock = vi.fn().mockResolvedValue(undefined);
    vi.mocked(createRateLimitService).mockReturnValue({
      checkAndIncrementDailyLimit: vi.fn().mockRejectedValue(new RateLimitError('일일 생성 한도를 초과했습니다.')),
      decrementDailyLimit: decrementMock,
    } as never);

    const { POST } = await import('@/app/api/v1/generate/regenerate/route');
    const response = await POST(makeRequest({ projectId: PROJECT_ID, feedback: FEEDBACK }));

    expect(response.status).toBe(429);
    // checkAndIncrement가 던지기 전이라 pendingDecrement가 아직 설정되지 않음 → 환불 없음
    expect(decrementMock).not.toHaveBeenCalled();
  });

  it('프로젝트당 최대 재생성 횟수를 초과하면 429를 반환하고 일일 한도를 환불한다', async () => {
    // getNextVersion=6, limits=5 → (6-1)=5 >= 5 → RateLimitError
    const { decrementMock } = await setupHappyPath({ getNextVersion: 6 });

    const { POST } = await import('@/app/api/v1/generate/regenerate/route');
    const response = await POST(makeRequest({ projectId: PROJECT_ID, feedback: FEEDBACK }));

    expect(response.status).toBe(429);
    const body = (await response.json()) as ApiErrorBody;
    expect(body.error.message).toContain('재생성');
    // 일일 카운터는 이미 증가했으므로 실패 시 환불되어야 한다
    expect(decrementMock).toHaveBeenCalledWith('user-1');
  });

  it('재생성할 기존 코드가 없으면 404를 반환하고 일일 한도를 환불한다', async () => {
    const { decrementMock } = await setupHappyPath({ getNextVersion: 2, previousCode: null });

    const { POST } = await import('@/app/api/v1/generate/regenerate/route');
    const response = await POST(makeRequest({ projectId: PROJECT_ID, feedback: FEEDBACK }));

    expect(response.status).toBe(404);
    const body = (await response.json()) as ApiErrorBody;
    expect(body.error.message).toContain('재생성할 기존 코드');
    expect(decrementMock).toHaveBeenCalledWith('user-1');
  });

  it('이미 생성 중이면 409를 반환하고 차감한 일일 한도를 복구한다', async () => {
    const { decrementMock } = await setupHappyPath();

    const { generationTracker } = await import('@/lib/ai/generationTracker');
    const startSpy = vi.spyOn(generationTracker, 'start');

    const { acquireGenerationLock } = await import('@/lib/ai/generationLock');
    vi.mocked(acquireGenerationLock).mockResolvedValueOnce(false);

    const { POST } = await import('@/app/api/v1/generate/regenerate/route');
    const response = await POST(makeRequest({ projectId: PROJECT_ID, feedback: FEEDBACK }));

    expect(response.status).toBe(409);
    const body = (await response.json()) as ApiErrorBody;
    expect(body.error.code).toBe('GENERATION_IN_PROGRESS');
    expect(decrementMock).toHaveBeenCalledWith('user-1');
    // 409 분기는 파이프라인 진입 전에 반환하므로 tracker.start는 호출되지 않아야 한다
    expect(startSpy).not.toHaveBeenCalled();
  });

  it('정상 재생성 시 200 SSE 스트림을 반환하고 파이프라인을 userFeedback과 함께 호출한다', async () => {
    await setupHappyPath();

    const { generationTracker } = await import('@/lib/ai/generationTracker');
    const startSpy = vi.spyOn(generationTracker, 'start');

    const { runGenerationPipeline } = await import('@/lib/ai/generationPipeline');

    const { POST } = await import('@/app/api/v1/generate/regenerate/route');
    const response = await POST(makeRequest({ projectId: PROJECT_ID, feedback: FEEDBACK }));

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/event-stream; charset=utf-8');
    expect(response.headers.get('Cache-Control')).toBe('no-cache');

    // 스트림 start 콜백(파이프라인 실행)이 완료되도록 본문을 소진한다
    await response.text();

    expect(startSpy).toHaveBeenCalledWith(PROJECT_ID, 'user-1');
    expect(vi.mocked(runGenerationPipeline)).toHaveBeenCalledTimes(1);
    const [input] = vi.mocked(runGenerationPipeline).mock.calls[0];
    expect(input.projectId).toBe(PROJECT_ID);
    expect(input.userId).toBe('user-1');
    expect(input.extraMetadata).toEqual({ userFeedback: FEEDBACK });
  });
});
