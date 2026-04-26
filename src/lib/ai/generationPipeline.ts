import { AiProviderFactory } from '@/providers/ai/AiProviderFactory';
import type { IAiProvider } from '@/providers/ai/IAiProvider';
import { assembleHtml } from '@/lib/ai/codeParser';
import { validateAll, evaluateQuality } from '@/lib/ai/codeValidator';
import { runQualityLoop } from '@/lib/ai/qualityLoop';
import { runFastQc, isQcEnabled } from '@/lib/qc';
import { eventBus } from '@/lib/events/eventBus';
import { logger } from '@/lib/utils/logger';
import { generationTracker } from '@/lib/ai/generationTracker';
import { runStage1, runStage2Function, runStage3 } from '@/lib/ai/stageRunner';
import { saveGeneratedCode } from '@/lib/ai/generationSaver';
import { extractFeatures } from '@/lib/ai/featureExtractor';
import type { FeatureSpec } from '@/lib/ai/featureExtractor';
import type { ICodeRepository, IProjectRepository } from '@/repositories/interfaces';
import type { ApiCatalogItem } from '@/types/api';
import type { SseWriter } from '@/lib/ai/sseWriter';
import type { QcReport } from '@/types/qc';

// Minimal service interfaces — avoids circular deps with services/
interface IProjectStatusUpdater {
  updateStatus(id: string, status: 'generated'): Promise<unknown>;
}

interface IRateLimitDecrementer {
  decrementDailyLimit(userId: string): Promise<void>;
}

export interface PipelineInput {
  projectId: string;
  userId: string;
  correlationId: string | undefined;
  apis: ApiCatalogItem[];
  /** 사용자 서비스 설명 (slug 제안 훅에 사용) */
  projectContext?: string;
  stage1SystemPrompt: string;
  stage1UserPrompt: string;
  stage2FunctionSystemPrompt: string;
  buildStage2FunctionUserPrompt: (
    stage1Code: { html: string; css: string; js: string },
    staticQcIssues: string[],
    fastQcIssues: string[] | null,
  ) => string;
  stage2SystemPrompt: string;
  buildStage2UserPrompt: (stage1Code: { html: string; css: string; js: string }) => string;
  extraMetadata?: Record<string, unknown>;
}

export interface PipelineServices {
  codeRepo: ICodeRepository;
  projectService: IProjectStatusUpdater;
  rateLimitService: IRateLimitDecrementer;
  projectRepo?: IProjectRepository;
}

function safeAssembleHtml(code: { html: string; css: string; js: string }): string | null {
  try {
    return assembleHtml(code);
  } catch {
    return null;
  }
}

const ET_THRESHOLD = Number(process.env.ET_COMPLEXITY_THRESHOLD ?? 35);

export function evaluateComplexityScore(apis: ApiCatalogItem[], context?: string): number {
  let score = 0;

  // API count signal: +5pts per API beyond 2, capped at 20pts
  score += Math.min(Math.max(0, apis.length - 2) * 5, 20);

  // Auth complexity: highest auth type among all APIs wins
  const maxAuth = apis.reduce((max, api) => {
    if (api.authType === 'oauth') return Math.max(max, 15);
    if (api.authType === 'api_key') return Math.max(max, 8);
    return max;
  }, 0);
  score += maxAuth;

  // Endpoint diversity: breadth and mutations
  const totalEndpoints = apis.reduce((sum, api) => sum + (api.endpoints?.length ?? 0), 0);
  if (totalEndpoints >= 4) score += 10;
  else if (totalEndpoints >= 2) score += 5;
  const hasMutations = apis.some((api) =>
    api.endpoints?.some((ep) => ep.method === 'POST' || ep.method === 'PUT' || ep.method === 'DELETE')
  );
  if (hasMutations) score += 8;

  // Context quality signal (단조 증가: 길수록 높은 점수)
  const ctxLen = context?.length ?? 0;
  if (ctxLen >= 500) score += 15;
  else if (ctxLen >= 100) score += 8;
  else if (ctxLen > 0) score += 3;

  // Dependency complexity: payment domain or same-category multi-API
  const categories = new Set(apis.map((api) => api.category));
  const sameCategoryMultiple = apis.length >= 2 && categories.size === 1;
  const hasPaymentKeyword = apis.some((api) =>
    /payment|stripe|결제|pay/i.test(api.name)
  );
  if (sameCategoryMultiple || hasPaymentKeyword) score += 10;

  return score;
}

