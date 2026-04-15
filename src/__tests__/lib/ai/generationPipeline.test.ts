import { vi, describe, it, expect, beforeEach } from 'vitest';
import { runGenerationPipeline, type PipelineInput, type PipelineServices } from '@/lib/ai/generationPipeline';
import type { SseWriter } from '@/lib/ai/sseWriter';
import { AiProviderFactory } from '@/providers/ai/AiProviderFactory';

vi.mock('@/providers/ai/AiProviderFactory', () => ({
  AiProviderFactory: { createForTask: vi.fn() },
}));
vi.mock('@/lib/ai/codeParser', () => ({
  parseGeneratedCode: vi.fn((_c: string) => ({ html: '<div>test</div>', css: 'body{}', js: 'var x=1;' })),
  assembleHtml: vi.fn(() => '<html><body><div>test</div></body></html>'),
}));
vi.mock('@/lib/ai/codeValidator', () => ({
  validateAll: vi.fn(() => ({ passed: true, errors: [], warnings: [] })),
  // fetchCallCount: 0 → Stage 2 필요 조건 충족 (기본값으로 3-stage 경로 테스트)
  evaluateQuality: vi.fn(() => ({ structuralScore: 80, mobileScore: 80, details: [], fetchCallCount: 0, placeholderCount: 0 })),
}));
vi.mock('@/lib/ai/qualityLoop', () => ({
  shouldRetryGeneration: vi.fn(() => false),
  buildQualityImprovementPrompt: vi.fn(() => 'improve'),
}));
vi.mock('@/lib/ai/categoryDesignMap', () => ({
  inferDesignFromCategories: vi.fn(() => ({ theme: 'light', layout: 'grid', allowedSections: [] })),
}));
vi.mock('@/lib/qc', () => ({
  isQcEnabled: vi.fn(() => false),
  runFastQc: vi.fn(),
  runDeepQc: vi.fn(),
}));
vi.mock('@/lib/events/eventBus', () => ({
  eventBus: { emit: vi.fn() },
}));
vi.mock('@/lib/config/features', () => ({
  getLimits: vi.fn(() => ({ maxCodeVersionsPerProject: 5 })),
}));
vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: vi.fn(() => Promise.resolve({})),
}));
vi.mock('@/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/lib/ai/slugSuggester', () => ({
  suggestSlugs: vi.fn().mockResolvedValue([]),
}));
vi.mock('@/lib/utils/htmlTitle', () => ({
  extractTitle: vi.fn().mockReturnValue(undefined),
}));

const makeAiProvider = () => ({
  name: 'claude',
  generateCodeStream: vi.fn().mockResolvedValue({
    content: '<div>generated</div>',
    provider: 'claude',
    model: 'claude-sonnet-4-6',
    durationMs: 1000,
    tokensUsed: { input: 100, output: 200 },
  }),
  generateCode: vi.fn().mockResolvedValue({
    content: '<div>improved</div>',
    provider: 'claude',
    model: 'claude-sonnet-4-6',
    durationMs: 500,
    tokensUsed: { input: 50, output: 100 },
  }),
});

const makeSse = (): SseWriter => ({
  send: vi.fn(),
  isCancelled: vi.fn(() => false),
});

const makeServices = (): PipelineServices => ({
  codeRepo: {
    create: vi.fn().mockResolvedValue({ id: 'code-1' }),
    pruneOldVersions: vi.fn().mockResolvedValue(undefined),
    getNextVersion: vi.fn().mockResolvedValue(1),
    delete: vi.fn().mockResolvedValue(undefined),
    findByProject: vi.fn().mockResolvedValue(null),
  } as unknown as PipelineServices['codeRepo'],
  eventRepo: { persistAsync: vi.fn() } as unknown as PipelineServices['eventRepo'],
  projectService: { updateStatus: vi.fn().mockResolvedValue(undefined) } as unknown as PipelineServices['projectService'],
  rateLimitService: { decrementDailyLimit: vi.fn().mockResolvedValue(undefined) } as unknown as PipelineServices['rateLimitService'],
});

const makeInput = (): PipelineInput => ({
  projectId: 'proj-1',
  userId: 'user-1',
  correlationId: 'corr-1',
  apis: [],
  stage1SystemPrompt: 'stage1-system',
  stage1UserPrompt: 'stage1-user',
  stage2FunctionSystemPrompt: 'stage2-function-system',
  buildStage2FunctionUserPrompt: (code, _staticIssues, _qcIssues) => `stage2-function-user html=${code.html}`,
  stage2SystemPrompt: 'stage2-system',
  buildStage2UserPrompt: (code) => `stage2-user html=${code.html}`,
});

