/**
 * runGenerationPipeline integration test
 *
 * 검증 목적:
 *  - Stage 2 skip 조건 (품질 충분 → stage1 결과 그대로 진행)
 *  - Stage 3 skip 조건 (점수 충분 → polish 스킵)
 *  - 전체 happy path (stage 0→1→2→3→QC→qualityLoop→저장)
 *  - 파이프라인 실패 경로 (rate limit 복구, 이벤트 발행, SSE error)
 *  - Extended Thinking 임계값 조건
 *  - stage 0 실패 → 무시하고 계속 진행 (best-effort)
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

// ── mock declarations ──────────────────────────────────────────────────────────

vi.mock('@/providers/ai/AiProviderFactory', () => ({
  AiProviderFactory: { createForTask: vi.fn() },
}));
vi.mock('@/lib/ai/stageRunner', () => ({
  runStage1: vi.fn(),
  runStage2Function: vi.fn(),
  runStage3: vi.fn(),
}));
vi.mock('@/lib/ai/qualityLoop', () => ({
  runQualityLoop: vi.fn(),
}));
vi.mock('@/lib/ai/featureExtractor', () => ({
  extractFeatures: vi.fn(),
}));
vi.mock('@/lib/ai/generationSaver', () => ({
  saveGeneratedCode: vi.fn(),
}));
vi.mock('@/lib/ai/codeValidator', () => ({
  validateAll: vi.fn(),
  evaluateQuality: vi.fn(),
}));
vi.mock('@/lib/qc', () => ({
  runFastQc: vi.fn(),
  isQcEnabled: vi.fn(),
}));
vi.mock('@/lib/events/eventBus', () => ({
  eventBus: { emit: vi.fn() },
}));
vi.mock('@/lib/ai/generationTracker', () => ({
  generationTracker: {
    start: vi.fn(),
    updateProgress: vi.fn(),
    fail: vi.fn(),
    complete: vi.fn(),
  },
}));
vi.mock('@/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ── imports after mocks ────────────────────────────────────────────────────────

import { runGenerationPipeline, type PipelineInput, type PipelineServices } from './generationPipeline';
import { AiProviderFactory } from '@/providers/ai/AiProviderFactory';
import { runStage1, runStage2Function, runStage3 } from '@/lib/ai/stageRunner';
import { runQualityLoop } from '@/lib/ai/qualityLoop';
import { extractFeatures } from '@/lib/ai/featureExtractor';
import { saveGeneratedCode } from '@/lib/ai/generationSaver';
import { validateAll, evaluateQuality } from '@/lib/ai/codeValidator';
import { runFastQc, isQcEnabled } from '@/lib/qc';
import { eventBus } from '@/lib/events/eventBus';
import { generationTracker } from '@/lib/ai/generationTracker';
import type { ApiCatalogItem } from '@/types/api';

// ── helpers ────────────────────────────────────────────────────────────────────

function makeSse() {
  const events: Array<{ event: string; data: unknown }> = [];
  return {
    send: vi.fn((event: string, data: unknown) => { events.push({ event, data }); }),
    events,
  };
}

function makeApi(overrides: Partial<ApiCatalogItem> = {}): ApiCatalogItem {
  return {
    id: 'api-1', name: 'Weather API', category: 'weather',
    description: 'Weather data', tags: [], documentationUrl: null,
    exampleCall: null, responseFormat: null, authRequired: false,
    rateLimitInfo: null, authType: 'none', endpoints: [],
    ...overrides,
  } as ApiCatalogItem;
}

function makeStageResult(html = '<html><body><p>hi</p></body></html>', extra?: object) {
  return {
    parsed: { html, css: 'body{}', js: 'console.log(1)' },
    provider: 'claude',
    model: 'claude-opus-4-7',
    durationMs: 100,
    tokensUsed: { input: 10, output: 20 },
    userPrompt: 'user prompt',
    ...extra,
  };
}

function makeQualityMetrics(overrides: object = {}) {
  return {
    fetchCallCount: 1,
    placeholderCount: 0,
    structuralScore: 85,
    mobileScore: 80,
    details: [],
    ...overrides,
  };
}

function makeServices(): PipelineServices {
  return {
    codeRepo: { saveVersion: vi.fn(), findLatestVersion: vi.fn() } as never,
    projectService: { updateStatus: vi.fn().mockResolvedValue(undefined) },
    rateLimitService: { decrementDailyLimit: vi.fn().mockResolvedValue(undefined) },
  };
}

function makeInput(apiOverrides: Partial<ApiCatalogItem>[] = [{}]): PipelineInput {
  return {
    projectId: 'proj-1',
    userId: 'user-1',
    correlationId: 'corr-1',
    apis: apiOverrides.map(makeApi),
    projectContext: 'A weather dashboard with 7-day forecast',
    stage1SystemPrompt: 'system1',
    stage1UserPrompt: 'user1',
    stage2FunctionSystemPrompt: 'sys2fn',
    buildStage2FunctionUserPrompt: vi.fn().mockReturnValue('user2fn'),
    stage2SystemPrompt: 'sys2',
    buildStage2UserPrompt: vi.fn().mockReturnValue('user2'),
  };
}

// ── tests ──────────────────────────────────────────────────────────────────────

describe('runGenerationPipeline()', () => {
  const mockProvider = { name: 'claude', generate: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    (AiProviderFactory.createForTask as Mock).mockReturnValue(mockProvider);
    (extractFeatures as Mock).mockResolvedValue({ features: [] });
    (isQcEnabled as Mock).mockReturnValue(false);
    (validateAll as Mock).mockReturnValue({ errors: [], warnings: [] });
    (evaluateQuality as Mock).mockReturnValue(makeQualityMetrics());

    const stageResult = makeStageResult();
    (runStage1 as Mock).mockResolvedValue(stageResult);
    (runStage2Function as Mock).mockResolvedValue(stageResult);
    (runStage3 as Mock).mockResolvedValue(stageResult);
    (runQualityLoop as Mock).mockResolvedValue({
      parsed: stageResult.parsed,
      quality: makeQualityMetrics(),
      qcReport: null,
      qualityLoopUsed: false,
    });
    (saveGeneratedCode as Mock).mockResolvedValue(undefined);
  });

  describe('happy path', () => {
    it('전체 파이프라인 순서대로 실행 — stage1→stage2→stage3→qualityLoop→저장', async () => {
      const sse = makeSse();
      const services = makeServices();
      const input = makeInput();

      // stage2 필요하게 만들기: fetch 미호출
      (evaluateQuality as Mock)
        .mockReturnValueOnce(makeQualityMetrics({ fetchCallCount: 0 }))  // stage1 QC
        .mockReturnValueOnce(makeQualityMetrics({ fetchCallCount: 1 }))  // pre-stage3 QC (skip 조건 미충족)
        .mockReturnValueOnce(makeQualityMetrics({ fetchCallCount: 1 })); // validate

      await runGenerationPipeline(input, sse as never, services);

      expect(runStage1).toHaveBeenCalledOnce();
      expect(runStage2Function).toHaveBeenCalledOnce();
      expect(runStage3).toHaveBeenCalledOnce();
      expect(runQualityLoop).toHaveBeenCalledOnce();
      expect(saveGeneratedCode).toHaveBeenCalledOnce();
    });

    it('tracker.start → updateProgress(5) 호출', async () => {
      const sse = makeSse();
      await runGenerationPipeline(makeInput(), sse as never, makeServices());

      expect(generationTracker.start).toHaveBeenCalledWith('proj-1', 'user-1');
      expect(generationTracker.updateProgress).toHaveBeenCalledWith(
        'proj-1', 5, 'analyzing', expect.any(String),
      );
    });

    it('SSE progress 이벤트 순서: analyzing → (stage 진행) → validating', async () => {
      const sse = makeSse();
      await runGenerationPipeline(makeInput(), sse as never, makeServices());

      const progressEvents = sse.events.filter(e => e.event === 'progress');
      const steps = progressEvents.map(e => (e.data as { step: string }).step);
      expect(steps[0]).toBe('analyzing');
      expect(steps).toContain('validating');
    });
  });

  describe('Stage 2 skip 조건', () => {
    it('fetch 호출 존재 + placeholder 없음 + QC 비활성 → stage2 스킵', async () => {
      (evaluateQuality as Mock)
        .mockReturnValueOnce(makeQualityMetrics({ fetchCallCount: 1, placeholderCount: 0 }))
        .mockReturnValueOnce(makeQualityMetrics());

      const sse = makeSse();
      await runGenerationPipeline(makeInput(), sse as never, makeServices());

      expect(runStage2Function).not.toHaveBeenCalled();
    });

    it('fetch 미호출 → stage2 실행', async () => {
      (evaluateQuality as Mock)
        .mockReturnValueOnce(makeQualityMetrics({ fetchCallCount: 0 }))
        .mockReturnValueOnce(makeQualityMetrics());

      const sse = makeSse();
      await runGenerationPipeline(makeInput(), sse as never, makeServices());

      expect(runStage2Function).toHaveBeenCalledOnce();
    });

    it('placeholder 존재 → stage2 실행', async () => {
      (evaluateQuality as Mock)
        .mockReturnValueOnce(makeQualityMetrics({ placeholderCount: 2 }))
        .mockReturnValueOnce(makeQualityMetrics());

      const sse = makeSse();
      await runGenerationPipeline(makeInput(), sse as never, makeServices());

      expect(runStage2Function).toHaveBeenCalledOnce();
    });
  });

  describe('Stage 3 skip 조건', () => {
    it('structuralScore>=80, mobileScore>=70, fetch있음, placeholder없음, stage2 스킵됨 → stage3 스킵', async () => {
      // stage2 스킵 조건 (fetch 있음)
      // stage3 스킵 조건 (점수 충분, stage2 불필요했음)
      (evaluateQuality as Mock)
        .mockReturnValueOnce(makeQualityMetrics({ fetchCallCount: 1, placeholderCount: 0 })) // stage1
        .mockReturnValueOnce(makeQualityMetrics({ structuralScore: 85, mobileScore: 75, fetchCallCount: 1, placeholderCount: 0 })) // pre-stage3
        .mockReturnValueOnce(makeQualityMetrics()); // final

      const sse = makeSse();
      await runGenerationPipeline(makeInput(), sse as never, makeServices());

      expect(runStage2Function).not.toHaveBeenCalled();
      expect(runStage3).not.toHaveBeenCalled();
    });

    it('structuralScore<80 → stage3 실행', async () => {
      (evaluateQuality as Mock)
        .mockReturnValueOnce(makeQualityMetrics({ fetchCallCount: 1 })) // stage1: no stage2
        .mockReturnValueOnce(makeQualityMetrics({ structuralScore: 70 })) // pre-stage3: 낮음
        .mockReturnValueOnce(makeQualityMetrics());

      const sse = makeSse();
      await runGenerationPipeline(makeInput(), sse as never, makeServices());

      expect(runStage3).toHaveBeenCalledOnce();
    });
  });

  describe('Stage 0 — featureExtractor', () => {
    it('feature 추출 성공 → stage1SystemPrompt에 기능 목록 주입', async () => {
      (extractFeatures as Mock).mockResolvedValue({
        features: [{ id: 'F1', description: '7일 예보', verifiableBy: 'DOM 확인' }],
      });

      const sse = makeSse();
      await runGenerationPipeline(makeInput(), sse as never, makeServices());

      const [promptArg] = (runStage1 as Mock).mock.calls[0] as [string, ...unknown[]];
      expect(promptArg).toContain('F1');
      expect(promptArg).toContain('7일 예보');
    });

    it('featureExtractor 실패 → 파이프라인 계속 진행 (stage1 호출됨)', async () => {
      (extractFeatures as Mock).mockRejectedValue(new Error('timeout'));

      const sse = makeSse();
      await runGenerationPipeline(makeInput(), sse as never, makeServices());

      expect(runStage1).toHaveBeenCalledOnce();
      expect(saveGeneratedCode).toHaveBeenCalledOnce();
    });
  });

  describe('보안 검증 실패', () => {
    it('validateAll 에러 존재 → 파이프라인 중단 + rateLimitService.decrementDailyLimit 호출', async () => {
      (validateAll as Mock).mockReturnValue({ errors: ['eval() 사용 금지'], warnings: [] });

      const sse = makeSse();
      const services = makeServices();
      await runGenerationPipeline(makeInput(), sse as never, services);

      expect(services.rateLimitService.decrementDailyLimit).toHaveBeenCalledWith('user-1');
      expect(saveGeneratedCode).not.toHaveBeenCalled();

      const errorEvents = sse.events.filter(e => e.event === 'error');
      expect(errorEvents.length).toBe(1);
    });
  });

  describe('파이프라인 실패 처리', () => {
    it('stage1 throw → rateLimitService.decrementDailyLimit 호출 + SSE error 발행', async () => {
      (runStage1 as Mock).mockRejectedValue(new Error('AI 서비스 응답 없음'));

      const sse = makeSse();
      const services = makeServices();
      await runGenerationPipeline(makeInput(), sse as never, services);

      expect(services.rateLimitService.decrementDailyLimit).toHaveBeenCalledWith('user-1');
      expect(eventBus.emit).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'CODE_GENERATION_FAILED' }),
      );
      expect(generationTracker.fail).toHaveBeenCalledWith('proj-1', expect.any(String));

      const errorEvent = sse.events.find(e => e.event === 'error');
      expect(errorEvent).toBeDefined();
      expect((errorEvent!.data as { message: string }).message).toContain('AI 서비스 응답 없음');
    });

    it('saveGeneratedCode throw → rateLimitService 호출 + SSE error 발행', async () => {
      (saveGeneratedCode as Mock).mockRejectedValue(new Error('DB 저장 실패'));

      const sse = makeSse();
      const services = makeServices();
      await runGenerationPipeline(makeInput(), sse as never, services);

      expect(services.rateLimitService.decrementDailyLimit).toHaveBeenCalled();
      const errorEvent = sse.events.find(e => e.event === 'error');
      expect(errorEvent).toBeDefined();
    });

    it('AiProviderFactory 초기화 실패 → early throw + SSE error', async () => {
      (AiProviderFactory.createForTask as Mock).mockImplementation(() => {
        throw new Error('ANTHROPIC_API_KEY 누락');
      });

      const sse = makeSse();
      await runGenerationPipeline(makeInput(), sse as never, makeServices());

      const errorEvent = sse.events.find(e => e.event === 'error');
      expect(errorEvent).toBeDefined();
      expect((errorEvent!.data as { message: string }).message).toContain('AI 서비스 초기화 실패');
    });
  });

  describe('QC 활성화 경로', () => {
    it('isQcEnabled=true + Fast QC 실패 → stage2 강제 실행', async () => {
      (isQcEnabled as Mock).mockReturnValue(true);
      (runFastQc as Mock).mockResolvedValue({
        passed: false,
        overallScore: 40,
        checks: [{ name: 'console-errors', passed: false, score: 0 }],
      });
      // stage1 품질은 충분하지만 QC 실패로 stage2 강제
      (evaluateQuality as Mock)
        .mockReturnValueOnce(makeQualityMetrics({ fetchCallCount: 1, placeholderCount: 0 }))
        .mockReturnValueOnce(makeQualityMetrics())
        .mockReturnValueOnce(makeQualityMetrics());

      const sse = makeSse();
      await runGenerationPipeline(makeInput(), sse as never, makeServices());

      expect(runStage2Function).toHaveBeenCalledOnce();
    });

    it('isQcEnabled=true + runFastQc throw → 계속 진행 (QC 실패 무시)', async () => {
      (isQcEnabled as Mock).mockReturnValue(true);
      (runFastQc as Mock).mockRejectedValue(new Error('Playwright 사용 불가'));

      const sse = makeSse();
      await runGenerationPipeline(makeInput(), sse as never, makeServices());

      expect(saveGeneratedCode).toHaveBeenCalledOnce();
    });
  });

  describe('Extended Thinking', () => {
    it('복잡도 낮은 API 1개 → ET 미활성화', async () => {
      const sse = makeSse();
      await runGenerationPipeline(
        makeInput([{ authType: 'none', endpoints: [] }]),
        sse as never,
        makeServices(),
      );

      // runStage1(systemPrompt, userPrompt, aiProvider, sse, useET) — 5번째 인자
      const args = (runStage1 as Mock).mock.calls[0] as [unknown, unknown, unknown, unknown, boolean];
      expect(args[4]).toBe(false);
    });

    it('OAuth + 500자 이상 컨텍스트 → ET 활성화', async () => {
      const sse = makeSse();
      const input = makeInput([{ authType: 'oauth', endpoints: [{ method: 'POST' as const, path: '/x', description: '', params: [], responseExample: {} }] }]);
      input.projectContext = 'A'.repeat(500);

      await runGenerationPipeline(input, sse as never, makeServices());

      const args = (runStage1 as Mock).mock.calls[0] as [unknown, unknown, unknown, unknown, boolean];
      expect(args[4]).toBe(true);
    });
  });
});
