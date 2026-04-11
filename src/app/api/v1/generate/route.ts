import { getDbProvider } from '@/lib/config/providers';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getAuthUser } from '@/lib/auth/index';
import { createProjectService, createCatalogService, createRateLimitService } from '@/services/factory';
import {
  createCodeRepository,
  createEventRepository,
} from '@/repositories/factory';
import { AiProviderFactory } from '@/providers/ai/AiProviderFactory';
import type { IAiProvider } from '@/providers/ai/IAiProvider';
import type { DesignPreferences } from '@/types/project';
import { buildSystemPrompt, buildUserPrompt } from '@/lib/ai/promptBuilder';
import { parseGeneratedCode } from '@/lib/ai/codeParser';
import { validateAll, evaluateQuality } from '@/lib/ai/codeValidator';
import { inferDesignFromCategories } from '@/lib/ai/categoryDesignMap';
import { shouldRetryGeneration, buildQualityImprovementPrompt } from '@/lib/ai/qualityLoop';
import { eventBus } from '@/lib/events/eventBus';
import { getLimits } from '@/lib/config/features';
import { getCorrelationId } from '@/lib/utils/correlationId';
import {
  AuthRequiredError,
  ValidationError,
  handleApiError,
} from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';

export async function POST(request: Request): Promise<Response> {
  try {
    const user = await getAuthUser();
    if (!user) throw new AuthRequiredError();

    // Validate request body
    let projectId: string;
    try {
      const body = await request.json();
      if (typeof body.projectId !== 'string' || !body.projectId) {
        throw new ValidationError('projectId는 필수 항목입니다.');
      }
      projectId = body.projectId;
    } catch (err) {
      if (err instanceof SyntaxError) {
        return handleApiError(new ValidationError('잘못된 요청 형식입니다.'));
      }
      throw err;
    }

    // Atomically check AND increment the daily counter before opening the SSE stream.
    // Uses a DB-level test-and-set (UPDATE WHERE count < limit) to eliminate the
    // race condition window that existed with the previous SELECT COUNT approach.
    // Call rateLimitService.decrementDailyLimit() in the failure path to compensate.
    const correlationId = getCorrelationId(request);
    const provider = getDbProvider();
    const supabase = provider === 'supabase' ? await createClient() : undefined;
    const serviceSupabase = provider === 'supabase' ? await createServiceClient() : undefined;
    const eventRepo = createEventRepository(serviceSupabase);

    const rateLimitService = createRateLimitService(supabase);
    await rateLimitService.checkAndIncrementDailyLimit(user.id);

    // 병렬 DB 조회: 프로젝트 정보 + API ID를 동시에 가져옴
    const projectService = createProjectService(supabase);
    const [project, apiIds] = await Promise.all([
      projectService.getById(projectId, user.id),
      projectService.getProjectApiIds(projectId),
    ]);

    if (apiIds.length === 0) {
      throw new ValidationError('프로젝트에 연결된 API가 없습니다.');
    }

    const catalogService = createCatalogService(supabase);
    const apis = await catalogService.getByIds(apiIds);
    if (apis.length === 0) {
      throw new ValidationError('선택된 API 정보를 찾을 수 없습니다.');
    }

    // Build prompt (시스템 프롬프트는 모듈 레벨 캐시 사용)
    const systemPrompt = buildSystemPrompt();
    const designPreferences = (project.metadata as Record<string, unknown>)?.designPreferences as DesignPreferences | undefined;
    const userPrompt = buildUserPrompt(apis, project.context, project.id, designPreferences);
    const limits = getLimits();

    // SSE stream with proper cancellation handling
    const encoder = new TextEncoder();
    let isCancelled = false;

    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: string, data: unknown) => {
          if (isCancelled) return;
          try {
            controller.enqueue(
              encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
            );
          } catch {
            isCancelled = true;
          }
        };

        // H6: Declare provider outside try so the catch block can read provider.name
        let provider: IAiProvider | undefined;

        try {
          send('progress', {
            step: 'analyzing',
            progress: 5,
            message: 'API 분석 중...',
          });

          try {
            provider = AiProviderFactory.createForTask('generation');
          } catch (factoryErr) {
            throw new Error(
              `AI 서비스 초기화 실패: ${factoryErr instanceof Error ? factoryErr.message : 'Unknown'}`
            );
          }

          send('progress', {
            step: 'generating_code',
            progress: 10,
            message: '코드 생성 시작...',
          });

          // AI 스트리밍 생성 — 실시간 진행률 전송 (타임아웃 없음: 스트리밍 중
          // 사용자가 진행 상황을 확인 가능하며, 브라우저 종료 시 SSE cancel()로 자동 정리)
          let lastProgressUpdate = Date.now();
          const streamStartTime = Date.now();

          const response = await provider.generateCodeStream(
            { system: systemPrompt, user: userPrompt },
            (_chunk: string, accumulated: string) => {
              if (isCancelled) return;

              // 500ms마다 진행률 업데이트 (너무 자주 보내지 않음)
              const now = Date.now();
              if (now - lastProgressUpdate < 500) return;
              lastProgressUpdate = now;

              // 실시간 진행률: 누적 길이 기반 추정 (10% ~ 80%)
              const estimatedProgress = Math.min(
                80,
                10 + Math.floor((accumulated.length / 15000) * 70)
              );
              const elapsed = Math.floor((now - streamStartTime) / 1000);

              send('progress', {
                step: 'generating_code',
                progress: estimatedProgress,
                message: `코드 생성 중... (${elapsed}초 경과, ${(accumulated.length / 1024).toFixed(1)}KB)`,
              });
            },
          );

          if (isCancelled) return;

          send('progress', {
            step: 'styling',
            progress: 85,
            message: '디자인 적용 중...',
          });

          let parsed = parseGeneratedCode(response.content);

          send('progress', {
            step: 'validating',
            progress: 90,
            message: '코드 검증 중...',
          });

          const validation = validateAll(parsed.html, parsed.css, parsed.js);

          if (validation.errors.length > 0) {
            logger.warn('Generated code failed security validation', {
              projectId,
              errors: validation.errors,
            });
            throw new Error(`생성된 코드에 보안 문제가 감지되었습니다: ${validation.errors.join(', ')}`);
          }

          let quality = evaluateQuality(parsed.html, parsed.css, parsed.js);

          // 품질 자동 재생성 (1회 제한)
          let qualityLoopUsed = false;
          if (shouldRetryGeneration(quality)) {
            logger.info('Quality below threshold, attempting improvement', {
              projectId,
              score: quality.structuralScore,
            });

            send('progress', {
              step: 'quality_improvement',
              progress: 92,
              message: '품질 개선 중...',
            });

            try {
              const improvementPrompt = buildQualityImprovementPrompt(parsed, quality);
              const retryResponse = await provider!.generateCode({ system: systemPrompt, user: improvementPrompt });
              const retryParsed = parseGeneratedCode(retryResponse.content);

              if (retryParsed.html) {
                const retryQuality = evaluateQuality(retryParsed.html, retryParsed.css, retryParsed.js);
                if (retryQuality.structuralScore > quality.structuralScore) {
                  parsed = retryParsed;
                  quality = retryQuality;
                  qualityLoopUsed = true;
                }
              }
            } catch (retryErr) {
              logger.warn('Quality improvement retry failed', { projectId, retryErr });
            }
          }

          const categories = [...new Set(apis.map((a) => a.category).filter(Boolean))];
          const inference = inferDesignFromCategories(categories);

          const codeRepo = createCodeRepository(supabase);
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
              ...quality,
              apiCategories: categories,
              inferredTheme: inference.theme,
              inferredLayout: inference.layout,
              qualityLoopUsed,
            },
          } as Parameters<typeof codeRepo.create>[0]);

          // 버전 정리를 비동기로 실행 — SSE 응답을 블로킹하지 않음
          codeRepo.pruneOldVersions(projectId, limits.maxCodeVersionsPerProject).catch((pruneErr) => {
            logger.warn('Failed to prune old code versions', { projectId, pruneErr });
          });

          // C2: Compensating rollback — if status update fails after code is saved,
          // delete the orphaned code record to keep the DB consistent.
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
          eventRepo.persistAsync(generatedEvent, { userId: user.id, projectId, correlationId });

          send('complete', {
            projectId,
            version: nextVersion,
            previewUrl: `/api/v1/preview/${projectId}`,
          });
        } catch (error) {
          logger.error('Code generation failed', {
            projectId,
            error: error instanceof Error ? error.message : 'Unknown',
          });

          // Compensate: restore the rate limit slot that was pre-incremented.
          // Best-effort — errors from decrement are logged but not re-thrown.
          await rateLimitService.decrementDailyLimit(user.id);

          const failedEvent = {
            type: 'CODE_GENERATION_FAILED' as const,
            payload: {
              projectId,
              error: error instanceof Error ? error.message : 'Unknown error',
              provider: provider?.name ?? 'unknown',
            },
          };
          eventBus.emit(failedEvent);
          eventRepo.persistAsync(failedEvent, { userId: user.id, projectId, correlationId });

          send('error', {
            message: error instanceof Error ? error.message : '코드 생성에 실패했습니다.',
          });
        } finally {
          controller.close();
        }
      },
      cancel() {
        isCancelled = true;
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
