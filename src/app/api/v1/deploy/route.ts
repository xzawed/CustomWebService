import { getDbProvider } from '@/lib/config/providers';
import { createClient } from '@/lib/supabase/server';
import { getAuthUser } from '@/lib/auth/index';
import { createDeployService } from '@/services/factory';
import { createRateLimitRepository } from '@/repositories/factory';
import type { DeployPlatform } from '@/providers/deploy/DeployProviderFactory';
import { eventBus } from '@/lib/events/eventBus';
import { AuthRequiredError, RateLimitError, ValidationError, handleApiError } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';
import { getLimits } from '@/lib/config/features';
import { deploySchema } from '@/types/schemas';

export async function POST(request: Request): Promise<Response> {
  try {
    const user = await getAuthUser();
    if (!user) throw new AuthRequiredError();

    const limits = getLimits();
    const supabaseForLimit = await createClient();
    const rateLimitRepo = createRateLimitRepository(supabaseForLimit);
    const allowed = await rateLimitRepo.checkAndIncrementDailyDeployLimit(user.id, limits.maxDeployPerDay);
    if (!allowed) {
      throw new RateLimitError(`일일 배포 한도(${limits.maxDeployPerDay}회)를 초과했습니다.`);
    }

    let projectId: string;
    let platform: DeployPlatform;
    try {
      const body = await request.json();
      const parsed = deploySchema.parse(body);
      projectId = parsed.projectId;
      platform = parsed.platform as DeployPlatform;
    } catch (err) {
      if (err instanceof SyntaxError) {
        return handleApiError(new ValidationError('잘못된 요청 형식입니다.'));
      }
      throw err;
    }

    // SSE stream for deployment progress
    const encoder = new TextEncoder();
    let isCancelled = false;

    const supabase = getDbProvider() === 'supabase' ? await createClient() : undefined;

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
          const deployService = createDeployService(supabase);

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
