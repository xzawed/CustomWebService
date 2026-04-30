/**
 * 공용 인메모리 rate limit 설정.
 *
 * proxy 라우트(`/api/v1/proxy`)와 admin 라우트(`/api/v1/admin/*`)가 동일한
 * 분당 한도 + 동시 사용자 한도를 사용하도록 단일 출처에 모은다. 운영 중
 * 한도 조정이 필요하면 환경변수만 변경하면 된다.
 *
 * Railway 단일 인스턴스 전제. 멀티 인스턴스 전환 시 Redis 등 외부
 * 저장소로 교체 필요.
 */

function envInt(key: string, defaultValue: number): number {
  const raw = process.env[key];
  if (!raw) return defaultValue;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
}

/** 분당 요청 한도 — proxy/admin 공통. 기본 60회/분. */
export const RATE_LIMIT_PER_MIN = envInt('RATE_LIMIT_PER_MIN', 60);

/** rate limit 윈도우(밀리초). 기본 60초. */
export const RATE_LIMIT_WINDOW_MS = 60_000;

/** 동시 활성 사용자 한도 (LRU evict 임계값). 기본 1000명. */
export const MAX_CONCURRENT_RATE_LIMIT_USERS = envInt('MAX_CONCURRENT_RATE_LIMIT_USERS', 1000);
