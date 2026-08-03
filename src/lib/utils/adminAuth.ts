import crypto from 'crypto';
import { getClientIp } from '@/lib/auth/rateLimit';
import { ForbiddenError } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';
import {
  RATE_LIMIT_PER_MIN,
  RATE_LIMIT_WINDOW_MS,
  MAX_CONCURRENT_RATE_LIMIT_USERS,
} from '@/lib/config/rateLimit';

// One-time random key for HMAC-based timing-safe string comparison (never exported)
const _HMAC_KEY = crypto.randomBytes(32);

/**
 * 인메모리 per-IP 레이트리밋 (관리자 키 브루트포스 방어). proxy 라우트와 한도 설정을 공유한다.
 *
 * **`LRUMap`을 쓰지 않는다.** 용량이 차면 살아 있는 윈도의 카운터가 통째로 evict되어
 * 그 IP의 다음 요청이 `count:1`로 다시 시작한다 — IP를 회전시키면 한도가 무력화된다.
 * 만료된 버킷만 정리하고, 정리 후에도 자리가 없으면 새 키를 거부(=차단)한다.
 * `proxy/route.ts`·`siteRateLimit.ts`와 동일한 원칙이다 (SDD 4.1).
 *
 * **수용한 트레이드오프**: 이 검사는 인증 *이전*에 돌기 때문에, 미인증 트래픽이 서로 다른
 * IP로 버킷을 모두 채우면 정상 관리자도 차단될 수 있다. `auth/rateLimit.ts`가 signup·forgot에
 * 대해 내린 결론과 같다 — 우회보다 과차단이 안전하다. 대신 소진 사실을 로그로 드러내
 * 조용한 잠금이 되지 않게 한다.
 *
 * Railway 단일 인스턴스 전제. 멀티 인스턴스 전환 시 Redis 등으로 교체 필요.
 */
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

/** 용량 소진 경고의 마지막 시각. 버킷을 만들지 못한 상황이라 버킷 단위로 억제할 수 없다. */
let capacityWarnedAt = 0;

/**
 * 레이트리밋 초과 전용 에러. `ForbiddenError`를 상속하므로 기존 admin 라우트의
 * 403 응답 동작은 그대로 유지되고, `checkAdminAuth()`만 타입으로 인증 실패와 구분한다.
 * (메시지 문자열 매칭은 취약하므로 쓰지 않는다.)
 */
class AdminRateLimitError extends ForbiddenError {}

/**
 * 용량 소진을 남긴다. 이 상태에서는 **정상 관리자도 차단**되므로 반드시 관측 가능해야 한다.
 * 윈도당 1회로 억제한다 — 봇이 계속 두드리면 매 요청마다 남아 로그가 무의미해진다.
 */
function warnCapacityExhausted(now: number): void {
  if (now - capacityWarnedAt < RATE_LIMIT_WINDOW_MS) return;
  capacityWarnedAt = now;
  logger.warn('Admin rate limit capacity exhausted — new client IPs are being blocked', {
    maxBuckets: MAX_CONCURRENT_RATE_LIMIT_USERS,
  });
}

function checkRateLimit(ip: string): void {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  // now >= resetAt: 윈도 경계(정확히 reset 시각)에 도착한 요청도 새 윈도로 리셋한다.
  // proxy/route.ts의 레이트리밋 로직과 동일하게 맞춤(이전엔 `>`라 경계 요청이 만료된 윈도를 증가시켰음).
  if (entry && now < entry.resetAt) {
    if (entry.count >= RATE_LIMIT_PER_MIN) {
      throw new AdminRateLimitError('요청 한도 초과 — 잠시 후 다시 시도하세요');
    }
    entry.count++;
    return;
  }

  // 신규 키인데 자리가 없다 — 만료분만 정리하고, 그래도 없으면 차단한다.
  // 이미 키가 있으면(만료된 버킷) 맵이 커지지 않으므로 용량 검사를 건너뛴다.
  if (!entry && rateLimitMap.size >= MAX_CONCURRENT_RATE_LIMIT_USERS) {
    for (const [key, bucket] of rateLimitMap) {
      if (now >= bucket.resetAt) rateLimitMap.delete(key);
    }
    if (rateLimitMap.size >= MAX_CONCURRENT_RATE_LIMIT_USERS) {
      // 활성 카운터를 버리느니 차단한다(한도 우회 방지).
      warnCapacityExhausted(now);
      throw new AdminRateLimitError('요청 한도 초과 — 잠시 후 다시 시도하세요');
    }
  }

  rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
}

export const adminCorsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': process.env.NEXT_PUBLIC_APP_URL ?? 'https://xzawed.xyz',
  'Access-Control-Allow-Methods': 'GET, POST',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
};

/** Attach CORS headers to any Response without consuming its body. */
export function withAdminCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(adminCorsHeaders)) {
    headers.set(k, v);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function verifyAdminKey(request: Request): void {
  // Rate limit check first. IP 도출은 getClientIp 단일 출처를 사용한다(XFF 최우측 — 위조 방지).
  checkRateLimit(getClientIp(request));

  const header = request.headers.get('Authorization');
  if (!header?.startsWith('Bearer ')) {
    throw new ForbiddenError('관리자 인증이 필요합니다');
  }
  const key = header.slice(7);
  const expected = process.env.ADMIN_API_KEY;
  if (!expected) {
    throw new ForbiddenError('ADMIN_API_KEY가 설정되지 않았습니다');
  }
  const hmac = (b: Buffer) => crypto.createHmac('sha256', _HMAC_KEY).update(b).digest();
  if (!crypto.timingSafeEqual(hmac(Buffer.from(key)), hmac(Buffer.from(expected)))) {
    throw new ForbiddenError('유효하지 않은 관리자 키입니다');
  }
}

/** `checkAdminAuth()`의 결과. 레이트리밋을 인증 실패와 반드시 구분한다. */
export type AdminAuthResult = 'authorized' | 'unauthorized' | 'rate_limited';

/**
 * verifyAdminKey의 비-throw 변형. 관리자 인증 실패 시 403이 아니라
 * **공개 응답으로 폴백**해야 하는 라우트(`/api/v1/health?detailed=true`)용.
 *
 * 인라인 `===` 비교를 쓰지 말 것 — 이 헬퍼를 통해야 timing-safe 비교와
 * per-IP 레이트리밋(브루트포스 방어)이 함께 적용된다.
 * 공개 경로가 레이트리밋을 소모하지 않도록, 관리자 응답을 원하는 요청에서만 호출한다.
 *
 * **`rate_limited`를 `unauthorized`로 뭉개지 말 것.** 그렇게 하면 올바른 키를 가진
 * 관리자가 한도 초과 시 조용히 공개 응답(`status: 'ok'`)을 받아 **실제 unhealthy 상태가
 * 은폐된다.** 인시던트 대응 런북이 `?detailed=true`를 반복 호출하는 경로라 실제로 위험하다.
 */
export function checkAdminAuth(request: Request): AdminAuthResult {
  try {
    verifyAdminKey(request);
    return 'authorized';
  } catch (error) {
    return error instanceof AdminRateLimitError ? 'rate_limited' : 'unauthorized';
  }
}
