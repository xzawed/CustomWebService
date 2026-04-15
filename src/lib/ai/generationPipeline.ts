import { AiProviderFactory } from '@/providers/ai/AiProviderFactory';
import type { IAiProvider } from '@/providers/ai/IAiProvider';
import { parseGeneratedCode } from '@/lib/ai/codeParser';
import { assembleHtml } from '@/lib/ai/codeParser';
import { validateAll, evaluateQuality } from '@/lib/ai/codeValidator';
import { shouldRetryGeneration, buildQualityImprovementPrompt } from '@/lib/ai/qualityLoop';
import { inferDesignFromCategories } from '@/lib/ai/categoryDesignMap';
import { runFastQc, runDeepQc, isQcEnabled } from '@/lib/qc';
import { eventBus } from '@/lib/events/eventBus';
import { getLimits } from '@/lib/config/features';
import { createServiceClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/logger';
import { suggestSlugs } from '@/lib/ai/slugSuggester';
import { extractTitle } from '@/lib/utils/htmlTitle';
import type { ICodeRepository, IEventRepository, IProjectRepository } from '@/repositories/interfaces';
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
  /** Stage 1 (구조·기능) 시스템 프롬프트 */
  stage1SystemPrompt: string;
  /** Stage 1 (구조·기능) 유저 프롬프트 */
  stage1UserPrompt: string;
  /** Stage 2 (기능 검증) 시스템 프롬프트 */
  stage2FunctionSystemPrompt: string;
  /**
   * Stage 2 기능 검증 유저 프롬프트 빌더.
   * Receives stage1Code + QC issues.
   */
  buildStage2FunctionUserPrompt: (
    stage1Code: { html: string; css: string; js: string },
    staticQcIssues: string[],
    fastQcIssues: string[] | null,
  ) => string;
  /** Stage 3 (디자인·폴리시) 시스템 프롬프트 */
  stage2SystemPrompt: string;
  /**
   * Stage 3 유저 프롬프트 빌더.
   */
  buildStage2UserPrompt: (stage1Code: { html: string; css: string; js: string }) => string;
  /** 코드 메타데이터에 병합할 추가 필드 */
  extraMetadata?: Record<string, unknown>;
}

export interface PipelineServices {
  codeRepo: ICodeRepository;
  eventRepo: IEventRepository;
  projectService: IProjectStatusUpdater;
  rateLimitService: IRateLimitDecrementer;
  /** slug 제안 저장용 (선택적 — 없으면 slug 훅 스킵) */
  projectRepo?: IProjectRepository;
}

// Safe wrapper: assembleHtml() can throw on malformed output
function safeAssembleHtml(code: { html: string; css: string; js: string }): string | null {
  try {
    return assembleHtml(code);
  } catch {
    return null;
  }
}

