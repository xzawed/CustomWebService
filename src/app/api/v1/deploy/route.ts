import { getAuthUser } from '@/lib/auth/index';
import { createDeployService } from '@/services/factory';
import { createRateLimitRepository } from '@/repositories/factory';
import type { DeployPlatform } from '@/providers/deploy/DeployProviderFactory';
import { eventBus } from '@/lib/events/eventBus';
import { AppError, AuthRequiredError, RateLimitError, ValidationError, handleApiError } from '@/lib/utils/errors';
import { assertEmailVerified } from '@/lib/auth/verifiedGuard';
import { logger } from '@/lib/utils/logger';
import { getLimits } from '@/lib/config/features';
import { deploySchema } from '@/types/schemas';

export async function POST(request: Request): Promise<Response> {
  try {
    const user = await getAuthUser();
    if (!user) throw new AuthRequiredError();
    await assertEmailVerified(user.id);

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

    const limits = getLimits();
    const rateLimitRepo = createRateLimitRepository();
    const allowed = await rateLimitRepo.checkAndIncrementDailyDeployLimit(user.id, limits.maxDeployPerDay);
    if (!allowed) {
      throw new RateLimitError(`일일 배포 한도(${limits.maxDeployPerDay}회)를 초과했습니다.`);
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
          const deployService = createDeployService();

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

          // 배포가 실패했으므로 이미 증가시킨 일일 배포 카운터를 환불한다(best-effort).
          // 환불 실패가 사용자 요청을 막아서는 안 되므로 삼키되, **반드시 흔적을 남긴다** —
          // generate 경로의 `RateLimitService.decrementDailyLimit`도 동일하게 warn을 남긴다.
          // (2026-07-31 이전에는 `.catch(() => {})`로 에러를 통째로 버려, 환불이 실패해도
          //  사용자가 하루치 배포 슬롯을 잃은 사실이 아무 데도 기록되지 않았다.)
          await rateLimitRepo.decrementDailyDeployLimit(user.id).catch((err: unknown) => {
            logger.warn('Failed to decrement daily deploy count (compensation)', {
              userId: user.id,
              projectId,
              error: err instanceof Error ? err.message : String(err),
            });
          });

          eventBus.emit({
            type: 'DEPLOYMENT_FAILED',
            payload: {
              projectId,
              error: error instanceof Error ? error.message : 'Unknown error',
            },
          });

          // 사용자에게는 안전한 메시지만 노출한다. AppError(검증/권한 등 사용자 대상 에러)는
          // 메시지를 그대로 쓰고, 그 외(배포 프로바이더의 내부 에러: projectId·repo 경로 등 포함)는
          // 일반 문구로 마스킹하여 내부 구현 정보 노출을 차단한다. 내부 상세는 위 logger에만 기록됨.
          send('error', {
            message: error instanceof AppError ? error.message : '배포 중 오류가 발생했습니다.',
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