function shouldUseExtendedThinking(apis: ApiCatalogItem[], context?: string): boolean {
  return evaluateComplexityScore(apis, context) >= ET_THRESHOLD;
}

async function handlePipelineFailure(
  error: unknown,
  context: { projectId: string; userId: string; aiProviderName: string | undefined },
  services: { rateLimitService: IRateLimitDecrementer },
  sse: SseWriter,
): Promise<void> {
  const { projectId, userId, aiProviderName } = context;

  logger.error('Code generation pipeline failed', {
    projectId,
    error: error instanceof Error ? error.message : 'Unknown',
  });

  await services.rateLimitService.decrementDailyLimit(userId);

  eventBus.emit({
    type: 'CODE_GENERATION_FAILED',
    payload: {
      projectId,
      error: error instanceof Error ? error.message : 'Unknown error',
      provider: aiProviderName ?? 'unknown',
    },
  });

  generationTracker.fail(projectId, error instanceof Error ? error.message : '코드 생성에 실패했습니다.');
  sse.send('error', {
    message: error instanceof Error ? error.message : '코드 생성에 실패했습니다.',
  });
}

/**
 * 공통 코드 생성/재생성 파이프라인.
 * SSE 스트림 내부에서 호출되며, 에러 처리(rate limit 복구, 이벤트 발행)도 포함합니다.
 */
