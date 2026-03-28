import { createClient } from '@/lib/supabase/server';
import { DeployService } from '@/services/deployService';
import { DeployProviderFactory } from '@/providers/deploy/DeployProviderFactory';
import type { DeployPlatform } from '@/providers/deploy/DeployProviderFactory';
import { eventBus } from '@/lib/events/eventBus';
import { AuthRequiredError, ValidationError, handleApiError } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';

export async function POST(request: Request): Promise<Response> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new AuthRequiredError();

    let projectId: string;
    let platform: DeployPlatform;
    try {
      const body = await request.json();
      if (typeof body.projectId !== 'string' || !body.projectId) {
        throw new ValidationError('projectId는 필수 항목입니다.');
      }
      projectId = body.projectId;
      const requestedPlatform = (body.platform as string) ?? 'railway';
      const supported = DeployProviderFactory.getSupportedPlatforms();
      if (!supported.includes(requestedPlatform as DeployPlatform)) {
        throw new ValidationError(
          `지원하지 않는 배포 플랫폼입니다: "${requestedPlatform}". 지원 플랫폼: ${supported.join(', ')}`
        );
      }
      platform = requestedPlatform as DeployPlatform;
    } catch (err) {
      if (err instanceof SyntaxError) {
        return handleApiError(new ValidationError('잘못된 요청 형식입니다.'));
      }
      throw err;
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
          const deployService = new DeployService(supabase);

          const result = await deployService.deploy(
            projectId,
            user.id,
            platform,
            (progress, message) => {
              send('progress', { progress, message });
            }
          );

          send('complete', {
            projectId,
            deployUrl: result.deployUrl,
            repoUrl: result.repoUrl,
            platform,
          });
        } catch (error) {
          logger.error('Deployment failed', {
            projectId,
            error: error instanceof Error ? error.message : 'Unknown',
          });

          eventBus.emit({
            type: 'DEPLOYMENT_FAILED',
            payload: {
              projectId,
              error: error instanceof Error ? error.message : 'Unknown error',
            },
          });

          send('error', {
            message: error instanceof Error ? error.message : '배포에 실패했습니다.',
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