async function runDeepQcAndUpdate(
  projectId: string,
  codeId: string,
  parsed: { html: string; css: string; js: string },
): Promise<void> {
  const assembledForDeepQc = safeAssembleHtml(parsed);
  if (!assembledForDeepQc) {
    logger.warn('safeAssembleHtml returned null for Deep QC, skipping', { projectId });
    return;
  }

  runDeepQc(assembledForDeepQc)
    .then(async (deepReport) => {
      if (!deepReport) return;

      logger.info('Deep QC completed', {
        projectId,
        qcScore: deepReport.overallScore,
        qcPassed: deepReport.passed,
        checks: deepReport.checks.map((c) => ({ name: c.name, passed: c.passed, score: c.score })),
      });

      eventBus.emit({
        type: 'QC_REPORT_COMPLETED',
        payload: {
          projectId,
          overallScore: deepReport.overallScore,
          passed: deepReport.passed,
          checks: deepReport.checks.map((c) => ({ name: c.name, passed: c.passed, score: c.score })),
          isDeep: true,
        },
      });

      try {
        const serviceClient = await createServiceClient();
        const { data: current } = await serviceClient
          .from('generated_codes')
          .select('metadata')
          .eq('id', codeId)
          .single();
        if (current) {
          await serviceClient
            .from('generated_codes')
            .update({
              metadata: {
                ...((current.metadata as Record<string, unknown>) ?? {}),
                renderingQcScore: deepReport.overallScore,
                renderingQcPassed: deepReport.passed,
                renderingQcChecks: deepReport.checks.map((c) => ({
                  name: c.name,
                  passed: c.passed,
                  score: c.score,
                  details: c.details,
                })),
              },
            })
            .eq('id', codeId);
        }
      } catch (updateErr) {
        logger.warn('Deep QC metadata update failed', {
          projectId,
          codeId,
          error: updateErr instanceof Error ? updateErr.message : String(updateErr),
        });
      }
    })
    .catch(async (qcErr) => {
      logger.warn('Deep QC failed', {
        projectId,
        codeId,
        error: qcErr instanceof Error ? qcErr.stack : String(qcErr),
      });
      eventBus.emit({
        type: 'QC_REPORT_FAILED',
        payload: {
          projectId,
          stage: 'deep' as const,
          error: qcErr instanceof Error ? qcErr.message : String(qcErr),
        },
      });
      try {
        const serviceClient = await createServiceClient();
        const { data: current } = await serviceClient
          .from('generated_codes')
          .select('metadata')
          .eq('id', codeId)
          .single();
        if (current) {
          await serviceClient
            .from('generated_codes')
            .update({
              metadata: {
                ...((current.metadata as Record<string, unknown>) ?? {}),
                deepQcFailed: true,
              },
            })
            .eq('id', codeId);
        }
      } catch (updateErr) {
        logger.warn('Deep QC failure metadata update failed', {
          codeId,
          error: updateErr instanceof Error ? updateErr.message : String(updateErr),
        });
      }
    });
}

async function runStage1(
  systemPrompt: string,
  userPrompt: string,
  aiProvider: IAiProvider,
  sse: SseWriter,
): Promise<{
  parsed: { html: string; css: string; js: string };
  durationMs: number;
  tokensUsed: { input: number; output: number };
}> {
  let lastProgressUpdate = Date.now();
  const streamStartTime = Date.now();

  sse.send('progress', { step: 'stage1_generating', progress: 5, message: '1단계: 구조 및 기능 생성 중...' });

  const response = await aiProvider.generateCodeStream(
    { system: systemPrompt, user: userPrompt },
    (_chunk: string, accumulated: string) => {
      if (sse.isCancelled()) return;
      const now = Date.now();
      if (now - lastProgressUpdate < 500) return;
      lastProgressUpdate = now;
      const estimatedProgress = Math.min(28, 5 + Math.floor((accumulated.length / 15000) * 23));
      const elapsed = Math.floor((now - streamStartTime) / 1000);
      sse.send('progress', {
        step: 'stage1_generating',
        progress: estimatedProgress,
        message: `1단계: 구조 및 기능 생성 중... (${elapsed}초 경과, ${(accumulated.length / 1024).toFixed(1)}KB)`,
      });
    },
  );

  return {
    parsed: parseGeneratedCode(response.content),
    durationMs: response.durationMs,
    tokensUsed: response.tokensUsed,
  };
}

