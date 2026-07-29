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
  resolvePipelineBudgetMs: vi.fn(() => 290_000),
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
vi.mock('@/lib/ai/generationLock', () => ({
  releaseGenerationLock: vi.fn().mockResolvedValue(undefined),
  startLockHeartbeat: vi.fn(),
}));
vi.mock('@/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/ai/codeParser', () => ({
  assembleHtml: vi.fn(),
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
import { releaseGenerationLock, startLockHeartbeat } from '@/lib/ai/generationLock';
import { assembleHtml } from '@/lib/ai/codeParser';
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
    hasProxyCall: true,
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
    (assembleHtml as Mock).mockReturnValue('<html><body>assembled</body></html>');
    (validateAll as Mock).mockReturnValue({ errors: [], warnings: [] });
    (evaluateQuality as Mock).mockReturnValue(makeQualityMetrics());
    // startLockHeartbeat는 항상 중지 함수를 돌려준다 — finally에서 호출되므로 기본값 필수.
    (startLockHeartbeat as Mock).mockReturnValue(() => {});
    (releaseGenerationLock as Mock).mockResolvedValue(undefined);

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

    it('tracker.start는 route.ts에서 호출되므로 pipeline 내부에서는 호출되지 않는다', async () => {
      const sse = makeSse();
      await runGenerationPipeline(makeInput(), sse as never, makeServices());

      expect(generationTracker.start).not.toHaveBeenCalled();
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
      expect(eventBus.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'STAGE_SKIPPED',
          payload: expect.objectContaining({ stage: 'stage2' }),
        }),
      );
    });

    it('fetch 미호출 → stage2 실행', async () => {
      (evaluateQuality as Mock)
        .mockReturnValueOnce(makeQualityMetrics({ fetchCallCount: 0 }))
        .mockReturnValueOnce(makeQualityMetrics());

      const sse = makeSse();
      await runGenerationPipeline(makeInput(), sse as never, makeServices());

      expect(runStage2Function).toHaveBeenCalledOnce();
    });

    it('hardcodedArrayCount>0 → stage2 실행 (mock 데이터 차단)', async () => {
      (evaluateQuality as Mock)
        .mockReturnValueOnce(makeQualityMetrics({ fetchCallCount: 1, placeholderCount: 0, hardcodedArrayCount: 2 }))
        .mockReturnValueOnce(makeQualityMetrics());

      const sse = makeSse();
      await runGenerationPipeline(makeInput(), sse as never, makeServices());

      expect(runStage2Function).toHaveBeenCalledOnce();
    });

    it('hasProxyCall=false + fetchCallCount>0 → stage2 실행 (직접 외부 fetch 차단)', async () => {
      // fetch가 존재하지만 /api/v1/proxy를 경유하지 않는 경우 — CORS 실패 방지를 위해 stage2 강제
      (evaluateQuality as Mock)
        .mockReturnValueOnce(makeQualityMetrics({ fetchCallCount: 2, hasProxyCall: false, placeholderCount: 0 }))
        .mockReturnValueOnce(makeQualityMetrics())
        .mockReturnValueOnce(makeQualityMetrics());

      const sse = makeSse();
      await runGenerationPipeline(makeInput(), sse as never, makeServices());

      expect(runStage2Function).toHaveBeenCalledOnce();
    });

    it('hasProxyCall=true → stage2 스킵 (proxy 경유 확인됨)', async () => {
      // fetch가 존재하고 proxy 경유 확인 → stage2 불필요
      (evaluateQuality as Mock)
        .mockReturnValueOnce(makeQualityMetrics({ fetchCallCount: 1, hasProxyCall: true, placeholderCount: 0 }))
        .mockReturnValueOnce(makeQualityMetrics())
        .mockReturnValueOnce(makeQualityMetrics());

      const sse = makeSse();
      await runGenerationPipeline(makeInput(), sse as never, makeServices());

      expect(runStage2Function).not.toHaveBeenCalled();
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

    it('structuralScore=80 정확 boundary → stage3 스킵 (>=80 조건)', async () => {
      (evaluateQuality as Mock)
        .mockReturnValueOnce(makeQualityMetrics({ fetchCallCount: 1, placeholderCount: 0 }))
        .mockReturnValueOnce(makeQualityMetrics({ structuralScore: 80, mobileScore: 70, fetchCallCount: 1, placeholderCount: 0 }))
        .mockReturnValueOnce(makeQualityMetrics());

      const sse = makeSse();
      await runGenerationPipeline(makeInput(), sse as never, makeServices());

      expect(runStage3).not.toHaveBeenCalled();
      expect(eventBus.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'STAGE_SKIPPED',
          payload: expect.objectContaining({ stage: 'stage3' }),
        }),
      );
    });

    it('structuralScore=79 정확 boundary → stage3 실행 (>=80 미충족)', async () => {
      (evaluateQuality as Mock)
        .mockReturnValueOnce(makeQualityMetrics({ fetchCallCount: 1, placeholderCount: 0 }))
        .mockReturnValueOnce(makeQualityMetrics({ structuralScore: 79, mobileScore: 75, fetchCallCount: 1, placeholderCount: 0 }))
        .mockReturnValueOnce(makeQualityMetrics());

      const sse = makeSse();
      await runGenerationPipeline(makeInput(), sse as never, makeServices());

      expect(runStage3).toHaveBeenCalledOnce();
    });

    it('mobileScore=70 정확 boundary → stage3 스킵 (>=70 조건)', async () => {
      (evaluateQuality as Mock)
        .mockReturnValueOnce(makeQualityMetrics({ fetchCallCount: 1, placeholderCount: 0 }))
        .mockReturnValueOnce(makeQualityMetrics({ structuralScore: 85, mobileScore: 70, fetchCallCount: 1, placeholderCount: 0 }))
        .mockReturnValueOnce(makeQualityMetrics());

      const sse = makeSse();
      await runGenerationPipeline(makeInput(), sse as never, makeServices());

      expect(runStage3).not.toHaveBeenCalled();
    });

    it('mobileScore=69 정확 boundary → stage3 실행 (>=70 미충족)', async () => {
      (evaluateQuality as Mock)
        .mockReturnValueOnce(makeQualityMetrics({ fetchCallCount: 1, placeholderCount: 0 }))
        .mockReturnValueOnce(makeQualityMetrics({ structuralScore: 85, mobileScore: 69, fetchCallCount: 1, placeholderCount: 0 }))
        .mockReturnValueOnce(makeQualityMetrics());

      const sse = makeSse();
      await runGenerationPipeline(makeInput(), sse as never, makeServices());

      expect(runStage3).toHaveBeenCalledOnce();
    });

    it('fetchCallCount=0 (점수 충분해도) → stage3 실행', async () => {
      // pre-stage3 fetchCallCount=0이면 skipStage3=false (fetch가 0보다 커야 skip 가능)
      // 단 stage1에서 fetch=0이면 stage2가 실행되므로 needsStage2=true가 되어 stage3는 어차피 실행됨
      (evaluateQuality as Mock)
        .mockReturnValueOnce(makeQualityMetrics({ fetchCallCount: 0 })) // stage1: needs stage2
        .mockReturnValueOnce(makeQualityMetrics({ structuralScore: 90, mobileScore: 90, fetchCallCount: 0, placeholderCount: 0 }))
        .mockReturnValueOnce(makeQualityMetrics());

      const sse = makeSse();
      await runGenerationPipeline(makeInput(), sse as never, makeServices());

      expect(runStage3).toHaveBeenCalledOnce();
    });

    it('placeholderCount>0 (점수 충분해도) → stage3 실행', async () => {
      (evaluateQuality as Mock)
        .mockReturnValueOnce(makeQualityMetrics({ fetchCallCount: 1, placeholderCount: 0 })) // stage1: no stage2
        .mockReturnValueOnce(makeQualityMetrics({ structuralScore: 85, mobileScore: 80, fetchCallCount: 1, placeholderCount: 1 }))
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

  describe('생성 락 수명주기', () => {
    it('성공적으로 끝나면 락을 해제한다 — 다음 요청이 막히지 않아야 한다', async () => {
      const sse = makeSse();
      await runGenerationPipeline(makeInput(), sse as never, makeServices());

      expect(releaseGenerationLock).toHaveBeenCalledWith('proj-1');
    });

    it('실패해도 락을 해제한다 — 실패한 생성이 프로젝트를 잠그면 안 된다', async () => {
      (runStage1 as Mock).mockRejectedValue(new Error('AI 서비스 응답 없음'));

      const sse = makeSse();
      await runGenerationPipeline(makeInput(), sse as never, makeServices());

      expect(releaseGenerationLock).toHaveBeenCalledWith('proj-1');
    });

    it('실행 중 heartbeat를 시작하고 끝나면 반드시 멈춘다 — 타이머가 남으면 해제된 락을 되살린다', async () => {
      const stop = vi.fn();
      (startLockHeartbeat as Mock).mockReturnValue(stop);

      const sse = makeSse();
      await runGenerationPipeline(makeInput(), sse as never, makeServices());

      expect(startLockHeartbeat).toHaveBeenCalledWith('proj-1');
      expect(stop).toHaveBeenCalled();
    });

    it('실패 경로에서도 heartbeat 타이머를 멈춘다', async () => {
      const stop = vi.fn();
      (startLockHeartbeat as Mock).mockReturnValue(stop);
      (runStage1 as Mock).mockRejectedValue(new Error('AI 서비스 응답 없음'));

      const sse = makeSse();
      await runGenerationPipeline(makeInput(), sse as never, makeServices());

      expect(stop).toHaveBeenCalled();
    });

    it('heartbeat를 멈춘 뒤에 락을 해제한다 — 순서가 뒤집히면 이미 지운 락을 되살릴 수 있다', async () => {
      const order: string[] = [];
      (startLockHeartbeat as Mock).mockReturnValue(() => order.push('stop'));
      (releaseGenerationLock as Mock).mockImplementation(async () => {
        order.push('release');
      });

      const sse = makeSse();
      await runGenerationPipeline(makeInput(), sse as never, makeServices());

      expect(order).toEqual(['stop', 'release']);
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

  describe('safeAssembleHtml 에러 경로', () => {
    it('assembleHtml throw → QC 스킵하고 파이프라인 계속 진행 (saveGeneratedCode 호출)', async () => {
      // QC 활성화 상태에서 assembleHtml이 throw → safeAssembleHtml이 null 반환 → QC 스킵하고 계속
      (isQcEnabled as Mock).mockReturnValue(true);
      (assembleHtml as Mock).mockImplementation(() => {
        throw new Error('HTML 조립 실패');
      });

      const sse = makeSse();
      await runGenerationPipeline(makeInput(), sse as never, makeServices());

      // 파이프라인이 중단되지 않고 saveGeneratedCode까지 도달해야 함
      expect(saveGeneratedCode).toHaveBeenCalledOnce();
      // SSE error 이벤트가 없어야 함 (에러 경로 진입 안 함)
      const errorEvents = sse.events.filter(e => e.event === 'error');
      expect(errorEvents).toHaveLength(0);
    });
  });

  describe('resolveStage3 폴백', () => {
    it('runStage3 throw → stage2 결과로 폴백 + STAGE3_FALLBACK_USED 이벤트 발행', async () => {
      // stage2가 실행되도록 fetch=0으로 설정
      (evaluateQuality as Mock)
        .mockReturnValueOnce(makeQualityMetrics({ fetchCallCount: 0 })) // stage1 → stage2 트리거
        .mockReturnValueOnce(makeQualityMetrics({ structuralScore: 70 })) // pre-stage3: skip 조건 미충족
        .mockReturnValueOnce(makeQualityMetrics()); // final

      (runStage3 as Mock).mockRejectedValue(new Error('Stage 3 timeout'));

      const sse = makeSse();
      await runGenerationPipeline(makeInput(), sse as never, makeServices());

      // STAGE3_FALLBACK_USED 이벤트가 발행되어야 함
      expect(eventBus.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'STAGE3_FALLBACK_USED',
          payload: expect.objectContaining({ projectId: 'proj-1', error: 'Stage 3 timeout' }),
        }),
      );

      // 폴백 후에도 파이프라인이 계속되어 저장까지 완료되어야 함
      expect(saveGeneratedCode).toHaveBeenCalledOnce();

      // SSE에 stage3_fallback progress가 전송되어야 함
      const progressEvents = sse.events.filter(e => e.event === 'progress');
      const steps = progressEvents.map(e => (e.data as { step: string }).step);
      expect(steps).toContain('stage3_fallback');
    });
  });

  describe('재생성 feedback 누적 (S10)', () => {
    it('extraMetadata.userFeedback이 runQualityLoop의 9번째 인자로 전달된다', async () => {
      // Quality Loop 진입을 위해 stage1 quality 미달 + 이후도 미달 시뮬레이션
      (evaluateQuality as Mock)
        .mockReturnValueOnce(makeQualityMetrics({ fetchCallCount: 0 })) // stage1 → stage2 트리거
        .mockReturnValueOnce(makeQualityMetrics({ structuralScore: 70 })) // pre-stage3
        .mockReturnValueOnce(makeQualityMetrics({ structuralScore: 50, mobileScore: 50 })); // validate → quality loop initial quality

      const sse = makeSse();
      const input = makeInput();
      input.extraMetadata = { userFeedback: '버튼 색상을 파란색으로' };

      await runGenerationPipeline(input, sse as never, makeServices());

      const calls = (runQualityLoop as Mock).mock.calls;
      expect(calls.length).toBeGreaterThanOrEqual(1);
      // runQualityLoop signature: (parsed, quality, qcReport, options: QualityLoopRunOptions)
      expect(calls[0][3].userFeedback).toBe('버튼 색상을 파란색으로');
    });

    it('extraMetadata.userFeedback이 없으면 runQualityLoop의 9번째 인자는 undefined', async () => {
      (evaluateQuality as Mock)
        .mockReturnValueOnce(makeQualityMetrics({ fetchCallCount: 0 }))
        .mockReturnValueOnce(makeQualityMetrics({ structuralScore: 70 }))
        .mockReturnValueOnce(makeQualityMetrics({ structuralScore: 50 }));

      const sse = makeSse();
      const input = makeInput();
      // extraMetadata 미설정

      await runGenerationPipeline(input, sse as never, makeServices());

      const calls = (runQualityLoop as Mock).mock.calls;
      expect(calls[0][3].userFeedback).toBeUndefined();
    });

    it('extraMetadata.userFeedback이 string이 아니면(예: number) undefined로 변환된다', async () => {
      (evaluateQuality as Mock)
        .mockReturnValueOnce(makeQualityMetrics({ fetchCallCount: 0 }))
        .mockReturnValueOnce(makeQualityMetrics({ structuralScore: 70 }))
        .mockReturnValueOnce(makeQualityMetrics({ structuralScore: 50 }));

      const sse = makeSse();
      const input = makeInput();
      input.extraMetadata = { userFeedback: 123 as unknown as string }; // 잘못된 타입

      await runGenerationPipeline(input, sse as never, makeServices());

      const calls = (runQualityLoop as Mock).mock.calls;
      expect(calls[0][3].userFeedback).toBeUndefined();
    });
  });

  describe('quality loop 보안 재검증 (H-4)', () => {
    it('qualityLoopUsed=true이고 재검증 통과 시 파이프라인을 완료한다', async () => {
      (runQualityLoop as Mock).mockResolvedValueOnce({
        parsed: makeStageResult().parsed,
        quality: makeQualityMetrics(),
        qcReport: null,
        qualityLoopUsed: true,
      });
      // validateAll은 beforeEach에서 기본값으로 errors:[] 반환 → 재검증 통과

      const sse = makeSse();
      await runGenerationPipeline(makeInput(), sse as never, makeServices());

      expect(saveGeneratedCode).toHaveBeenCalledOnce();
    });

    it('qualityLoopUsed=true이고 재검증 실패 시 SSE error 이벤트를 전송하고 저장하지 않는다', async () => {
      (runQualityLoop as Mock).mockResolvedValueOnce({
        parsed: makeStageResult().parsed,
        quality: makeQualityMetrics(),
        qcReport: null,
        qualityLoopUsed: true,
      });
      // 초기 검증(2회)은 통과, quality loop 후 재검증(3번째)은 실패
      (validateAll as Mock)
        .mockReturnValueOnce({ errors: [], warnings: [] })
        .mockReturnValueOnce({ errors: [], warnings: [] })
        .mockReturnValueOnce({ errors: ['eval() 사용 금지'], warnings: [] });

      const sse = makeSse();
      const services = makeServices();
      await runGenerationPipeline(makeInput(), sse as never, services);

      expect(saveGeneratedCode).not.toHaveBeenCalled();
      expect(sse.events.find(e => e.event === 'error')).toBeDefined();
      expect(services.rateLimitService.decrementDailyLimit).toHaveBeenCalledWith('user-1');
    });
  });
});
