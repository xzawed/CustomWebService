import { eventBus } from '@/lib/events/eventBus';
import { getLimits } from '@/lib/config/features';
import { isQcEnabled } from '@/lib/qc';
import { inferDesignFromCategories } from '@/lib/ai/categoryDesignMap';
import { suggestSlugs } from '@/lib/ai/slugSuggester';
import { extractTitle } from '@/lib/utils/htmlTitle';
import { generationTracker } from '@/lib/ai/generationTracker';
import { runDeepQcAndUpdate } from '@/lib/qc/deepQcRunner';
import { logger } from '@/lib/utils/logger';
import { validateAll, evaluateQuality } from '@/lib/ai/codeValidator';
import type { GeneratedCode } from '@/types/project';
import type { ICodeRepository, IProjectRepository } from '@/repositories/interfaces';
import type { ApiCatalogItem } from '@/types/api';
import type { SseWriter } from '@/lib/ai/sseWriter';
import type { QcReport } from '@/types/qc';
import type { FeatureSpec } from '@/lib/ai/featureExtractor';

interface IProjectStatusUpdater {
  updateStatus(id: string, status: 'generated'): Promise<unknown>;
}

export interface SaveParams {
  projectId: string;
  userId: string;
  correlationId: string | undefined;
  parsed: { html: string; css: string; js: string };
  quality: ReturnType<typeof evaluateQuality>;
  qcReport: QcReport | null;
  qualityLoopUsed: boolean;
  validation: ReturnType<typeof validateAll>;
  apis: ApiCatalogItem[];
  projectContext?: string;
  extraMetadata?: Record<string, unknown>;
  featureSpec?: FeatureSpec | null;
  stage2Response: { provider: string; model: string; durationMs: number; tokensUsed: { input: number; output: number } };
  userPromptUsed: string;
  codeRepo: ICodeRepository;
  projectService: IProjectStatusUpdater;
  projectRepo?: IProjectRepository;
}

/**
 * 코드 저장 + slug 제안 + 버전 정리 + Deep QC 트리거 + 프로젝트 상태 갱신 + 이벤트 발행 + SSE complete.
 * SQLite 경로: codeRepo.create 후 projectService.updateStatus — 상태 갱신 실패 시 보상 롤백(best-effort)으로
 * 고아 generated_codes 레코드를 방지한다.
 */
export async function saveGeneratedCode(params: SaveParams, sse: SseWriter): Promise<void> {
  const {
    projectId, userId, correlationId, parsed, quality, qcReport, qualityLoopUsed,
    validation, apis, projectContext, extraMetadata, featureSpec, stage2Response, userPromptUsed,
    codeRepo, projectService, projectRepo,
  } = params;
  const limits = getLimits();

  const categories = [...new Set(apis.map((a) => a.category).filter(Boolean))];
  const inference = inferDesignFromCategories(categories);
  const nextVersion = await codeRepo.getNextVersion(projectId);

  sse.send('progress', { step: 'saving', progress: 95, message: '저장 중...' });
  generationTracker.updateProgress(projectId, 95, 'saving', '저장 중...');

  const codeInput = {
    projectId,
    version: nextVersion,
    codeHtml: parsed.html,
    codeCss: parsed.css,
    codeJs: parsed.js,
    framework: 'vanilla',
    aiProvider: stage2Response.provider,
    aiModel: stage2Response.model,
    aiPromptUsed: userPromptUsed,
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
      ...(featureSpec && { featureSpec }),
    },
  } as Parameters<typeof codeRepo.create>[0];

  // codeRepo.create 후 projectService.updateStatus — 상태 갱신 실패 시 보상 롤백(best-effort).
  const savedCode: GeneratedCode = await codeRepo.create(codeInput);
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

  // Slug 제안 — fire-and-forget
  if (projectRepo && projectContext) {
    void (async () => {
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
    })();
  }

  try {
    await codeRepo.pruneOldVersions(projectId, limits.maxCodeVersionsPerProject);
  } catch (pruneErr) {
    logger.warn('Failed to prune old code versions', { projectId, pruneErr });
  }

  // Deep QC — Fast QC 실패 시에만 실행 (비용 최적화)
  if (isQcEnabled() && qcReport && !qcReport.passed) {
    runDeepQcAndUpdate(projectId, savedCode.id, parsed, codeRepo);
  }

  const generatedEvent = {
    type: 'CODE_GENERATED' as const,
    payload: {
      projectId,
      version: savedCode.version,
      provider: stage2Response.provider,
      durationMs: stage2Response.durationMs,
    },
  };
  eventBus.emit(generatedEvent);

  generationTracker.complete(projectId, {
    projectId,
    version: savedCode.version,
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
  sse.send('complete', {
    projectId,
    version: savedCode.version,
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
}
