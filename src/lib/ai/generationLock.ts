import { createGenerationLockRepository } from '@/repositories/factory';
import {
  GENERATION_LOCK_HEARTBEAT_MS,
  GENERATION_LOCK_STALE_MS,
} from '@/lib/config/generation';
import { logger } from '@/lib/utils/logger';

/**
 * 프로젝트별 생성 락 — 같은 projectId로 파이프라인이 두 번 도는 것을 막는다.
 *
 * `generationTracker`가 락을 겸하던 구조에서는 TTL(생성 중 30분)이나 size cap으로 엔트리가
 * 사라지면 락도 함께 사라져 두 번째 파이프라인이 시작될 수 있었다 — Opus/ET 호출이 중복되어
 * 토큰이 이중 청구되고, 두 파이프라인이 같은 `getNextVersion()`을 받아 한쪽이 UNIQUE 위반으로
 * 실패한다. 락 책임만 DB로 분리하고 tracker는 진행률 표시 전용으로 남긴다.
 */

/** 획득 실패는 "이미 생성 중"을 뜻한다. 조회 실패는 던져서 fail-closed 한다. */
export async function acquireGenerationLock(projectId: string, userId: string): Promise<boolean> {
  return createGenerationLockRepository().acquire(projectId, userId, GENERATION_LOCK_STALE_MS);
}

/**
 * 락 해제. **던지지 않는다** — finally 경로에서 호출되므로 여기서 예외가 나면
 * 파이프라인의 원래 오류를 덮어버린다. 해제에 실패해도 stale 만료가 백스톱이다.
 */
export async function releaseGenerationLock(projectId: string): Promise<void> {
  try {
    await createGenerationLockRepository().release(projectId);
  } catch (error) {
    logger.warn('Failed to release generation lock', {
      projectId,
      error: error instanceof Error ? error.message : 'Unknown',
    });
  }
}

/**
 * 주기적 생존 신호를 시작하고 중지 함수를 반환한다.
 *
 * 파이프라인은 Stage 사이에 수십 초씩 AI 응답을 기다리므로 진행률 갱신 지점에 heartbeat를
 * 얹으면 간격이 들쭉날쭉해진다. 독립 타이머로 일정 주기를 보장한다.
 */
export function startLockHeartbeat(projectId: string): () => void {
  let timer: ReturnType<typeof setInterval> | null = null;

  const stop = (): void => {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };

  const tick = async (): Promise<void> => {
    try {
      const alive = await createGenerationLockRepository().heartbeat(projectId);
      if (!alive) {
        // 락이 이미 없다 — 다른 요청이 탈취했거나 해제된 상태다. 되살리면 안 된다.
        logger.warn('Generation lock disappeared while the pipeline was still running', {
          projectId,
        });
        stop();
      }
    } catch (error) {
      // 타이머 콜백의 거부는 아무도 관측하지 않아 unhandledRejection이 된다. 여기서 닫는다.
      logger.warn('Generation lock heartbeat failed', {
        projectId,
        error: error instanceof Error ? error.message : 'Unknown',
      });
    }
  };

  timer = setInterval(() => {
    void tick();
  }, GENERATION_LOCK_HEARTBEAT_MS);
  // 프로세스 종료를 막지 않는다 (backup/retention 스케줄러와 동일 원칙).
  (timer as { unref?: () => void }).unref?.();

  return stop;
}
