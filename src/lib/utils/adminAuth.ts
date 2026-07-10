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
    throw new ForbiddenError('요청 한도 초과 — 잠시 후 다시 시도하세요');
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