export async function runGenerationPipeline(
  input: PipelineInput,
  sse: SseWriter,
  services: PipelineServices,
): Promise<void> {
  const { projectId, userId, correlationId, apis, extraMetadata, projectContext } = input;
  const { codeRepo, projectService, rateLimitService, projectRepo } = services;

  let aiProviderInit: IAiProvider | undefined;

  generationTracker.start(projectId, userId);

  try {
    sse.send('progress', { step: 'analyzing', progress: 5, message: '분석 중...' });
    generationTracker.updateProgress(projectId, 5, 'analyzing', '분석 중...');

    // Stage 0: 기능 사양 추출 (best-effort — 실패해도 파이프라인 계속)
    let featureSpec: FeatureSpec | null = null;
    try {
      const apiNames = apis.map((api) => api.name);
      featureSpec = await extractFeatures(projectContext ?? '', apiNames);
      logger.info('Stage 0 완료: 기능 사양 추출', { features: featureSpec.features.length });
    } catch (error) {
      logger.warn('Stage 0 실패 — 기능 사양 없이 계속', { error });
    }

    // featureSpec이 있으면 Stage 1 시스템 프롬프트에 기능 체크리스트를 주입
    let stage1SystemPrompt = input.stage1SystemPrompt;
    if (featureSpec && featureSpec.features.length > 0) {
      const featureList = featureSpec.features
        .map((f) => `- [${f.id}] ${f.description} (검증: ${f.verifiableBy})`)
        .join('\n');
      stage1SystemPrompt = `${stage1SystemPrompt}

## 필수 구현 기능 목록

아래 기능들은 반드시 구현되어야 합니다. 각 기능에 맞는 DOM 요소와 Alpine.js 상태를 포함하세요:

${featureList}

생성 후 이 목록을 기준으로 모든 기능이 구현되었는지 자체 검토하세요.`;
    }

    try {
      aiProviderInit = AiProviderFactory.createForTask('generation');
    } catch (factoryErr) {
      throw new Error(`AI 서비스 초기화 실패: ${factoryErr instanceof Error ? factoryErr.message : 'Unknown'}`);
    }
    const aiProvider: IAiProvider = aiProviderInit;
    const useET = shouldUseExtendedThinking(apis, projectContext);

    if (useET) {
      logger.info('Extended Thinking enabled for generation', { projectId, apiCount: apis.length, contextLength: projectContext?.length ?? 0 });
    }

    // ── Stage 1: 구조·기능 생성 (5→28%) ───────────────────────────────────────
    const stage1Result = await runStage1(input.stage1SystemPrompt, input.stage1UserPrompt, aiProvider, sse, useET);
    const stage1Code = stage1Result.parsed;

    // Stage 1 정적 QC — stage2Function에 전달
    const stage1Validation = validateAll(stage1Code.html, stage1Code.css, stage1Code.js);
    const stage1Quality = evaluateQuality(stage1Code.html, stage1Code.css, stage1Code.js);
    const staticQcIssues: string[] = [
      ...stage1Validation.warnings,
      ...stage1Quality.details,
      ...(stage1Quality.fetchCallCount === 0 ? ['fetch() 호출이 없습니다 — 반드시 API 호출 추가'] : []),
      ...(stage1Quality.placeholderCount > 0 ? [`Placeholder 감지 (${stage1Quality.placeholderCount}개): 홍길동, 준비 중 등 제거 필요`] : []),
    ];

    const staticNeedsStage2 = stage1Quality.fetchCallCount === 0 || stage1Quality.placeholderCount > 0;

    let stage1FastQcIssues: string[] | null = null;
    let stage1FastQcPassed: boolean | null = null;

    if (!staticNeedsStage2 && isQcEnabled()) {
      const assembled = safeAssembleHtml(stage1Code);
      if (assembled) {
        try {
          const report = await runFastQc(assembled);
          if (report) {
            stage1FastQcIssues = report.checks.filter(c => !c.passed).map(c => c.name);
            stage1FastQcPassed = report.passed;
          }
        } catch {
          // Fast QC 실패해도 계속 진행
        }
      }
    }

    const needsStage2 = staticNeedsStage2 || stage1FastQcPassed === false;

    logger.info('Stage 2 necessity evaluated', { projectId, needsStage2, fetchCallCount: stage1Quality.fetchCallCount, placeholderCount: stage1Quality.placeholderCount, stage1FastQcPassed });

    // ── Stage 2: 기능 검증 (30→65%) ─────────────────────────────────────────
    let stage2Result: typeof stage1Result;
    if (needsStage2) {
      stage2Result = await runStage2Function(stage1Code, input.stage2FunctionSystemPrompt, input.buildStage2FunctionUserPrompt, staticQcIssues, stage1FastQcIssues, aiProvider, sse);
    } else {
      sse.send('progress', { step: 'stage1_complete', progress: 30, message: '구조 완성. 기능 검증 스킵 (품질 충분).' });
      generationTracker.updateProgress(projectId, 30, 'stage1_complete', '구조 완성. 기능 검증 스킵 (품질 충분).');
      sse.send('progress', { step: 'stage2_function_complete', progress: 65, message: '기능 검증 완성. 디자인 적용 중...' });
      generationTracker.updateProgress(projectId, 65, 'stage2_function_complete', '기능 검증 완성. 디자인 적용 중...');
      stage2Result = { ...stage1Result, durationMs: 0, tokensUsed: { input: 0, output: 0 } };
    }

    // ── Stage 3: 디자인·폴리시 (65→90%) ────────────────────────────────────
    const preStage3Quality = evaluateQuality(stage2Result.parsed.html, stage2Result.parsed.css, stage2Result.parsed.js);
    const skipStage3 =
      preStage3Quality.structuralScore >= 80 &&
      preStage3Quality.mobileScore >= 70 &&
      preStage3Quality.fetchCallCount > 0 &&
      preStage3Quality.placeholderCount === 0 &&
      !needsStage2;

    logger.info('Stage 3 necessity evaluated', { projectId, skipStage3, structuralScore: preStage3Quality.structuralScore, mobileScore: preStage3Quality.mobileScore });

    let stage3Result: typeof stage1Result;
    if (skipStage3) {
      sse.send('progress', { step: 'stage3_skipped', progress: 85, message: '디자인 검증 완료 — 품질 충분, 폴리시 스킵.' });
      generationTracker.updateProgress(projectId, 85, 'stage3_skipped', '디자인 검증 완료 — 품질 충분, 폴리시 스킵.');
      stage3Result = { ...stage2Result, durationMs: 0, tokensUsed: { input: 0, output: 0 }, userPrompt: '' };
    } else {
      stage3Result = await runStage3(stage2Result.parsed, input.stage2SystemPrompt, input.buildStage2UserPrompt, aiProvider, sse, !needsStage2);
    }

    // ── 검증 ────────────────────────────────────────────────────────────────
    sse.send('progress', { step: 'validating', progress: 85, message: '코드 검증 중...' });
    generationTracker.updateProgress(projectId, 85, 'validating', '코드 검증 중...');

    const parsed = stage3Result.parsed;
    const validation = validateAll(parsed.html, parsed.css, parsed.js);
    if (validation.errors.length > 0) {
      logger.warn('Generated code failed security validation', { projectId, errors: validation.errors });
      throw new Error(`생성된 코드에 보안 문제가 감지되었습니다: ${validation.errors.join(', ')}`);
    }

    const initialQuality = evaluateQuality(parsed.html, parsed.css, parsed.js);
    const aggregatedDuration = stage3Result.durationMs + stage2Result.durationMs + stage1Result.durationMs;
    const aggregatedTokens = {
      input: stage3Result.tokensUsed.input + stage2Result.tokensUsed.input + stage1Result.tokensUsed.input,
      output: stage3Result.tokensUsed.output + stage2Result.tokensUsed.output + stage1Result.tokensUsed.output,
    };

    // ── Fast QC ──────────────────────────────────────────────────────────────
    let initialQcReport: QcReport | null = null;
    if (isQcEnabled()) {
      const assembledForFastQc = safeAssembleHtml(parsed);
      try {
        initialQcReport = assembledForFastQc ? await runFastQc(assembledForFastQc) : null;
        if (initialQcReport) {
          logger.info('Fast QC completed', { projectId, qcScore: initialQcReport.overallScore, qcPassed: initialQcReport.passed });
          eventBus.emit({ type: 'QC_REPORT_COMPLETED', payload: { projectId, overallScore: initialQcReport.overallScore, passed: initialQcReport.passed, checks: initialQcReport.checks.map((c) => ({ name: c.name, passed: c.passed, score: c.score })), isDeep: false } });
        }
      } catch (qcErr) {
        logger.warn('Fast QC failed, continuing without', { projectId, qcErr });
        eventBus.emit({ type: 'QC_REPORT_FAILED', payload: { projectId, stage: 'fast' as const, error: qcErr instanceof Error ? qcErr.message : String(qcErr) } });
      }
    }

    // ── Quality Loop ──────────────────────────────────────────────────────────
    const { parsed: finalParsed, quality, qcReport, qualityLoopUsed } = await runQualityLoop(
      parsed, initialQuality, initialQcReport, input.stage2SystemPrompt, aiProvider, sse, useET, projectId,
    );

    // ── 저장 ─────────────────────────────────────────────────────────────────
    await saveGeneratedCode(
      {
        projectId, userId, correlationId,
        parsed: finalParsed, quality, qcReport, qualityLoopUsed,
        validation, apis, projectContext, extraMetadata,
        featureSpec,
        stage2Response: { provider: stage3Result.provider, model: stage3Result.model, durationMs: aggregatedDuration, tokensUsed: aggregatedTokens },
        userPromptUsed: stage3Result.userPrompt,
        codeRepo, projectService, projectRepo,
      },
      sse,
    );
  } catch (error) {
    await handlePipelineFailure(
      error,
      { projectId, userId, aiProviderName: aiProviderInit?.name },
      { rateLimitService },
      sse,
    );
  }
}
