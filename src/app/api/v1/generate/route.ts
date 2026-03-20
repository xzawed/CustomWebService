import { createClient } from '@/lib/supabase/server';
import { ProjectService } from '@/services/projectService';
import { CatalogService } from '@/services/catalogService';
import { CodeRepository } from '@/repositories/codeRepository';
import { ProjectRepository } from '@/repositories/projectRepository';
import { AiProviderFactory } from '@/providers/ai/AiProviderFactory';
import { buildSystemPrompt, buildUserPrompt } from '@/lib/ai/promptBuilder';
import { parseGeneratedCode } from '@/lib/ai/codeParser';
import { validateAll } from '@/lib/ai/codeValidator';
import { eventBus } from '@/lib/events/eventBus';
import { getLimits } from '@/lib/config/features';
import {
  AuthRequiredError,
  RateLimitError,
  ValidationError,
  handleApiError,
} from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';

export async function POST(request: Request): Promise<Response> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
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

    // Check daily limit
    const projectRepo = new ProjectRepository(supabase);
    const todayCount = await projectRepo.countTodayGenerations(user.id);
    const limits = getLimits();
    if (todayCount >= limits.maxDailyGenerations) {
      throw new RateLimitError(
        `일일 생성 한도(${limits.maxDailyGenerations}회)를 초과했습니다.`
      );
    }

    // Get project and APIs
    const projectService = new ProjectService(supabase);
    const project = await projectService.getById(projectId, user.id);

    const apiIds = await projectService.getProjectApiIds(projectId);
    const catalogService = new CatalogService(supabase);
    const apis = await catalogService.getByIds(apiIds);

    // Build prompt
    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildUserPrompt(apis, project.context);

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

        try {
          send('progress', {
            step: 'analyzing',
            progress: 10,
            message: 'API 분석 중...',
          });

          send('progress', {
            step: 'generating_code',
            progress: 30,
            message: '코드 생성 중...',
          });

          const provider = AiProviderFactory.create();
          const response = await provider.generateCode({
            system: systemPrompt,
            user: userPrompt,
          });

          if (isCancelled) return;

          send('progress', {
            step: 'styling',
            progress: 70,
            message: '디자인 적용 중...',
          });

          const parsed = parseGeneratedCode(response.content);

          send('progress', {
            step: 'validating',
            progress: 90,
            message: '코드 검증 중...',
          });

          const validation = validateAll(parsed.html, parsed.css, parsed.js);

          // Save to DB
          const codeRepo = new CodeRepository(supabase);
          const nextVersion = await codeRepo.getNextVersion(projectId);

          await codeRepo.create({
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
            },
          } as Parameters<typeof codeRepo.create>[0]);

          await projectService.updateStatus(projectId, 'generated');

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
          logger.error('Code generation failed', {
            projectId,
            error: error instanceof Error ? error.message : 'Unknown',
          });

          eventBus.emit({
            type: 'CODE_GENERATION_FAILED',
            payload: {
              projectId,
              error: error instanceof Error ? error.message : 'Unknown error',
              provider: 'gemini',
            },
          });

          send('error', {
            message:
              error instanceof Error
                ? error.message
                : '코드 생성에 실패했습니다.',
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