describe('runGenerationPipeline (3-stage)', () => {
  let mockAiProvider: ReturnType<typeof makeAiProvider>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAiProvider = makeAiProvider();
    vi.mocked(AiProviderFactory.createForTask).mockReturnValue(mockAiProvider as unknown as ReturnType<typeof AiProviderFactory.createForTask>);
  });

  it('generateCodeStream을 정확히 3번 호출한다', async () => {
    await runGenerationPipeline(makeInput(), makeSse(), makeServices());
    expect(mockAiProvider.generateCodeStream).toHaveBeenCalledTimes(3);
  });

  it('1번째 호출은 stage1 프롬프트를 사용한다', async () => {
    await runGenerationPipeline(makeInput(), makeSse(), makeServices());
    expect(mockAiProvider.generateCodeStream).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ system: 'stage1-system', user: 'stage1-user' }),
      expect.any(Function),
    );
  });

  it('2번째 호출은 stage2 기능검증 프롬프트를 사용한다', async () => {
    await runGenerationPipeline(makeInput(), makeSse(), makeServices());
    expect(mockAiProvider.generateCodeStream).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ system: 'stage2-function-system' }),
      expect.any(Function),
    );
  });

  it('3번째 호출은 stage3 디자인 프롬프트를 사용한다', async () => {
    await runGenerationPipeline(makeInput(), makeSse(), makeServices());
    expect(mockAiProvider.generateCodeStream).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ system: 'stage2-system' }),
      expect.any(Function),
    );
  });

  it('stage1_generating → stage1_complete → stage2_function_generating → stage3_generating 순서로 progress 이벤트를 전송한다', async () => {
    const sse = makeSse();
    await runGenerationPipeline(makeInput(), sse, makeServices());
    const steps = (sse.send as ReturnType<typeof vi.fn>).mock.calls
      .filter((c: unknown[]) => c[0] === 'progress')
      .map((c: unknown[]) => (c[1] as { step: string }).step);
    const s1Idx = steps.indexOf('stage1_generating');
    const s1cIdx = steps.indexOf('stage1_complete');
    const s2fIdx = steps.indexOf('stage2_function_generating');
    const s3Idx = steps.indexOf('stage3_generating');
    expect(s1Idx).toBeGreaterThanOrEqual(0);
    expect(s1cIdx).toBeGreaterThan(s1Idx);
    expect(s2fIdx).toBeGreaterThan(s1cIdx);
    expect(s3Idx).toBeGreaterThan(s2fIdx);
  });

  it('buildStage2UserPrompt 콜백이 stage2Function 출력을 받아 호출된다', async () => {
    const buildStage2UserPrompt = vi.fn().mockReturnValue('stage2-user-prompt');
    const input = { ...makeInput(), buildStage2UserPrompt };
    await runGenerationPipeline(input, makeSse(), makeServices());
    expect(buildStage2UserPrompt).toHaveBeenCalledWith(
      expect.objectContaining({ html: expect.any(String) }),
    );
  });

  it('complete 이벤트로 정상 종료된다', async () => {
    const sse = makeSse();
    await runGenerationPipeline(makeInput(), sse, makeServices());
    const eventNames = (sse.send as ReturnType<typeof vi.fn>).mock.calls.map((c: unknown[]) => c[0]);
    expect(eventNames).toContain('complete');
    expect(eventNames).not.toContain('error');
  });

  it('codeRepo.create는 1번만 호출된다 (Stage 1 저장 없음)', async () => {
    const services = makeServices();
    await runGenerationPipeline(makeInput(), makeSse(), services);
    expect(services.codeRepo.create).toHaveBeenCalledTimes(1);
  });

  it('Stage 1 실패 시 error 이벤트를 전송하고 Stage 2를 실행하지 않는다', async () => {
    mockAiProvider.generateCodeStream.mockRejectedValueOnce(new Error('Stage 1 실패'));
    const sse = makeSse();
    await runGenerationPipeline(makeInput(), sse, makeServices());
    const eventNames = (sse.send as ReturnType<typeof vi.fn>).mock.calls.map((c: unknown[]) => c[0]);
    expect(eventNames).toContain('error');
    expect(mockAiProvider.generateCodeStream).toHaveBeenCalledTimes(1);
  });
});
