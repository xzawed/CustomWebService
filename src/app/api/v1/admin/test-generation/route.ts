import { z } from 'zod';
import { adminCorsHeaders, verifyAdminKey, withAdminCors } from '@/lib/utils/adminAuth';
import { handleApiError, jsonResponse, ValidationError } from '@/lib/utils/errors';
import { createCatalogService, createProjectService } from '@/services/factory';
import {
  createCodeRepository,
  createProjectRepository,
} from '@/repositories/factory';
import {
  buildStage1SystemPrompt,
  buildStage1UserPrompt,
  buildStage2SystemPrompt,
  buildStage2UserPrompt,
  buildStage2FunctionSystemPrompt,
  buildStage2FunctionUserPrompt,
} from '@/lib/ai/promptBuilder';
import { runGenerationPipeline } from '@/lib/ai/generationPipeline';
import { acquireGenerationLock } from '@/lib/ai/generationLock';
import type { SseWriter } from '@/lib/ai/sseWriter';
import type { Project, ProjectMetadata } from '@/types/project';
import type { ApiCatalogItem } from '@/types/api';
import { getCorrelationId } from '@/lib/utils/correlationId';

const bodySchema = z.object({
  userId: z.string().uuid(),
  apiIds: z.array(z.string().uuid()).min(3).max(5),
  context: z.string().min(20).max(2000).optional(),
  projectName: z.string().min(1).max(100).optional(),
  cleanup: z.boolean().optional(),
});

const DEFAULT_CONTEXT =
  'API 카탈로그 통합 테스트용 자동 생성 서비스입니다. 연결된 API의 데이터를 사용자에게 보여주고 기본적인 인터랙션(필터·검색·새로고침 등)을 제공하는 단일 페이지를 생성해주세요.';

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: adminCorsHeaders });
}

export async function POST(request: Request): Promise<Response> {
  const res = await (async () => {
    let createdProjectId: string | null = null;
    try {
      verifyAdminKey(request);
      const body = await request.json();
      const { userId, apiIds, context: ctx, projectName, cleanup } = bodySchema.parse(body);
      const projectContext = ctx ?? DEFAULT_CONTEXT;
      const shouldCleanup = cleanup ?? true;

      const catalogService = createCatalogService();
      const projectRepo = createProjectRepository();

      const apis = await catalogService.getByIds(apiIds);
      if (apis.length !== apiIds.length) {
        throw new ValidationError(`유효하지 않은 API ID가 포함되어 있습니다 (요청 ${apiIds.length}, 조회 ${apis.length})`);
      }

      const startMs = Date.now();
      const project = await projectRepo.create({
        userId,
        organizationId: null,
        name: projectName ?? `[자동테스트] ${new Date().toISOString().slice(0, 19).replace('T', ' ')}`,
        context: projectContext,
        status: 'draft',
        deployUrl: null,
        deployPlatform: null,
        repoUrl: null,
        previewUrl: null,
        metadata: { test: true, source: 'admin/test-generation' } as ProjectMetadata,
        currentVersion: 0,
        apis: [] as ApiCatalogItem[],
        slug: null,
        publishedAt: null,
      } as Omit<Project, 'id' | 'createdAt' | 'updatedAt'>);
      createdProjectId = project.id;
      await projectRepo.insertProjectApis(project.id, apiIds);

      // 파이프라인이 finally에서 락을 해제하므로 여기서 획득해 짝을 맞춘다. 획득하지 않으면
      // heartbeat가 없는 락을 갱신하려다 매번 "lock disappeared" 경고를 남긴다.
      // 프로젝트를 방금 만들었으므로 획득은 항상 성공한다.
      await acquireGenerationLock(project.id, userId);

      const events: Array<{ event: string; data: unknown }> = [];
      const writer: SseWriter = {
        send: (event, data) => { events.push({ event, data }); },
        isCancelled: () => false,
      };

      const projectService = createProjectService();
      const noopRateLimit = { decrementDailyLimit: async (): Promise<void> => {} };

      await runGenerationPipeline(
        {
          projectId: project.id,
          userId,
          correlationId: getCorrelationId(request),
          apis,
          projectContext,
          stage1SystemPrompt: buildStage1SystemPrompt(),
          stage1UserPrompt: buildStage1UserPrompt(apis, projectContext, project.id),
          stage2FunctionSystemPrompt: buildStage2FunctionSystemPrompt(),
          buildStage2FunctionUserPrompt,
          stage2SystemPrompt: buildStage2SystemPrompt(),
          buildStage2UserPrompt,
          extraMetadata: { test: true },
        },
        writer,
        {
          codeRepo: createCodeRepository(),
          projectService,
          rateLimitService: noopRateLimit,
          projectRepo,
        },
      );

      const durationMs = Date.now() - startMs;
      const completeEvent = events.find((e) => e.event === 'complete');
      const errorEvent = events.find((e) => e.event === 'error');

      if (shouldCleanup) {
        await projectRepo.delete(project.id).catch(() => {});
      }

      if (errorEvent) {
        return jsonResponse({
          success: false,
          data: {
            projectId: project.id,
            cleanedUp: shouldCleanup,
            durationMs,
            apiIds,
            error: errorEvent.data,
            progressEvents: events.filter((e) => e.event === 'progress').map((e) => e.data),
          },
        });
      }

      return jsonResponse({
        success: true,
        data: {
          projectId: project.id,
          cleanedUp: shouldCleanup,
          durationMs,
          apiIds,
          complete: completeEvent?.data ?? null,
          progressEvents: events.filter((e) => e.event === 'progress').map((e) => e.data),
        },
      });
    } catch (error) {
      if (createdProjectId) {
        try {
          const projectRepo = createProjectRepository();
          await projectRepo.delete(createdProjectId);
        } catch {
          // best-effort cleanup
        }
      }
      return handleApiError(error);
    }
  })();
  return withAdminCors(res);
}
