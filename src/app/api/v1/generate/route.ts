import { getAuthUser } from '@/lib/auth/index';
import { isFeatureEnabled } from '@/lib/config/featureFlags';
import { GENERATION_DISABLED_MESSAGE } from '@/lib/constants/shutdown';
import { createProjectService, createCatalogService, createRateLimitService } from '@/services/factory';
import { createCodeRepository, createProjectRepository } from '@/repositories/factory';
import { registerEventPersister } from '@/lib/events/eventPersister';
import { registerErrorRateMonitor } from '@/lib/monitoring/errorRateMonitor';

registerEventPersister();
registerErrorRateMonitor();
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
import { assertEmailVerified } from '@/lib/auth/verifiedGuard';
import { generateSchema } from '@/types/schemas';
import { templateRegistry } from '@/templates/TemplateRegistry';
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

    // 킬스위치는 **쿼터 증가 이전**에 본다 — 꺼져 있는데 일일 한도만 깎이면
    // 스위치를 올린 뒤에도 사용자가 못 쓴다.
    if (!isFeatureEnabled('enable_generation')) {
      return Response.json(
        {
          success: false,
          error: { code: 'GENERATION_DISABLED', message: GENERATION_DISABLED_MESSAGE },
        },
        { status: 503 },
      );
    }

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

    const rateLimitService = createRateLimitService();
    const projectService = createProjectService();
    // charged=false(우회·fail-open)면 카운터가 오르지 않았으므로 환불 경로를 만들지 않는다.
    // 조건 없이 환불하면 DB 오류가 날 때마다 사용자 한도가 늘어난다.
    const { charged } = await rateLimitService.checkAndIncrementDailyLimit(user.id);
    if (charged) pendingDecrement = () => rateLimitService.decrementDailyLimit(user.id);
    const pipelineRateLimit = charged
      ? rateLimitService
      : { decrementDailyLimit: async (): Promise<void> => {} };
    const [project, apiIds] = await Promise.all([
      projectService.getById(projectId, user.id),
      projectService.getProjectApiIds(projectId),
    ]);

    if (apiIds.length === 0) throw new ValidationError('프로젝트에 연결된 API가 없습니다.');

    const catalogService = createCatalogService();
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

    // 중복 파이프라인 차단은 DB 락이 담당한다(단일 문 test-and-set이라 체크·획득 사이에
    // 끼어들 틈이 없다). 인메모리 tracker가 락을 겸하던 구조에서는 TTL·size cap으로 엔트리가
    // 사라지면 락도 사라져 두 번째 파이프라인이 시작될 수 있었다 — Opus/ET 이중 청구.
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
            codeRepo: createCodeRepository(),
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
