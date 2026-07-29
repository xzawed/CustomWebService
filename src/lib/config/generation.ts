/**
 * 코드 생성 락 설정.
 *
 * 락은 DB(`generation_locks`)에 있고 살아 있음은 주기적 heartbeat로 증명한다.
 * 프로세스가 죽으면 heartbeat가 멈추고 `GENERATION_LOCK_STALE_MS` 후 다른 요청이
 * 락을 탈취한다 — 크래시된 파이프라인이 프로젝트를 영구히 잠그지 않게 하는 장치다.
 */
import { logger } from '@/lib/utils/logger';

function envInt(key: string, defaultValue: number): number {
  const raw = process.env[key];
  if (!raw) return defaultValue;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
}

/** 생존 신호 주기(ms). 기본 30초. */
export const GENERATION_LOCK_HEARTBEAT_MS = envInt('GENERATION_LOCK_HEARTBEAT_MS', 30_000);

const rawStaleMs = envInt('GENERATION_LOCK_STALE_MS', 300_000);

/**
 * 이 시간 동안 heartbeat가 없으면 죽은 락으로 보고 탈취를 허용한다(ms). 기본 5분.
 *
 * heartbeat 주기보다 짧거나 같으면 **살아 있는 파이프라인이 다음 신호 전에 스스로
 * 만료되어** 중복 파이프라인이 다시 열린다. 잘못된 조합은 교정하고 경고를 남긴다 —
 * 조용히 폴백하면 운영자가 값을 바꿨는데 적용되지 않은 이유를 알 수 없다.
 */
export const GENERATION_LOCK_STALE_MS =
  rawStaleMs > GENERATION_LOCK_HEARTBEAT_MS ? rawStaleMs : GENERATION_LOCK_HEARTBEAT_MS * 2;

if (GENERATION_LOCK_STALE_MS !== rawStaleMs) {
  logger.warn('GENERATION_LOCK_STALE_MS must exceed the heartbeat interval — using a corrected value', {
    requestedStaleMs: rawStaleMs,
    heartbeatMs: GENERATION_LOCK_HEARTBEAT_MS,
    effectiveStaleMs: GENERATION_LOCK_STALE_MS,
  });
}
