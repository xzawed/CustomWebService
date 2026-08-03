import { getAuthUser } from '@/lib/auth/index';
import { isFeatureEnabled } from '@/lib/config/featureFlags';
import { createProjectService, createCatalogService, createRateLimitService } from '@/services/factory';
import { createCodeRepository, createProjectRepository } from '@/repositories/factory';
import { registerEventPersister } from '@/lib/events/eventPersister';
import { registerErrorRateMonitor } from '@/lib/monitoring/errorRateMonitor';

registerEventPersister();
registerErrorRateMonitor();
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
import { assertEmailVerified } from '@/lib/auth/verifiedGuard';
import { getLimits } from '@/lib/config/features';
import { regenerateSchema } from '@/types/schemas';
import { createSseWriter } from '@/lib/ai/sseWriter';
import { runGenerationPipeline } from '@/lib/ai/generationPipeline';
import { generationTracker } from '@/lib/ai/generationTracker';
import { acquireGenerationLock } from '@/lib/ai/generationLock';

export async function POST(request: Request): Promise<Response> {
  let pendingDecrement: (() => Promise<void>) | undefined;

  try {
    const user = await getAuthUser();
    if (!user) throw new AuthRequiredError();
    await assertEmailVerified(user.id);

    // 킬스위치는 **쿼터 증가 이전**에 본다 — generate 라우트와 동일 규약.
    if (!isFeatureEnabled('enable_generation')) {
      return Response.json(
        {
          success: false,
          error: { code: 'GENERATION_DISABLED', message: '생성 기능이 일시 중단되었습니다.' },
        },
        { status: 503 },
      );
    }

    let projectId: string;
    let feedback: string;
    try {
      const body = await request.json();
      const parsed = regenerateSchema.parse(body);
      projectId = parsed.projectId;
      feedback = parsed.feedback;
    } catch (err) {
      if (err instanceof SyntaxError) return handleApiError(new ValidationError('잘못된 요청 형식입니다.'));
      throw err;
    }

    const correlationId = getCorrelationId(request);

    const rateLimitService = createRateLimitService();
    // charged=false(우회·fail-open)면 카운터가 오르지 않았으므로 환불 경로를 만들지 않는다.
    const { charged } = await rateLimitService.checkAndIncrementDailyLimit(user.id);
    if (charged) pendingDecrement = () => rateLimitService.decrementDailyLimit(user.id);
    const pipelineRateLimit = charged
      ? rateLimitService
      : { decrementDailyLimit: async (): Promise<void> => {} };

    const projectService = createProjectService();
    const [project, apiIds] = await Promise.all([
      projectService.getById(projectId, user.id),
      projectService.getProjectApiIds(projectId),
    ]);

    const catalogService = createCatalogService();
    const projectApis = apiIds.length > 0 ? await catalogService.getByIds(apiIds) : [];

    const codeRepo = createCodeRepository();
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

    // 중복 파이프라인 차단은 DB 락이 담당한다 — generate 라우트와 동일 규약.
    if (!(await acquireGenerationLock(projectId, user.id))) {
      await pendingDecrement?.().catch(() => {});
      pendingDecrement = undefined;
      return Response.json(
        { success: false, error: { code: 'GENERATION_IN_PROGRESS', message: '이미 생성 중입니다.' } },
        { status: 409 },
      );
    }
    // tracker는 진행률 표시 전용 — 락 책임은 위에서 끝났다.
    generationTracker.start(projectId, user.id);

    const stage1SystemPrompt = buildStage1SystemPrompt();
    const stage1UserPrompt = buildStage1RegenerationUserPrompt(
      { html: previousCode.codeHtml, css: previousCode.codeCss, js: previousCode.codeJs },
      feedback,
      projectApis,
      projectId,
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
            projectService,
            rateLimitService: pipelineRateLimit,
            projectRepo: createProjectRepository(),
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
    await pendingDecrement?.().catch(() => {});
    return handleApiError(error);
  }
}
