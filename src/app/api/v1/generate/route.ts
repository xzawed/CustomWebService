import { getDbProvider } from '@/lib/config/providers';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getAuthUser } from '@/lib/auth/index';
import { createProjectService, createCatalogService, createRateLimitService } from '@/services/factory';
import { createCodeRepository } from '@/repositories/factory';
import { registerEventPersister } from '@/lib/events/eventPersister';

registerEventPersister();
import type { DesignPreferences } from '@/types/project';
import {
  buildStage1SystemPrompt,
  buildStage1UserPrompt,
  buildStage2SystemPrompt,
  buildStage2UserPrompt,
  buildStage2FunctionSystemPrompt,
  buildStage2FunctionUserPrompt,
} from '@/lib/ai/promptBuilder';
import { getCorrelationId } from '@/lib/utils/correlationId';
import { AuthRequiredError, ValidationError, handleApiError } from '@/lib/utils/errors';
import { generateSchema } from '@/types/schemas';
import { templateRegistry } from '@/templates/TemplateRegistry';
import { createSseWriter } from '@/lib/ai/sseWriter';
import { runGenerationPipeline } from '@/lib/ai/generationPipeline';
import { createProjectRepository } from '@/repositories/factory';
import { generationTracker } from '@/lib/ai/generationTracker';

export async function POST(request: Request): Promise<Response> {
  try {
    const user = await getAuthUser();
    if (!user) throw new AuthRequiredError();

    let projectId: string;
    let templateId: string | undefined;
    try {
      const body = await request.json();
      const parsed = generateSchema.parse(body);
      projectId = parsed.projectId;
      templateId = parsed.templateId;
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

    if (generationTracker.isGenerating(projectId)) {
      return Response.json(
        { success: false, error: { code: 'GENERATION_IN_PROGRESS', message: '이미 생성 중입니다.' } },
        { status: 409 },
      );
    }

    const designPreferences = (project.metadata as Record<string, unknown>)?.designPreferences as DesignPreferences | undefined;
    const stage1SystemPrompt = buildStage1SystemPrompt(templateHint);
    const stage1UserPrompt = buildStage1UserPrompt(apis, project.context, project.id, designPreferences);
    const stage2SystemPrompt = buildStage2SystemPrompt();

    const stream = new ReadableStream({
      async start(controller) {
        const { writer } = createSseWriter(controller);

        await runGenerationPipeline(
          {
            projectId,
            userId: user.id,
            correlationId,
            apis,
            projectContext: project.context,
            stage1SystemPrompt,
            stage1UserPrompt,
            stage2FunctionSystemPrompt: buildStage2FunctionSystemPrompt(),
            buildStage2FunctionUserPrompt: (stage1Code, staticIssues, qcIssues) =>
              buildStage2FunctionUserPrompt(stage1Code, staticIssues, qcIssues),
            stage2SystemPrompt,
            buildStage2UserPrompt,
          },
          writer,
          {
            codeRepo: createCodeRepository(supabase),
            projectService,
            rateLimitService,
            projectRepo: createProjectRepository(supabase),
          },
        );

        try { controller.close(); } catch { /* stream already cancelled */ }
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
