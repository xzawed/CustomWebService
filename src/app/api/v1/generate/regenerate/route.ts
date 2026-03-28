import { createClient } from '@/lib/supabase/server';
import { ProjectService } from '@/services/projectService';
import { AuthService } from '@/services/authService';
import { RateLimitService } from '@/services/rateLimitService';
import { CodeRepository } from '@/repositories/codeRepository';
import { CatalogService } from '@/services/catalogService';
import { AiProviderFactory } from '@/providers/ai/AiProviderFactory';
import type { IAiProvider } from '@/providers/ai/IAiProvider';
import { buildSystemPrompt, buildRegenerationPrompt } from '@/lib/ai/promptBuilder';
import { parseGeneratedCode } from '@/lib/ai/codeParser';
import { validateAll } from '@/lib/ai/codeValidator';
import { eventBus } from '@/lib/events/eventBus';
import { getLimits } from '@/lib/config/features';
import {
  AuthRequiredError,
  NotFoundError,
  RateLimitError,
  ValidationError,
  handleApiError,
} from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';

export async function POST(request: Request): Promise<Response> {
  try {
    const supabase = await createClient();
    const authService = new AuthService(supabase);
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

    // H2: Centralized rate limit check — regenerations count toward daily limit
    const rateLimitService = new RateLimitService(supabase);
    await rateLimitService.checkDailyGenerationLimit(user.id);

    // Get project and verify ownership
    const projectService = new ProjectService(supabase);
    const project = await projectService.getById(projectId, user.id);

    // Fetch project's APIs for context injection
    const apiIds = await projectService.getProjectApiIds(projectId);
    const catalogService = new CatalogService(supabase);
    const projectApis = apiIds.length > 0 ? await catalogService.getByIds(apiIds) : [];

    // Check regeneration limit per project
    const codeRepo = new CodeRepository(supabase);
    const limits = getLimits();
    const currentVersion = await codeRepo.getNextVersion(projectId);
    if (currentVersion - 1 >= limits.maxRegenerationsPerProject) {
      throw new RateLimitError(
        `프로젝트당 최대 재생성 횟수(${limits.maxRegenerationsPerProject}회)를 초과했습니다.`
      );
    }

    // Get latest generated code to base regeneration on
    const previousCode = await codeRepo.findByProject(projectId);
    if (!previousCode) {
      throw new NotFoundError('재생성할 기존 코드가 없습니다. 먼저 코드를 생성해주세요.');
    }

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
          send('progress', { step: 'analyzing', progress: 10, message: '피드백 분석 중...' });

          // C1: Second rate limit check right before the DB write to reduce race window
          await rateLimitService.checkDailyGenerationLimit(user.id);

          send('progress', { step: 'generating_code', progress: 30, message: '코드 수정 중...' });

          try {
            provider = AiProviderFactory.create();
          } catch (factoryErr) {
            throw new Error(
              `AI 서비스 초기화 실패: ${factoryErr instanceof Error ? factoryErr.message : 'Unknown'}`
            );
          }

          // H3: Enforce generation timeout — prevents SSE streams from hanging indefinitely
          const response = await Promise.race([
            provider.generateCode({ system: systemPrompt, user: userPrompt }),
            new Promise<never>((_, reject) =>
              setTimeout(
                () =>
                  reject(
                    new Error(
                      `코드 생성 제한시간(${limits.generationTimeoutMs / 1000}초)을 초과했습니다.`
                    )
                  ),
                limits.generationTimeoutMs
              )
            ),
          ]);

          if (isCancelled) return;

          send('progress', { step: 'styling', progress: 70, message: '디자인 적용 중...' });

          const parsed = parseGeneratedCode(response.content);

          send('progress', { step: 'validating', progress: 90, message: '코드 검증 중...' });

          const validation = validateAll(parsed.html, parsed.css, parsed.js);

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
            },
          } as Parameters<typeof codeRepo.create>[0]);

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

          eventBus.emit({
            type: 'CODE_GENERATED',
            payload: {
              projectId,
              version: nextVersion,
              provider: response.provider,
              durationMs: response.durationMs,
            },
          });

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

          // H6: Use IAiProvider.name instead of hardcoded 'grok'
          eventBus.emit({
            type: 'CODE_GENERATION_FAILED',
            payload: {
              projectId,
              error: error instanceof Error ? error.message : 'Unknown error',
              provider: provider?.name ?? 'unknown',
            },
          });

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
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
