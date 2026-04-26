import crypto from 'crypto';
import { ForbiddenError } from '@/lib/utils/errors';

// One-time random key for HMAC-based timing-safe string comparison (never exported)
const _HMAC_KEY = crypto.randomBytes(32);

// In-memory rate limit: max 60 requests per minute per IP
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 60;

function checkRateLimit(ip: string): void {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return;
  }
  entry.count++;
  if (entry.count > RATE_LIMIT_MAX) {
    throw new ForbiddenError('요청 한도 초과 — 잠시 후 다시 시도하세요');
  }
  // Clean old entries periodically
  if (rateLimitMap.size > 1000) {
    for (const [k, v] of rateLimitMap) {
      if (now > v.resetAt) rateLimitMap.delete(k);
    }
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
  // Rate limit check first
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown';
  checkRateLimit(ip);

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
