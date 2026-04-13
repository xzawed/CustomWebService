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
import type { ICodeRepository, IEventRepository } from '@/repositories/interfaces';
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
  systemPrompt: string;
  userPrompt: string;
  /** Extra fields merged into code metadata (e.g. { userFeedback }) */
  extraMetadata?: Record<string, unknown>;
  /** Label shown while AI is streaming (e.g. "코드 생성 중..." or "코드 수정 중...") */
  streamingLabel: string;
}

export interface PipelineServices {
  codeRepo: ICodeRepository;
  eventRepo: IEventRepository;
  projectService: IProjectStatusUpdater;
  rateLimitService: IRateLimitDecrementer;
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

/**
 * 공통 코드 생성/재생성 파이프라인.
 * SSE 스트림 내부에서 호출되며, 에러 처리(rate limit 복구, 이벤트 발행)도 포함합니다.
 */
export async function runGenerationPipeline(
  input: PipelineInput,
  sse: SseWriter,
  services: PipelineServices,
): Promise<void> {
  const { projectId, userId, correlationId, apis, systemPrompt, userPrompt, extraMetadata, streamingLabel } = input;
  const { codeRepo, eventRepo, projectService, rateLimitService } = services;
  const limits = getLimits();

  let aiProvider: IAiProvider | undefined;

  try {
    sse.send('progress', { step: 'analyzing', progress: 5, message: '분석 중...' });

    try {
      aiProvider = AiProviderFactory.createForTask('generation');
    } catch (factoryErr) {
      throw new Error(
        `AI 서비스 초기화 실패: ${factoryErr instanceof Error ? factoryErr.message : 'Unknown'}`,
      );
    }

    sse.send('progress', { step: 'generating_code', progress: 10, message: '코드 생성 시작...' });

    let lastProgressUpdate = Date.now();
    const streamStartTime = Date.now();

    const response = await aiProvider.generateCodeStream(
      { system: systemPrompt, user: userPrompt },
      (_chunk: string, accumulated: string) => {
        if (sse.isCancelled()) return;

        const now = Date.now();
        if (now - lastProgressUpdate < 500) return;
        lastProgressUpdate = now;

        const estimatedProgress = Math.min(80, 10 + Math.floor((accumulated.length / 15000) * 70));
        const elapsed = Math.floor((now - streamStartTime) / 1000);

        sse.send('progress', {
          step: 'generating_code',
          progress: estimatedProgress,
          message: `${streamingLabel} (${elapsed}초 경과, ${(accumulated.length / 1024).toFixed(1)}KB)`,
        });
      },
    );

    if (sse.isCancelled()) return;

    sse.send('progress', { step: 'styling', progress: 85, message: '디자인 적용 중...' });

    let parsed = parseGeneratedCode(response.content);

    sse.send('progress', { step: 'validating', progress: 90, message: '코드 검증 중...' });

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

    for (let attempt = 0; attempt < 2; attempt++) {
      if (!shouldRetryGeneration(bestQuality, bestQcReport)) break;

      logger.info('Quality below threshold, attempting improvement', {
        projectId,
        score: bestQuality.structuralScore,
        attempt: attempt + 1,
      });

      sse.send('progress', { step: 'quality_improvement', progress: 92, message: '품질 개선 중...' });

      try {
        const improvementPrompt = buildQualityImprovementPrompt(bestParsed, bestQuality, bestQcReport);
        const retryResponse = await aiProvider!.generateCode({ system: systemPrompt, user: improvementPrompt });
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

    const savedCode = await codeRepo.create({
      projectId,
      version: nextVersion,
      codeHtml: parsed.html,
      codeCss: parsed.css,
      codeJs: parsed.js,
      framework: 'vanilla',
      aiProvider: response.provider,
      aiModel: response.model,
      aiPromptUsed: userPrompt,
      generationTimeMs: response.durationMs,
      tokenUsage: response.tokensUsed,
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
        provider: response.provider,
        durationMs: response.durationMs,
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
        provider: aiProvider?.name ?? 'unknown',
      },
    };
    eventBus.emit(failedEvent);
    eventRepo.persistAsync(failedEvent, { userId, projectId, correlationId });

    sse.send('error', {
      message: error instanceof Error ? error.message : '코드 생성에 실패했습니다.',
    });
  }
}
