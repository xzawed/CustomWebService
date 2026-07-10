import crypto from 'crypto';
import { getClientIp } from '@/lib/auth/rateLimit';
import { ForbiddenError } from '@/lib/utils/errors';
import { LRUMap } from '@/lib/utils/lruMap';
import {
  RATE_LIMIT_PER_MIN,
  RATE_LIMIT_WINDOW_MS,
  MAX_CONCURRENT_RATE_LIMIT_USERS,
} from '@/lib/config/rateLimit';

// One-time random key for HMAC-based timing-safe string comparison (never exported)
const _HMAC_KEY = crypto.randomBytes(32);

// In-memory rate limit per IP — proxy 라우트와 동일 한도/공용 설정 사용
// LRUMap으로 활성 IP 한도 초과 시 자동 evict (메모리 누적 차단)
const rateLimitMap = new LRUMap<string, { count: number; resetAt: number }>(MAX_CONCURRENT_RATE_LIMIT_USERS);

/**
 * 레이트리밋 초과 전용 에러. `ForbiddenError`를 상속하므로 기존 admin 라우트의
 * 403 응답 동작은 그대로 유지되고, `checkAdminAuth()`만 타입으로 인증 실패와 구분한다.
 * (메시지 문자열 매칭은 취약하므로 쓰지 않는다.)
 */
class AdminRateLimitError extends ForbiddenError {}

function checkRateLimit(ip: string): void {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  // now >= resetAt: 윈도우 경계(정확히 reset 시각)에 도착한 요청도 새 윈도우로 리셋한다.
  // proxy/route.ts의 레이트리밋 로직과 동일하게 맞춤(이전엔 `>`라 경계 요청이 만료된 윈도우를 증가시켰음).
  if (!entry || now >= entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return;
  }
  entry.count++;
  if (entry.count > RATE_LIMIT_PER_MIN) {
    throw new AdminRateLimitError('요청 한도 초과 — 잠시 후 다시 시도하세요');
  }
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
