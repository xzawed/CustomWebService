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
  } catch (err) {
    logger.warn('[Pipeline] assembleHtml failed — QC 스킵', {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

export function injectFeatureSpec(systemPrompt: string, featureSpec: FeatureSpec | null): string {
  if (!featureSpec || featureSpec.features.length === 0) return systemPrompt;
  const featureList = featureSpec.features
    .map((f) => `- [${f.id}] ${f.description} (검증: ${f.verifiableBy})`)
    .join('\n');
  return `${systemPrompt}

## 필수 구현 기능 목록

아래 기능들은 반드시 구현되어야 합니다. 각 기능에 맞는 DOM 요소와 Alpine.js 상태를 포함하세요:

${featureList}

생성 후 이 목록을 기준으로 모든 기능이 구현되었는지 자체 검토하세요.`;
}

interface Stage1QcResult {
  staticQcIssues: string[];
  staticNeedsStage2: boolean;
}

function collectStage1Issues(
  stage1Quality: ReturnType<typeof evaluateQuality>,
  stage1Validation: ReturnType<typeof validateAll>,
): Stage1QcResult {
  const staticQcIssues: string[] = [
    ...stage1Validation.warnings,
    ...stage1Quality.details,
    ...(stage1Quality.fetchCallCount === 0 ? ['fetch() 호출이 없습니다 — 반드시 API 호출 추가'] : []),
    ...(!stage1Quality.hasProxyCall && stage1Quality.fetchCallCount > 0
      ? ['직접 외부 URL fetch 감지 — 모든 API 호출은 /api/v1/proxy 경유 필수']
      : []),
    ...(stage1Quality.placeholderCount > 0
      ? [`Placeholder 감지 (${stage1Quality.placeholderCount}개): 홍길동, 준비 중 등 제거 필요`]
      : []),
  ];
  const staticNeedsStage2 =
    stage1Quality.fetchCallCount === 0 ||
    stage1Quality.placeholderCount > 0 ||
    stage1Quality.hardcodedArrayCount > 0 ||
    (!stage1Quality.hasProxyCall && stage1Quality.fetchCallCount > 0);
  return { staticQcIssues, staticNeedsStage2 };
}

async function runStage1FastQcIfNeeded(
  stage1Code: { html: string; css: string; js: string },
  staticNeedsStage2: boolean,
): Promise<{ issues: string[] | null; passed: boolean | null }> {
  if (staticNeedsStage2 || !isQcEnabled()) return { issues: null, passed: null };
  const assembled = safeAssembleHtml(stage1Code);
  if (!assembled) return { issues: null, passed: null };
  try {
    const report = await runFastQc(assembled);
    if (!report) return { issues: null, passed: null };
    return {
      issues: report.checks.filter((c) => !c.passed).map((c) => c.name),
      passed: report.passed,
    };
  } catch {
    return { issues: null, passed: null };
  }
}

type StageResult = Awaited<ReturnType<typeof runStage1>>;

async function resolveStage2(
  stage1Result: StageResult,
  needsStage2: boolean,
  input: PipelineInput,
  staticQcIssues: string[],
  stage1FastQcIssues: string[] | null,
  aiProvider: IAiProvider,
  sse: SseWriter,
  projectId: string,
): Promise<StageResult> {
  if (needsStage2) {
    return runStage2Function(
      stage1Result.parsed,
      input.stage2FunctionSystemPrompt,
      input.buildStage2FunctionUserPrompt,
      staticQcIssues,
      stage1FastQcIssues,
      aiProvider,
      sse,
    );
  }
  sse.send('progress', { step: 'stage1_complete', progress: 30, message: '구조 완성. 기능 검증 스킵 (품질 충분).' });
  generationTracker.updateProgress(projectId, 30, 'stage1_complete', '구조 완성. 기능 검증 스킵 (품질 충분).');
  sse.send('progress', { step: 'stage2_function_complete', progress: 65, message: '기능 검증 완성. 디자인 적용 중...' });
  generationTracker.updateProgress(projectId, 65, 'stage2_function_complete', '기능 검증 완성. 디자인 적용 중...');
  eventBus.emit({
    type: 'STAGE_SKIPPED',
    payload: { projectId, stage: 'stage2', reason: 'stage1 quality sufficient (fetch present, no placeholder, fast QC passed)' },
  });
  return { ...stage1Result, durationMs: 0, tokensUsed: { input: 0, output: 0 } };
}

async function resolveStage3(
  stage2Result: StageResult,
  skipStage3: boolean,
  needsStage2: boolean,
  input: PipelineInput,
  aiProvider: IAiProvider,
  sse: SseWriter,
  projectId: string,
): Promise<StageResult> {
  if (skipStage3) {
    sse.send('progress', { step: 'stage3_skipped', progress: 85, message: '디자인 검증 완료 — 품질 충분, 폴리시 스킵.' });
    generationTracker.updateProgress(projectId, 85, 'stage3_skipped', '디자인 검증 완료 — 품질 충분, 폴리시 스킵.');
    eventBus.emit({
      type: 'STAGE_SKIPPED',
      payload: { projectId, stage: 'stage3', reason: 'pre-stage3 quality sufficient (structuralScore>=80, mobileScore>=70, fetch present, no placeholder, stage2 unneeded)' },
    });
    return { ...stage2Result, durationMs: 0, tokensUsed: { input: 0, output: 0 }, userPrompt: '' };
  }
  try {
    return await runStage3(stage2Result.parsed, input.stage2SystemPrompt, input.buildStage2UserPrompt, aiProvider, sse, !needsStage2);
  } catch (stage3Err) {
    const stage3ErrMsg = stage3Err instanceof Error ? stage3Err.message : String(stage3Err);
    logger.warn('Stage 3 (design polish) failed — falling back to Stage 2 result', { projectId, error: stage3ErrMsg });
    eventBus.emit({ type: 'STAGE3_FALLBACK_USED', payload: { projectId, error: stage3ErrMsg } });
    sse.send('progress', { step: 'stage3_fallback', progress: 85, message: '디자인 적용 중 오류 — 기능 검증 버전으로 진행합니다.' });
    generationTracker.updateProgress(projectId, 85, 'stage3_fallback', '디자인 적용 중 오류 — 기능 검증 버전으로 진행합니다.');
    return { ...stage2Result, durationMs: 0, tokensUsed: { input: 0, output: 0 }, userPrompt: '' };
  }
}

async function runFinalFastQc(
  parsed: { html: string; css: string; js: string },
  projectId: string,
): Promise<QcReport | null> {
  if (!isQcEnabled()) return null;
  const assembled = safeAssembleHtml(parsed);
  try {
    const report = assembled ? await runFastQc(assembled) : null;
    if (report) {
      logger.info('Fast QC completed', { projectId, qcScore: report.overallScore, qcPassed: report.passed });
      eventBus.emit({
        type: 'QC_REPORT_COMPLETED',
        payload: {
          projectId,
          overallScore: report.overallScore,
          passed: report.passed,
          checks: report.checks.map((c) => ({ name: c.name, passed: c.passed, score: c.score })),
          isDeep: false,
        },
      });
    }
    return report;
  } catch (qcErr) {
    logger.warn('Fast QC failed, continuing without', { projectId, qcErr });
    eventBus.emit({ type: 'QC_REPORT_FAILED', payload: { projectId, stage: 'fast' as const, error: qcErr instanceof Error ? qcErr.message : String(qcErr) } });
    return null;
  }
}

async function extractFeaturesOrNull(projectContext: string | undefined, apis: ApiCatalogItem[]): Promise<FeatureSpec | null> {
  try {
    const apiNames = apis.map((api) => api.name);
    const spec = await extractFeatures(projectContext ?? '', apiNames);
    logger.info('Stage 0 완료: 기능 사양 추출', { features: spec.features.length });
    return spec;
  } catch (error) {
    logger.warn('Stage 0 실패 — 기능 사양 없이 계속', { error });
    return null;
  }
}

function createAiProvider(): IAiProvider {
  try {
    return AiProviderFactory.createForTask('generation');
  } catch (factoryErr) {
    throw new Error(`AI 서비스 초기화 실패: ${factoryErr instanceof Error ? factoryErr.message : 'Unknown'}`);
  }
}

const _etVal = Number.parseInt(process.env.ET_COMPLEXITY_THRESHOLD ?? '', 10);
const ET_THRESHOLD = Number.isNaN(_etVal) || _etVal <= 0 ? 35 : _etVal;

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

  let aiProvider: IAiProvider | undefined;

  generationTracker.start(projectId, userId);

  try {
    sse.send('progress', { step: 'analyzing', progress: 5, message: '분석 중...' });
    generationTracker.updateProgress(projectId, 5, 'analyzing', '분석 중...');

    // Stage 0: 기능 사양 추출 (best-effort — 실패해도 파이프라인 계속)
    const featureSpec = await extractFeaturesOrNull(projectContext, apis);

    // featureSpec이 있으면 Stage 1 시스템 프롬프트에 기능 체크리스트를 주입
    const stage1SystemPrompt = injectFeatureSpec(input.stage1SystemPrompt, featureSpec);

    aiProvider = createAiProvider();
    const useET = shouldUseExtendedThinking(apis, projectContext);
    if (useET) {
      logger.info('Extended Thinking enabled for generation', { projectId, apiCount: apis.length, contextLength: projectContext?.length ?? 0 });
    }

    // ── Stage 1: 구조·기능 생성 (5→28%) ───────────────────────────────────────
    const stage1Result = await runStage1(stage1SystemPrompt, input.stage1UserPrompt, aiProvider, sse, useET);
    const stage1Code = stage1Result.parsed;

    // Stage 1 정적 QC — stage2Function에 전달
    const stage1Validation = validateAll(stage1Code.html, stage1Code.css, stage1Code.js);
    const stage1Quality = evaluateQuality(stage1Code.html, stage1Code.css, stage1Code.js);
    const { staticQcIssues, staticNeedsStage2 } = collectStage1Issues(stage1Quality, stage1Validation);
    const { issues: stage1FastQcIssues, passed: stage1FastQcPassed } = await runStage1FastQcIfNeeded(stage1Code, staticNeedsStage2);
    const needsStage2 = staticNeedsStage2 || stage1FastQcPassed === false;
    logger.info('Stage 2 necessity evaluated', { projectId, needsStage2, fetchCallCount: stage1Quality.fetchCallCount, placeholderCount: stage1Quality.placeholderCount, hardcodedArrayCount: stage1Quality.hardcodedArrayCount, stage1FastQcPassed });

    // ── Stage 2: 기능 검증 (30→65%) ─────────────────────────────────────────
    const stage2Result = await resolveStage2(stage1Result, needsStage2, input, staticQcIssues, stage1FastQcIssues, aiProvider, sse, projectId);

    // ── Stage 3: 디자인·폴리시 (65→90%) ────────────────────────────────────
    const preStage3Quality = evaluateQuality(stage2Result.parsed.html, stage2Result.parsed.css, stage2Result.parsed.js);
    const skipStage3 =
      preStage3Quality.structuralScore >= 80 &&
      preStage3Quality.mobileScore >= 70 &&
      preStage3Quality.fetchCallCount > 0 &&
      preStage3Quality.placeholderCount === 0 &&
      !needsStage2;
    logger.info('Stage 3 necessity evaluated', { projectId, skipStage3, structuralScore: preStage3Quality.structuralScore, mobileScore: preStage3Quality.mobileScore });

    const stage3Result = await resolveStage3(stage2Result, skipStage3, needsStage2, input, aiProvider, sse, projectId);

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
    const initialQcReport = await runFinalFastQc(parsed, projectId);

    // ── Quality Loop ──────────────────────────────────────────────────────────
    const userFeedback = typeof extraMetadata?.userFeedback === 'string' ? extraMetadata.userFeedback : undefined;
    const { parsed: finalParsed, quality, qcReport, qualityLoopUsed } = await runQualityLoop(
      parsed, initialQuality, initialQcReport,
      { stage2SystemPrompt: input.stage2SystemPrompt, stage2FunctionSystemPrompt: input.stage2FunctionSystemPrompt, aiProvider, sse, useET, projectId, userFeedback },
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
      { projectId, userId, aiProviderName: aiProvider?.name },
      { rateLimitService },
      sse,
    );
  }
}
