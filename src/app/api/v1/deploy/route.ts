import { createClient } from '@/lib/supabase/server';
import { ProjectService } from '@/services/projectService';
import { CodeRepository } from '@/repositories/codeRepository';
import { eventBus } from '@/lib/events/eventBus';
import {
  AuthRequiredError,
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

    let projectId: string;
    let platform: string;
    try {
      const body = await request.json();
      if (typeof body.projectId !== 'string' || !body.projectId) {
        throw new ValidationError('projectId는 필수 항목입니다.');
      }
      projectId = body.projectId;
      platform = body.platform ?? 'vercel';
    } catch (err) {
      if (err instanceof SyntaxError) {
        return handleApiError(new ValidationError('잘못된 요청 형식입니다.'));
      }
      throw err;
    }

    // Verify project ownership and code exists
    const projectService = new ProjectService(supabase);
    const project = await projectService.getById(projectId, user.id);

    const codeRepo = new CodeRepository(supabase);
    const code = await codeRepo.findByProject(projectId);
    if (!code) {
      throw new ValidationError('생성된 코드가 없습니다. 먼저 코드를 생성해주세요.');
    }

    // SSE stream for deployment progress
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
          eventBus.emit({
            type: 'DEPLOYMENT_STARTED',
            payload: { projectId, platform },
          });

          send('progress', {
            step: 'preparing',
            progress: 10,
            message: '배포 준비 중...',
          });

          // TODO: Implement actual deployment via IDeployProvider
          // For now, simulate deployment steps
          send('progress', {
            step: 'creating_repo',
            progress: 30,
            message: 'GitHub 저장소 생성 중...',
          });

          send('progress', {
            step: 'pushing_code',
            progress: 50,
            message: '코드 업로드 중...',
          });

          send('progress', {
            step: 'deploying',
            progress: 70,
            message: `${platform}에 배포 중...`,
          });

          // Update project status
          await projectService.updateStatus(projectId, 'deploying');

          send('progress', {
            step: 'finalizing',
            progress: 90,
            message: '배포 마무리 중...',
          });

          // Placeholder deploy URL - will be replaced when deploy providers are implemented
          const deployUrl = `https://svc-${projectId.slice(0, 8)}.vercel.app`;

          await supabase
            .from('projects')
            .update({
              status: 'deployed',
              deploy_url: deployUrl,
              deploy_platform: platform,
              updated_at: new Date().toISOString(),
            })
            .eq('id', projectId);

          eventBus.emit({
            type: 'DEPLOYMENT_COMPLETED',
            payload: { projectId, url: deployUrl, platform },
          });

          send('complete', { projectId, deployUrl, platform });
        } catch (error) {
          logger.error('Deployment failed', {
            projectId,
            error: error instanceof Error ? error.message : 'Unknown',
          });

          await projectService.updateStatus(projectId, 'failed');

          eventBus.emit({
            type: 'DEPLOYMENT_FAILED',
            payload: {
              projectId,
              error: error instanceof Error ? error.message : 'Unknown error',
            },
          });

          send('error', {
            message:
              error instanceof Error ? error.message : '배포에 실패했습니다.',
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
