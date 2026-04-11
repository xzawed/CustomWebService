import { createClient, createServiceClient } from '@/lib/supabase/server';
import { ProjectService } from '@/services/projectService';
import { AuthService } from '@/services/authService';
import { RateLimitService } from '@/services/rateLimitService';
import { CatalogService } from '@/services/catalogService';
import {
  createProjectRepository,
  createCatalogRepository,
  createCodeRepository,
  createRateLimitRepository,
  createUserRepository,
  createEventRepository,
} from '@/repositories/factory';
import { AiProviderFactory } from '@/providers/ai/AiProviderFactory';
import type { IAiProvider } from '@/providers/ai/IAiProvider';
import { buildSystemPrompt, buildRegenerationPrompt } from '@/lib/ai/promptBuilder';
import { parseGeneratedCode } from '@/lib/ai/codeParser';
import { validateAll, evaluateQuality } from '@/lib/ai/codeValidator';
import { inferDesignFromCategories } from '@/lib/ai/categoryDesignMap';
import { eventBus } from '@/lib/events/eventBus';
import { getLimits } from '@/lib/config/features';
import { getCorrelationId } from '@/lib/utils/correlationId';
import {
  AuthRequiredError,
  NotFoundError,
  RateLimitError,
  ValidationError,
  handleApiError,
} from '@/lib/utils/errors';
// RateLimitError is still used for the per-project regeneration limit check below
import { logger } from '@/lib/utils/logger';

export async function POST(request: Request): Promise<Response> {
  try {
    const supabase = await createClient();
    const authService = new AuthService(supabase, createUserRepository(supabase));
    const user = await authService.getCurrentUser();
    if (!user) throw new AuthRequiredError();

    let projectId: string;
    let feedback: string;
    try {
      const body = await request.json();
      if (typeof body.projectId !== 'string' || !body.projectId) {
        throw new ValidationError('projectId는 필수 항목입니다.');
      }
      if (typeof body.feedback !== 'string' || body.feedback.trim().length === 0) {
        throw new ValidationError('feedback은 필수 항목입니다.');
      }
      projectId = body.projectId;
      feedback = body.feedback.trim();
    } catch (err) {
      if (err instanceof SyntaxError) {
        return handleApiError(new ValidationError('잘못된 요청 형식입니다.'));
      }
      throw err;
    }

    const correlationId = getCorrelationId(request);
    const serviceSupabase = await createServiceClient();
    const eventRepo = createEventRepository(serviceSupabase);

    // Atomic check + increment — same approach as the initial generate route.
    const rateLimitService = new RateLimitService(createRateLimitRepository(supabase));
    await rateLimitService.checkAndIncrementDailyLimit(user.id);

    // 병렬 DB 조회: 프로젝트 정보 + API ID를 동시에 가져옴
    const projectService = new ProjectService(createProjectRepository(supabase), createCatalogRepository(supabase));
    const [project, apiIds] = await Promise.all([
      projectService.getById(projectId, user.id),
      projectService.getProjectApiIds(projectId),
    ]);

    const catalogService = new CatalogService(createCatalogRepository(supabase));
    const projectApis = apiIds.length > 0 ? await catalogService.getByIds(apiIds) : [];

    // Check regeneration limit per project + get previous code (병렬)
    const codeRepo = createCodeRepository(supabase);
    const limits = getLimits();
    const [currentVersion, previousCode] = await Promise.all([
      codeRepo.getNextVersion(projectId),
      codeRepo.findByProject(projectId),
    ]);

    if (currentVersion - 1 >= limits.maxRegenerationsPerProject) {
      throw new RateLimitError(
        `프로젝트당 최대 재생성 횟수(${limits.maxRegenerationsPerProject}회)를 초과했습니다.`
      );
    }

    if (!previousCode) {
      throw new NotFoundError('재생성할 기존 코드가 없습니다. 먼저 코드를 생성해주세요.');
    }

    // 시스템 프롬프트 캐시 사용
    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildRegenerationPrompt(
      { html: previousCode.codeHtml, css: previousCode.codeCss, js: previousCode.codeJs },
      feedback,
      projectApis
    );

    // SSE stream
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
            message: '피드백 분석 중...',
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
            message: '코드 수정 시작...',
          });

          // AI 스트리밍 생성 — 실시간 진행률 전송 (타임아웃 없음: 스트리밍 중
          // 사용자가 진행 상황을 확인 가능하며, 브라우저 종료 시 SSE cancel()로 자동 정리)
          let lastProgressUpdate = Date.now();
          const streamStartTime = Date.now();

          const response = await provider.generateCodeStream(
            { system: systemPrompt, user: userPrompt },
            (_chunk: string, accumulated: string) => {
              if (isCancelled) return;

              const now = Date.now();
              if (now - lastProgressUpdate < 500) return;
              lastProgressUpdate = now;

              const estimatedProgress = Math.min(
                80,
                10 + Math.floor((accumulated.length / 15000) * 70)
              );
              const elapsed = Math.floor((now - streamStartTime) / 1000);

              send('progress', {
                step: 'generating_code',
                progress: estimatedProgress,
                message: `코드 수정 중... (${elapsed}초 경과, ${(accumulated.length / 1024).toFixed(1)}KB)`,
              });
            },
          );

          if (isCancelled) return;

          send('progress', { step: 'styling', progress: 85, message: '디자인 적용 중...' });

          const parsed = parseGeneratedCode(response.content);

          send('progress', { step: 'validating', progress: 90, message: '코드 검증 중...' });

          const validation = validateAll(parsed.html, parsed.css, parsed.js);

          if (validation.errors.length > 0) {
            logger.warn('Regenerated code failed security validation', {
              projectId,
              errors: validation.errors,
            });
            throw new Error(`생성된 코드에 보안 문제가 감지되었습니다: ${validation.errors.join(', ')}`);
          }

          const categories = [...new Set(projectApis.map((a) => a.category).filter(Boolean))];
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
              userFeedback: feedback,
              ...evaluateQuality(parsed.html, parsed.css, parsed.js),
              apiCategories: categories,
              inferredTheme: inference.theme,
              inferredLayout: inference.layout,
            },
          } as Parameters<typeof codeRepo.create>[0]);

          // 버전 정리를 비동기로 실행 — SSE 응답을 블로킹하지 않음
          codeRepo.pruneOldVersions(projectId, limits.maxCodeVersionsPerProject).catch((pruneErr) => {
            logger.warn('Failed to prune old code versions', { projectId, pruneErr });
          });

          // C2: Compensating rollback — delete orphaned code if status update fails
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
          logger.error('Code regeneration failed', {
            projectId,
            error: error instanceof Error ? error.message : 'Unknown',
          });

          // Compensate: restore the pre-incremented rate limit slot.
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
            message: error instanceof Error ? error.message : '코드 재생성에 실패했습니다.',
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
