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

/**
 * 동시 활성 사용자(버킷) 한도. 기본 1000명.
 *
 * ⚠️ LRU evict 임계값이 **아니다**. 가득 차면 만료분만 정리하고, 그래도 자리가 없으면
 * **신규 키를 거부(과차단)** 한다 — 활성 윈도를 버리면 다음 요청이 `count:1`로 시작해
 * 한도가 우회되기 때문. 소비처: `api/v1/proxy/route.ts:41,46` · `utils/adminAuth.ts:69,73`.
 */
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

/**
 * 로그인 실패 per-IP 한도. 기본 10회/15분.
 * signup(5/h)보다 느슨하다 — 오타·모바일 IP 변동을 허용하고, 이메일 발송 비용이 없다.
 */
export const LOGIN_IP_FAIL_LIMIT = envInt('LOGIN_IP_FAIL_LIMIT', 10);

/** 로그인 실패 per-IP 윈도우(ms). 기본 15분. */
export const LOGIN_IP_WINDOW_MS = envInt('LOGIN_IP_WINDOW_MS', 15 * 60_000);

/**
 * 로그인 실패 per-account(제출 이메일) 한도. 기본 5회/5분.
 * 짧은 윈도만 쓴다 — 장기 잠금이 되면 공격자가 계정을 가둘 수 있다.
 */
export const LOGIN_ACCOUNT_FAIL_LIMIT = envInt('LOGIN_ACCOUNT_FAIL_LIMIT', 5);

/** 로그인 실패 per-account 윈도우(ms). 기본 5분. */
export const LOGIN_ACCOUNT_WINDOW_MS = envInt('LOGIN_ACCOUNT_WINDOW_MS', 5 * 60_000);

/**
 * auth 리미터(`src/lib/auth/rateLimit.ts`)가 동시에 추적하는 최대 버킷 수.
 * signup/forgot/resend/login 키가 공유 Map을 쓴다. 초과 시 만료분만 정리하고
 * 자리가 없으면 **신규 키를 거부(과차단)** 한다 — 활성 윈도 LRU eviction 금지.
 */
export const MAX_AUTH_RATE_LIMIT_BUCKETS = envInt('MAX_AUTH_RATE_LIMIT_BUCKETS', 10_000);
