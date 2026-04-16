import { getDbProvider } from '@/lib/config/providers';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getAuthUser } from '@/lib/auth/index';
import { createProjectService, createCatalogService, createRateLimitService } from '@/services/factory';
import { createCodeRepository, createEventRepository } from '@/repositories/factory';
import {
  buildStage1SystemPrompt,
  buildStage1RegenerationUserPrompt,
  buildStage2SystemPrompt,
  buildStage2RegenerationUserPrompt,
  buildStage2FunctionSystemPrompt,
  buildStage2FunctionRegenerationUserPrompt,
} from '@/lib/ai/promptBuilder';
import { getCorrelationId } from '@/lib/utils/correlationId';
import {
  AuthRequiredError,
  NotFoundError,
  RateLimitError,
  ValidationError,
  handleApiError,
} from '@/lib/utils/errors';
import { getLimits } from '@/lib/config/features';
import { createSseWriter } from '@/lib/ai/sseWriter';
import { runGenerationPipeline } from '@/lib/ai/generationPipeline';
import { createProjectRepository } from '@/repositories/factory';
import { generationTracker } from '@/lib/ai/generationTracker';

export async function POST(request: Request): Promise<Response> {
  try {
    const user = await getAuthUser();
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
      if (body.feedback.length > 5000) {
        throw new ValidationError('feedback은 5,000자를 초과할 수 없습니다.');
      }
      projectId = body.projectId;
      feedback = body.feedback.trim();
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

    const catalogService = createCatalogService(supabase);
    const projectApis = apiIds.length > 0 ? await catalogService.getByIds(apiIds) : [];

    const codeRepo = createCodeRepository(supabase);
    const limits = getLimits();
    const [currentVersion, previousCode] = await Promise.all([
      codeRepo.getNextVersion(projectId),
      codeRepo.findByProject(projectId),
    ]);

    if (currentVersion - 1 >= limits.maxRegenerationsPerProject) {
      throw new RateLimitError(
        `프로젝트당 최대 재생성 횟수(${limits.maxRegenerationsPerProject}회)를 초과했습니다.`,
      );
    }

    if (!previousCode) {
      throw new NotFoundError('재생성할 기존 코드가 없습니다. 먼저 코드를 생성해주세요.');
    }

    if (generationTracker.isGenerating(projectId)) {
      return Response.json(
        { success: false, error: { code: 'GENERATION_IN_PROGRESS', message: '이미 생성 중입니다.' } },
        { status: 409 },
      );
    }

    const stage1SystemPrompt = buildStage1SystemPrompt();
    const stage1UserPrompt = buildStage1RegenerationUserPrompt(
      { html: previousCode.codeHtml, css: previousCode.codeCss, js: previousCode.codeJs },
      feedback,
      projectApis,
    );
    const stage2SystemPrompt = buildStage2SystemPrompt();

    const stream = new ReadableStream({
      async start(controller) {
        const { writer } = createSseWriter(controller);

        await runGenerationPipeline(
          {
            projectId,
            userId: user.id,
            correlationId,
            apis: projectApis,
            projectContext: project.context,
            stage1SystemPrompt,
            stage1UserPrompt,
            stage2FunctionSystemPrompt: buildStage2FunctionSystemPrompt(),
            buildStage2FunctionUserPrompt: (stage1Code, staticIssues, qcIssues) =>
              buildStage2FunctionRegenerationUserPrompt(stage1Code, staticIssues, qcIssues, feedback),
            stage2SystemPrompt,
            buildStage2UserPrompt: (stage1Code) => buildStage2RegenerationUserPrompt(stage1Code, feedback),
            extraMetadata: { userFeedback: feedback },
          },
          writer,
          {
            codeRepo,
            eventRepo: createEventRepository(serviceSupabase),
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
