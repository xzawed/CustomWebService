import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ICodeRepository, IProjectRepository } from '@/repositories/interfaces';
import type { SseWriter } from '@/lib/ai/sseWriter';
import type { ApiCatalogItem } from '@/types/api';
import type { QcReport } from '@/types/qc';
import type { QualityMetrics, ValidationResult } from '@/lib/ai/codeValidator';
import type { SaveParams } from './generationSaver';

vi.mock('@/lib/events/eventBus', () => ({
  eventBus: { emit: vi.fn() },
}));
vi.mock('@/lib/config/features', () => ({
  getLimits: vi.fn().mockReturnValue({ maxCodeVersionsPerProject: 10 }),
}));
vi.mock('@/lib/qc', () => ({
  isQcEnabled: vi.fn().mockReturnValue(false),
}));
vi.mock('@/lib/ai/categoryDesignMap', () => ({
  inferDesignFromCategories: vi.fn().mockReturnValue({ theme: 'light', layout: 'grid' }),
}));
vi.mock('@/lib/ai/slugSuggester', () => ({
  suggestSlugs: vi.fn().mockResolvedValue([]),
}));
vi.mock('@/lib/utils/htmlTitle', () => ({
  extractTitle: vi.fn().mockReturnValue('Test Title'),
}));
vi.mock('@/lib/ai/generationTracker', () => ({
  generationTracker: { updateProgress: vi.fn(), complete: vi.fn() },
}));
vi.mock('@/lib/qc/deepQcRunner', () => ({
  runDeepQcAndUpdate: vi.fn(),
}));
vi.mock('@/lib/utils/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));
vi.mock('@/lib/ai/codeValidator', () => ({
  validateAll: vi.fn().mockReturnValue({ passed: true, errors: [], warnings: [] }),
  evaluateQuality: vi.fn().mockReturnValue({ structuralScore: 80, mobileScore: 80, details: [], fetchCallCount: 0, placeholderCount: 0 }),
}));
vi.mock('@/lib/config/providers', () => ({
  getDbProvider: vi.fn().mockReturnValue('supabase'),
}));
vi.mock('@/lib/db/connection', () => ({
  getDb: vi.fn(),
}));
vi.mock('@/repositories/utils', () => ({
  toDatabaseRow: vi.fn().mockImplementation((x: unknown) => x),
}));
vi.mock('@/repositories/drizzle/DrizzleCodeRepository', () => ({
  codeRowToDomain: vi.fn().mockImplementation((row: Record<string, unknown>) => ({
    ...row,
    id: row.id ?? 'code-1',
    projectId: row.project_id ?? 'proj-1',
    version: row.version ?? 1,
    codeHtml: '',
    codeCss: '',
    codeJs: '',
    createdAt: String(new Date()),
  })),
}));
vi.mock('@/lib/db/schema', () => ({
  generatedCodes: { $inferInsert: {} },
  projects: {},
}));
vi.mock('@/lib/db/failover', () => ({
  isInFailover: vi.fn().mockReturnValue(false),
  reportFailure: vi.fn(),
}));
vi.mock('drizzle-orm', () => ({
  eq: vi.fn().mockReturnValue('eq-condition'),
}));

// ─────────────────────────────────────────────
// 헬퍼 함수
// ─────────────────────────────────────────────
function makeMockCodeRepo() {
  return {
    getNextVersion: vi.fn().mockResolvedValue(1),
    create: vi.fn().mockResolvedValue({
      id: 'code-1',
      projectId: 'proj-1',
      version: 1,
      codeHtml: '',
      codeCss: '',
      codeJs: '',
      createdAt: '2026-04-26',
    }),
    pruneOldVersions: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    findById: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
    findByProject: vi.fn(),
    countByProject: vi.fn(),
  } as unknown as ICodeRepository;
}

function makeMockProjectService(): { updateStatus: (id: string, status: 'generated') => Promise<unknown> } {
  return {
    updateStatus: vi.fn().mockResolvedValue(undefined) as unknown as (id: string, status: 'generated') => Promise<unknown>,
  };
}

function makeMockSse() {
  return {
    send: vi.fn(),
    isCancelled: vi.fn().mockReturnValue(false),
  } as unknown as SseWriter & { send: ReturnType<typeof vi.fn>; isCancelled: ReturnType<typeof vi.fn> };
}

const mockApis: ApiCatalogItem[] = [
  {
    id: 'api-1',
    name: 'Test API',
    description: 'Test',
    category: 'utility',
    baseUrl: 'https://api.example.com',
    authType: 'none',
    authConfig: {},
    rateLimit: null,
    isActive: true,
    iconUrl: null,
    docsUrl: null,
    endpoints: [],
    tags: [],
    apiVersion: null,
    deprecatedAt: null,
    successorId: null,
    corsSupported: true,
    requiresProxy: false,
    creditRequired: null,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  },
];

const mockQuality: QualityMetrics = {
  structuralScore: 80,
  mobileScore: 75,
  hasSemanticHtml: true,
  hasMockData: false,
  hasInteraction: true,
  hasResponsiveClasses: true,
  hasAdequateResponsive: true,
  noFixedOverflow: true,
  hasImageProtection: true,
  hasMobileNav: false,
  hasFooter: true,
  hasImgAlt: true,
  fetchCallCount: 0,
  hasProxyCall: false,
  hasJsonParse: false,
  placeholderCount: 0,
  hardcodedArrayCount: 0,
  details: [],
};

const mockValidation: ValidationResult = { passed: true, errors: [], warnings: [] };

function makeBaseParams(overrides?: {
  codeRepo?: ICodeRepository;
  projectService?: { updateStatus: (id: string, status: 'generated') => Promise<unknown> };
  qcReport?: QcReport | null;
  projectRepo?: IProjectRepository;
  projectContext?: string;
}): SaveParams {
  return {
    projectId: 'proj-1',
    userId: 'user-1',
    correlationId: 'corr-1',
    parsed: { html: '<html/>', css: 'body{}', js: '' },
    quality: mockQuality,
    qcReport: overrides?.qcReport !== undefined ? overrides.qcReport : null,
    qualityLoopUsed: false,
    validation: mockValidation,
    apis: mockApis,
    stage2Response: {
      provider: 'anthropic',
      model: 'claude-opus-4-7',
      durationMs: 1000,
      tokensUsed: { input: 100, output: 200 },
    },
    userPromptUsed: 'test prompt',
    codeRepo: overrides?.codeRepo ?? makeMockCodeRepo(),
    projectService: overrides?.projectService ?? makeMockProjectService(),
    ...(overrides?.projectRepo && { projectRepo: overrides.projectRepo }),
    ...(overrides?.projectContext && { projectContext: overrides.projectContext }),
  } as SaveParams;
}

describe('saveGeneratedCode() — Supabase 경로', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('codeRepo.getNextVersion을 projectId로 호출한다', async () => {
    const { saveGeneratedCode } = await import('./generationSaver');
    const codeRepo = makeMockCodeRepo();
    const sse = makeMockSse();

    await saveGeneratedCode(makeBaseParams({ codeRepo }), sse);

    expect(codeRepo.getNextVersion).toHaveBeenCalledWith('proj-1');
  });

  it("sse.send('progress', {step:'saving', progress:95})를 호출한다", async () => {
    const { saveGeneratedCode } = await import('./generationSaver');
    const codeRepo = makeMockCodeRepo();
    const sse = makeMockSse();

    await saveGeneratedCode(makeBaseParams({ codeRepo }), sse);

    expect(sse.send).toHaveBeenCalledWith(
      'progress',
      expect.objectContaining({ step: 'saving', progress: 95 })
    );
  });

  it('codeRepo.create를 호출한다', async () => {
    const { saveGeneratedCode } = await import('./generationSaver');
    const codeRepo = makeMockCodeRepo();
    const sse = makeMockSse();

    await saveGeneratedCode(makeBaseParams({ codeRepo }), sse);

    expect(codeRepo.create).toHaveBeenCalled();
  });

  it("projectService.updateStatus('proj-1', 'generated')를 호출한다", async () => {
    const { saveGeneratedCode } = await import('./generationSaver');
    const projectService = makeMockProjectService();
    const sse = makeMockSse();

    await saveGeneratedCode(makeBaseParams({ projectService }), sse);

    expect(projectService.updateStatus).toHaveBeenCalledWith('proj-1', 'generated');
  });

  it('codeRepo.pruneOldVersions를 호출한다', async () => {
    const { saveGeneratedCode } = await import('./generationSaver');
    const codeRepo = makeMockCodeRepo();
    const sse = makeMockSse();

    await saveGeneratedCode(makeBaseParams({ codeRepo }), sse);

    expect(codeRepo.pruneOldVersions).toHaveBeenCalledWith('proj-1', 10);
  });

  it('eventBus.emit을 CODE_GENERATED 타입으로 호출한다', async () => {
    const { saveGeneratedCode } = await import('./generationSaver');
    const { eventBus } = await import('@/lib/events/eventBus');
    const sse = makeMockSse();

    await saveGeneratedCode(makeBaseParams(), sse);

    expect(eventBus.emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'CODE_GENERATED' })
    );
  });

  it('generationTracker.complete를 호출한다', async () => {
    const { saveGeneratedCode } = await import('./generationSaver');
    const { generationTracker } = await import('@/lib/ai/generationTracker');
    const sse = makeMockSse();

    await saveGeneratedCode(makeBaseParams(), sse);

    expect(generationTracker.complete).toHaveBeenCalledWith(
      'proj-1',
      expect.objectContaining({ projectId: 'proj-1', version: 1 })
    );
  });

  it("sse.send('complete', ...)를 호출한다", async () => {
    const { saveGeneratedCode } = await import('./generationSaver');
    const sse = makeMockSse();

    await saveGeneratedCode(makeBaseParams(), sse);

    expect(sse.send).toHaveBeenCalledWith(
      'complete',
      expect.objectContaining({ projectId: 'proj-1', version: 1 })
    );
  });

  it('updateStatus 실패 → codeRepo.delete를 호출하고 에러를 다시 던진다', async () => {
    const { saveGeneratedCode } = await import('./generationSaver');
    const codeRepo = makeMockCodeRepo();
    const updateError = new Error('DB update failed');
    const projectService: { updateStatus: (id: string, status: 'generated') => Promise<unknown> } = {
      updateStatus: vi.fn().mockRejectedValue(updateError) as unknown as (id: string, status: 'generated') => Promise<unknown>,
    };
    const sse = makeMockSse();

    await expect(
      saveGeneratedCode(makeBaseParams({ codeRepo, projectService }), sse)
    ).rejects.toThrow('DB update failed');

    expect(codeRepo.delete).toHaveBeenCalledWith('code-1');
  });

  it('pruneOldVersions 실패 → 에러를 무시하고 logger.warn을 호출한다', async () => {
    const { saveGeneratedCode } = await import('./generationSaver');
    const codeRepo = makeMockCodeRepo();
    (codeRepo.pruneOldVersions as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('prune failed')
    );
    const { logger } = await import('@/lib/utils/logger');
    const sse = makeMockSse();

    // 에러를 던지지 않아야 함
    await expect(
      saveGeneratedCode(makeBaseParams({ codeRepo }), sse)
    ).resolves.toBeUndefined();

    expect(logger.warn).toHaveBeenCalled();
  });

  it('isQcEnabled=true & qcReport.passed=false → runDeepQcAndUpdate를 호출한다', async () => {
    const { isQcEnabled } = await import('@/lib/qc');
    vi.mocked(isQcEnabled).mockReturnValue(true);

    const { saveGeneratedCode } = await import('./generationSaver');
    const { runDeepQcAndUpdate } = await import('@/lib/qc/deepQcRunner');
    const sse = makeMockSse();

    const failedQcReport: QcReport = {
      overallScore: 30,
      passed: false,
      checks: [
        { name: 'render', passed: false, score: 30, details: ['failed'], durationMs: 100 },
      ],
      viewportsTested: [1024],
      durationMs: 200,
      timestamp: '2026-04-26T00:00:00Z',
    };

    await saveGeneratedCode(makeBaseParams({ qcReport: failedQcReport }), sse);

    expect(runDeepQcAndUpdate).toHaveBeenCalled();

    // 초기화
    vi.mocked(isQcEnabled).mockReturnValue(false);
  });

  it('isQcEnabled=false → runDeepQcAndUpdate를 호출하지 않는다', async () => {
    const { isQcEnabled } = await import('@/lib/qc');
    vi.mocked(isQcEnabled).mockReturnValue(false);

    const { saveGeneratedCode } = await import('./generationSaver');
    const { runDeepQcAndUpdate } = await import('@/lib/qc/deepQcRunner');
    const sse = makeMockSse();

    await saveGeneratedCode(makeBaseParams(), sse);

    expect(runDeepQcAndUpdate).not.toHaveBeenCalled();
  });

  it('qcReport가 있을 때 sse.send("complete")에 qcResult가 포함된다', async () => {
    const { saveGeneratedCode } = await import('./generationSaver');
    const sse = makeMockSse();

    const passedQcReport: QcReport = {
      overallScore: 85,
      passed: true,
      checks: [
        { name: 'render', passed: true, score: 85, details: [], durationMs: 100 },
      ],
      viewportsTested: [1024],
      durationMs: 150,
      timestamp: '2026-04-26T00:00:00Z',
    };

    await saveGeneratedCode(makeBaseParams({ qcReport: passedQcReport }), sse);

    const completeCalls = (sse.send as ReturnType<typeof vi.fn>).mock.calls.filter(
      (c: unknown[]) => c[0] === 'complete'
    );
    expect(completeCalls.length).toBe(1);
    expect(completeCalls[0][1]).toMatchObject({
      qcResult: {
        score: 85,
        passed: true,
      },
    });
  });

  it('projectRepo + projectContext가 있으면 suggestSlugs가 fire-and-forget으로 호출된다', async () => {
    const { saveGeneratedCode } = await import('./generationSaver');
    const { suggestSlugs } = await import('@/lib/ai/slugSuggester');
    const sse = makeMockSse();

    const projectRepo = {
      updateSuggestedSlugs: vi.fn().mockResolvedValue(undefined),
      findById: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
      findByUserId: vi.fn(),
      countTodayGenerations: vi.fn(),
      insertProjectApis: vi.fn(),
      getProjectApiIds: vi.fn(),
      findBySlug: vi.fn(),
      updateSlug: vi.fn(),
    } as unknown as IProjectRepository;

    vi.mocked(suggestSlugs).mockResolvedValue(['my-service', 'test-service']);

    await saveGeneratedCode(
      makeBaseParams({ projectRepo, projectContext: 'A weather dashboard app' }),
      sse
    );

    // fire-and-forget이므로 짧은 대기 필요
    await new Promise((r) => setTimeout(r, 20));

    expect(suggestSlugs).toHaveBeenCalled();
  });
});

describe('saveGeneratedCode() — Drizzle/Postgres 경로', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getDbProvider=postgres 시 db.transaction을 호출한다', async () => {
    const { getDbProvider } = await import('@/lib/config/providers');
    vi.mocked(getDbProvider).mockReturnValue('postgres');

    const { getDb } = await import('@/lib/db/connection');
    const mockTx = {
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            { id: 'code-drizzle-1', project_id: 'proj-1', version: 1 },
          ]),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      }),
    };
    vi.mocked(getDb).mockReturnValue({
      transaction: vi.fn().mockImplementation(async (fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx)),
    } as never);

    const { saveGeneratedCode } = await import('./generationSaver');
    const codeRepo = makeMockCodeRepo();
    const projectService = makeMockProjectService();
    const sse = makeMockSse();

    await saveGeneratedCode(makeBaseParams({ codeRepo, projectService }), sse);

    expect(getDb).toHaveBeenCalled();
    const db = vi.mocked(getDb)();
    expect(db.transaction).toHaveBeenCalled();

    // Supabase 경로의 codeRepo.create는 호출되지 않아야 함
    expect(codeRepo.create).not.toHaveBeenCalled();

    // 초기화
    vi.mocked(getDbProvider).mockReturnValue('supabase');
  });
});
