import { getDbProvider } from '@/lib/config/providers';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getAuthUser } from '@/lib/auth/index';
import { createProjectService, createCatalogService, createRateLimitService } from '@/services/factory';
import { createCodeRepository, createEventRepository } from '@/repositories/factory';
import type { DesignPreferences } from '@/types/project';
import { buildSystemPrompt, buildUserPrompt } from '@/lib/ai/promptBuilder';
import { getCorrelationId } from '@/lib/utils/correlationId';
import { AuthRequiredError, ValidationError, handleApiError } from '@/lib/utils/errors';
import { templateRegistry } from '@/templates/TemplateRegistry';
import { createSseWriter } from '@/lib/ai/sseWriter';
import { runGenerationPipeline } from '@/lib/ai/generationPipeline';

export async function POST(request: Request): Promise<Response> {
  try {
    const user = await getAuthUser();
    if (!user) throw new AuthRequiredError();

    let projectId: string;
    let templateId: string | undefined;
    try {
      const body = await request.json();
      if (typeof body.projectId !== 'string' || !body.projectId) {
        throw new ValidationError('projectId는 필수 항목입니다.');
      }
      projectId = body.projectId;
      templateId = typeof body.templateId === 'string' ? body.templateId : undefined;
    } catch (err) {
      if (err instanceof SyntaxError) return handleApiError(new ValidationError('잘못된 요청 형식입니다.'));
      throw err;
    }

    const correlationId = getCorrelationId(request);
    const provider = getDbProvider();
    const supabase = provider === 'supabase' ? await createClient() : undefined;
    const serviceSupabase = provider === 'supabase' ? await createServiceClient() : undefined;

    const rateLimitService = createRateLimitService(supabase);
    await rateLimitService.checkAndIncrementDailyLimit(user.id);

    const projectService = createProjectService(supabase);
    const [project, apiIds] = await Promise.all([
      projectService.getById(projectId, user.id),
      projectService.getProjectApiIds(projectId),
    ]);

    if (apiIds.length === 0) throw new ValidationError('프로젝트에 연결된 API가 없습니다.');

    const catalogService = createCatalogService(supabase);
    const apis = await catalogService.getByIds(apiIds);
    if (apis.length === 0) throw new ValidationError('선택된 API 정보를 찾을 수 없습니다.');

    let templateHint: string | undefined;
    if (templateId) {
      try {
        templateHint = templateRegistry.get(templateId)?.generate({
          apis,
          userContext: project.context,
          templateId,
        }).promptHint;
      } catch {
        templateHint = undefined;
      }
    }

    const systemPrompt = buildSystemPrompt(templateHint);
    const designPreferences = (project.metadata as Record<string, unknown>)?.designPreferences as DesignPreferences | undefined;
    const userPrompt = buildUserPrompt(apis, project.context, project.id, designPreferences);

    const stream = new ReadableStream({
      async start(controller) {
        const { writer } = createSseWriter(controller);

        await runGenerationPipeline(
          {
            projectId,
            userId: user.id,
            correlationId,
            apis,
            systemPrompt,
            userPrompt,
            streamingLabel: '코드 생성 중...',
          },
          writer,
          {
            codeRepo: createCodeRepository(supabase),
            eventRepo: createEventRepository(serviceSupabase),
            projectService,
            rateLimitService,
          },
        );

        controller.close();
      },
      cancel() {
        // isCancelled는 sseWriter가 enqueue 실패 시 내부에서 설정
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