async function runStage2Function(
  stage1Code: { html: string; css: string; js: string },
  systemPrompt: string,
  buildUserPrompt: (
    code: { html: string; css: string; js: string },
    staticIssues: string[],
    qcIssues: string[] | null,
  ) => string,
  staticQcIssues: string[],
  fastQcIssues: string[] | null,
  aiProvider: IAiProvider,
  sse: SseWriter,
): Promise<{
  parsed: { html: string; css: string; js: string };
  durationMs: number;
  tokensUsed: { input: number; output: number };
}> {
  sse.send('progress', { step: 'stage1_complete', progress: 30, message: '구조 완성. 기능 검증 중...' });
  sse.send('progress', { step: 'stage2_function_generating', progress: 35, message: '2단계: 기능 버그 수정 중...' });

  const userPrompt = buildUserPrompt(stage1Code, staticQcIssues, fastQcIssues);
  let lastProgressUpdate = Date.now();
  const streamStartTime = Date.now();

  const response = await aiProvider.generateCodeStream(
    { system: systemPrompt, user: userPrompt },
    (_chunk: string, accumulated: string) => {
      if (sse.isCancelled()) return;
      const now = Date.now();
      if (now - lastProgressUpdate < 500) return;
      lastProgressUpdate = now;
      const estimatedProgress = Math.min(62, 35 + Math.floor((accumulated.length / 10000) * 27));
      const elapsed = Math.floor((now - streamStartTime) / 1000);
      sse.send('progress', {
        step: 'stage2_function_generating',
        progress: estimatedProgress,
        message: `2단계: 기능 버그 수정 중... (${elapsed}초 경과)`,
      });
    },
  );

  return {
    parsed: parseGeneratedCode(response.content),
    durationMs: response.durationMs,
    tokensUsed: response.tokensUsed,
  };
}

