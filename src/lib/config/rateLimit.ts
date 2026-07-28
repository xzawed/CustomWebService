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

/**
 * 익명 게시 사이트 프록시 한도 — IP+projectId 단위. 기본 20회/분.
 *
 * 게시 사이트는 오너의 개인 API 키로 업스트림을 호출하므로, 이 리미터가 타인 키 소진을
 * 막는 유일한 경계다. 게시 사이트 실사용 데이터가 없어 보수적으로 시작하고 운영 로그를
 * 보고 환경변수로 조정한다(코드 변경 불필요).
 */
export const SITE_PROXY_RATE_LIMIT_PER_MIN = envInt('SITE_PROXY_RATE_LIMIT_PER_MIN', 20);

/** 프로젝트 전역 한도. 분산 IP로 한 오너의 키를 소진시키는 것을 상한. 기본 120회/분. */
export const SITE_PROXY_PROJECT_LIMIT_PER_MIN = envInt('SITE_PROXY_PROJECT_LIMIT_PER_MIN', 120);

/** site 리미터가 동시에 추적하는 최대 버킷 수. 초과 시 만료 항목만 정리한다. */
export const MAX_SITE_RATE_LIMIT_BUCKETS = envInt('MAX_SITE_RATE_LIMIT_BUCKETS', 5000);