async function runStage2(
  stage1Code: { html: string; css: string; js: string },
  systemPrompt: string,
  buildUserPrompt: (code: { html: string; css: string; js: string }) => string,
  aiProvider: IAiProvider,
  sse: SseWriter,
  /** Stage 2 스킵 시 이미 stage2_function_complete 이벤트가 발행된 경우 true */
  stage2FunctionCompleteAlreadySent = false,
): Promise<{
  parsed: { html: string; css: string; js: string };
  provider: string;
  model: string;
  durationMs: number;
  tokensUsed: { input: number; output: number };
  userPromptUsed: string;
}> {
  if (!stage2FunctionCompleteAlreadySent) {
    sse.send('progress', { step: 'stage2_function_complete', progress: 65, message: '기능 검증 완성. 디자인 적용 중...' });
  }
  sse.send('progress', { step: 'stage3_generating', progress: 68, message: '3단계: 디자인 및 인터랙션 적용 중...' });

  const userPrompt = buildUserPrompt(stage1Code);

  let lastProgressUpdate = Date.now();
  const streamStartTime = Date.now();

  const response = await aiProvider.generateCodeStream(
    { system: systemPrompt, user: userPrompt },
    (_chunk: string, accumulated: string) => {
      if (sse.isCancelled()) return;
      const now = Date.now();
      if (now - lastProgressUpdate < 500) return;
      lastProgressUpdate = now;
      const estimatedProgress = Math.min(82, 68 + Math.floor((accumulated.length / 15000) * 14));
      const elapsed = Math.floor((now - streamStartTime) / 1000);
      sse.send('progress', {
        step: 'stage3_generating',
        progress: estimatedProgress,
        message: `3단계: 디자인 및 인터랙션 적용 중... (${elapsed}초 경과, ${(accumulated.length / 1024).toFixed(1)}KB)`,
      });
    },
  );

  return {
    parsed: parseGeneratedCode(response.content),
    provider: response.provider,
    model: response.model,
    durationMs: response.durationMs,
    tokensUsed: response.tokensUsed,
    userPromptUsed: userPrompt,
  };
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
  const { codeRepo, eventRepo, projectService, rateLimitService, projectRepo } = services;
  const limits = getLimits();

  const stage1SystemPrompt = input.stage1SystemPrompt;
  const stage1UserPrompt = input.stage1UserPrompt;
  const stage2FunctionSystemPrompt = input.stage2FunctionSystemPrompt;
  const buildStage2FunctionUserPromptFn = input.buildStage2FunctionUserPrompt;
  const stage2SystemPrompt = input.stage2SystemPrompt;
  const buildStage2UserPrompt = input.buildStage2UserPrompt;

  let aiProviderInit: IAiProvider | undefined;

  try {
    sse.send('progress', { step: 'analyzing', progress: 5, message: '분석 중...' });

    try {
      aiProviderInit = AiProviderFactory.createForTask('generation');
    } catch (factoryErr) {
      throw new Error(
        `AI 서비스 초기화 실패: ${factoryErr instanceof Error ? factoryErr.message : 'Unknown'}`,
      );
    }
    const aiProvider: IAiProvider = aiProviderInit;

    // Stage 1: 구조·기능 생성 (0→30%)
    const stage1Result = await runStage1(
      stage1SystemPrompt,
      stage1UserPrompt,
      aiProvider,
      sse,
    );
    const stage1Code = stage1Result.parsed;

    if (sse.isCancelled()) return;

    // Stage 1 정적 QC — stage2Function에 전달
    const stage1Validation = validateAll(stage1Code.html, stage1Code.css, stage1Code.js);
    const stage1Quality = evaluateQuality(stage1Code.html, stage1Code.css, stage1Code.js);
    const staticQcIssues: string[] = [
      ...stage1Validation.warnings,
      ...stage1Quality.details,
      ...(stage1Quality.fetchCallCount === 0
        ? ['fetch() 호출이 없습니다 — 반드시 API 호출 추가']
        : []),
      ...(stage1Quality.placeholderCount > 0
        ? [`Placeholder 감지 (${stage1Quality.placeholderCount}개): 홍길동, 준비 중 등 제거 필요`]
        : []),
    ];

    // Stage 1 Fast QC (기능 문제 감지용)
    let stage1FastQcIssues: string[] | null = null;
    let stage1FastQcPassed: boolean | null = null;
    if (isQcEnabled()) {
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

    // Stage 2 필요 여부 판단
    const needsStage2 =
      stage1Quality.fetchCallCount === 0 ||
      stage1Quality.placeholderCount > 0 ||
      stage1FastQcPassed === false;

    logger.info('Stage 2 necessity evaluated', {
      projectId,
      needsStage2,
      fetchCallCount: stage1Quality.fetchCallCount,
      placeholderCount: stage1Quality.placeholderCount,
      stage1FastQcPassed,
    });

    // Stage 2: 기능 검증 (30→65%) — 품질 부족 시에만 실행
    let stage2FunctionResult: {
      parsed: { html: string; css: string; js: string };
      durationMs: number;
      tokensUsed: { input: number; output: number };
    };

    if (needsStage2) {
      stage2FunctionResult = await runStage2Function(
        stage1Code,
        stage2FunctionSystemPrompt,
        buildStage2FunctionUserPromptFn,
        staticQcIssues,
        stage1FastQcIssues,
        aiProvider,
        sse,
      );
    } else {
      // Stage 2 스킵: Stage 1 결과를 그대로 통과시킴
      sse.send('progress', { step: 'stage1_complete', progress: 30, message: '구조 완성. 기능 검증 스킵 (품질 충분).' });
      sse.send('progress', { step: 'stage2_function_complete', progress: 65, message: '기능 검증 완성. 디자인 적용 중...' });
      stage2FunctionResult = {
        parsed: stage1Code,
        durationMs: 0,
        tokensUsed: { input: 0, output: 0 },
      };
    }

    if (sse.isCancelled()) return;

    // Stage 3: 디자인·폴리시 적용 (65→90%)
    const stage3Result = await runStage2(
      stage2FunctionResult.parsed,
      stage2SystemPrompt,
      buildStage2UserPrompt,
      aiProvider,
      sse,
      !needsStage2,
    );

    if (sse.isCancelled()) return;

    sse.send('progress', { step: 'validating', progress: 85, message: '코드 검증 중...' });

    let parsed = stage3Result.parsed;
    const stage2Response = {
      provider: stage3Result.provider,
      model: stage3Result.model,
      durationMs: stage3Result.durationMs + stage2FunctionResult.durationMs + stage1Result.durationMs,
      tokensUsed: {
        input: stage3Result.tokensUsed.input + stage2FunctionResult.tokensUsed.input + stage1Result.tokensUsed.input,
        output: stage3Result.tokensUsed.output + stage2FunctionResult.tokensUsed.output + stage1Result.tokensUsed.output,
      },
    };

    const validation = validateAll(parsed.html, parsed.css, parsed.js);
    if (validation.errors.length > 0) {
      logger.warn('Generated code failed security validation', { projectId, errors: validation.errors });
      throw new Error(`생성된 코드에 보안 문제가 감지되었습니다: ${validation.errors.join(', ')}`);
    }

    let quality = evaluateQuality(parsed.html, parsed.css, parsed.js);

    // Fast QC
    let qcReport: QcReport | null = null;
    if (isQcEnabled()) {
      const assembledForFastQc = safeAssembleHtml(parsed);
      if (!assembledForFastQc) {
        logger.warn('safeAssembleHtml returned null for Fast QC, skipping', { projectId });
      }
      try {
        qcReport = assembledForFastQc ? await runFastQc(assembledForFastQc) : null;
        if (qcReport) {
          logger.info('Fast QC completed', { projectId, qcScore: qcReport.overallScore, qcPassed: qcReport.passed });
          eventBus.emit({
            type: 'QC_REPORT_COMPLETED',
            payload: {
              projectId,
              overallScore: qcReport.overallScore,
              passed: qcReport.passed,
              checks: qcReport.checks.map((c) => ({ name: c.name, passed: c.passed, score: c.score })),
              isDeep: false,
            },
          });
        }
      } catch (qcErr) {
        logger.warn('Fast QC failed, continuing without', { projectId, qcErr });
        eventBus.emit({
          type: 'QC_REPORT_FAILED',
          payload: {
            projectId,
            stage: 'fast' as const,
            error: qcErr instanceof Error ? qcErr.message : String(qcErr),
          },
        });
      }
    }

    // Quality loop (최대 2회 재시도, 최선 버전 추적)
    let bestParsed = parsed;
    let bestQuality = quality;
    let bestQcReport = qcReport;
    let qualityLoopUsed = false;

    for (let attempt = 0; attempt < 3; attempt++) {
      if (!shouldRetryGeneration(bestQuality, bestQcReport)) break;

      logger.info('Quality below threshold, attempting improvement', {
        projectId,
        score: bestQuality.structuralScore,
        attempt: attempt + 1,
      });

      sse.send('progress', { step: 'quality_improvement', progress: 92, message: '품질 개선 중...' });

      try {
        const improvementPrompt = buildQualityImprovementPrompt(bestParsed, bestQuality, bestQcReport);
        const retryResponse = await aiProvider.generateCode({
          system: stage2SystemPrompt,
          user: improvementPrompt,
          extendedThinking: true,
        });
        const retryParsed = parseGeneratedCode(retryResponse.content);

        if (retryParsed.html) {
          const retryQuality = evaluateQuality(retryParsed.html, retryParsed.css, retryParsed.js);
          let retryQcReport: QcReport | null = null;

          if (isQcEnabled()) {
            try {
              const assembled = safeAssembleHtml(retryParsed);
              if (assembled) retryQcReport = await runFastQc(assembled);
            } catch {
              // QC 실패해도 코드 레벨 비교 진행
            }
          }

          const codeImproved =
            retryQuality.structuralScore > bestQuality.structuralScore ||
            retryQuality.mobileScore > bestQuality.mobileScore;
          const qcImproved =
            retryQcReport && bestQcReport
              ? retryQcReport.overallScore > bestQcReport.overallScore
              : false;

          if (codeImproved || qcImproved) {
            bestParsed = retryParsed;
            bestQuality = retryQuality;
            if (retryQcReport) bestQcReport = retryQcReport;
            qualityLoopUsed = true;
          }
        }
      } catch (retryErr) {
        logger.warn('Quality improvement retry failed', { projectId, retryErr });
      }
    }

    parsed = bestParsed;
    quality = bestQuality;
    qcReport = bestQcReport;

    const categories = [...new Set(apis.map((a) => a.category).filter(Boolean))];
    const inference = inferDesignFromCategories(categories);
    const nextVersion = await codeRepo.getNextVersion(projectId);

    sse.send('progress', { step: 'saving', progress: 95, message: '저장 중...' });

    const savedCode = await codeRepo.create({
      projectId,
      version: nextVersion,
      codeHtml: parsed.html,
      codeCss: parsed.css,
      codeJs: parsed.js,
      framework: 'vanilla',
      aiProvider: stage2Response.provider,
      aiModel: stage2Response.model,
      aiPromptUsed: stage3Result.userPromptUsed,
      generationTimeMs: stage2Response.durationMs,
      tokenUsage: stage2Response.tokensUsed,
      dependencies: [],
      metadata: {
        securityCheckPassed: validation.passed,
        validationErrors: [...validation.errors, ...validation.warnings],
        ...extraMetadata,
        ...quality,
        apiCategories: categories,
        inferredTheme: inference.theme,
        inferredLayout: inference.layout,
        qualityLoopUsed,
        ...(qcReport && {
          renderingQcScore: qcReport.overallScore,
          renderingQcPassed: qcReport.passed,
          renderingQcChecks: qcReport.checks.map((c) => ({
            name: c.name,
            passed: c.passed,
            score: c.score,
            details: c.details,
          })),
        }),
      },
    } as Parameters<typeof codeRepo.create>[0]);

    // Stage 3 완료 후, best-effort slug 제안 (실패해도 파이프라인 계속)
    if (projectRepo && projectContext) {
      try {
        const pageTitle = extractTitle(parsed.html);
        const slugs = await suggestSlugs({
          context: projectContext,
          pageTitle,
          categoryHints: apis.map((a) => a.category).filter((c): c is string => Boolean(c)),
        });
        if (slugs.length > 0) {
          await projectRepo.updateSuggestedSlugs(projectId, slugs);
        }
      } catch (err) {
        logger.warn('slug 제안 훅 실패 (무시)', {
          projectId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    try {
      await codeRepo.pruneOldVersions(projectId, limits.maxCodeVersionsPerProject);
    } catch (pruneErr) {
      logger.warn('Failed to prune old code versions', { projectId, pruneErr });
    }

    // Deep QC — Fast QC 실패 시에만 실행 (비용 최적화)
    if (isQcEnabled() && qcReport && !qcReport.passed) {
      void runDeepQcAndUpdate(projectId, savedCode.id, parsed);
    }

    // Compensating rollback — project status update 실패 시 코드 레코드 삭제
    try {
      await projectService.updateStatus(projectId, 'generated');
    } catch (updateError) {
      logger.error('Project status update failed, rolling back code record', {
        codeId: savedCode.id,
        projectId,
      });
      try {
        await codeRepo.delete(savedCode.id);
      } catch (deleteErr) {
        logger.error('Compensating rollback failed — orphaned code record', {
          codeId: savedCode.id,
          deleteErr,
        });
      }
      throw updateError;
    }

    const generatedEvent = {
      type: 'CODE_GENERATED' as const,
      payload: {
        projectId,
        version: nextVersion,
        provider: stage2Response.provider,
        durationMs: stage2Response.durationMs,
      },
    };
    eventBus.emit(generatedEvent);
    eventRepo.persistAsync(generatedEvent, { userId, projectId, correlationId });

    sse.send('complete', {
      projectId,
      version: nextVersion,
      previewUrl: `/api/v1/preview/${projectId}`,
      ...(qcReport && {
        qcResult: {
          score: qcReport.overallScore,
          passed: qcReport.passed,
          issues: qcReport.checks
            .filter((c) => !c.passed)
            .map((c) => ({ name: c.name, details: c.details })),
        },
      }),
    });
  } catch (error) {
    logger.error('Code generation pipeline failed', {
      projectId,
      error: error instanceof Error ? error.message : 'Unknown',
    });

    await rateLimitService.decrementDailyLimit(userId);

    const failedEvent = {
      type: 'CODE_GENERATION_FAILED' as const,
      payload: {
        projectId,
        error: error instanceof Error ? error.message : 'Unknown error',
        provider: aiProviderInit?.name ?? 'unknown',
      },
    };
    eventBus.emit(failedEvent);
    eventRepo.persistAsync(failedEvent, { userId, projectId, correlationId });

    sse.send('error', {
      message: error instanceof Error ? error.message : '코드 생성에 실패했습니다.',
    });
  }
}
