import { z } from 'zod/v4';
import { checkRateLimit, getClientIp } from '@/lib/auth/rateLimit';
import { ValidationError, RateLimitError } from '@/lib/utils/errors';

/**
 * JSON 바디를 파싱하고 Zod 스키마로 검증한다.
 * 파싱 실패 시 ValidationError('요청 형식이 올바르지 않습니다.'),
 * 스키마 검증 실패 시 ValidationError(invalidMsg) 를 던진다.
 */
export async function parseJsonBody<T>(
  request: Request,
  schema: z.ZodType<T>,
  invalidMsg?: string,
): Promise<T> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ValidationError('요청 형식이 올바르지 않습니다.');
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new ValidationError(invalidMsg ?? '입력값이 올바르지 않습니다.');
  return parsed.data;
}

/**
 * IP 기반 레이트 리밋을 검사한다.
 * 한도 초과 시 RateLimitError 를 던진다.
 */
export function enforceRateLimit(
  request: Request,
  prefix: string,
  limit: number,
  windowMs: number,
): void {
  if (!checkRateLimit(`${prefix}:${getClientIp(request)}`, limit, windowMs)) {
    throw new RateLimitError();
  }
}

/**
 * 이메일 링크(인증·비밀번호 재설정)에 쓸 공개 base URL을 도출한다.
 *
 * 프록시(Railway 등) 뒤에서는 `new URL(request.url).origin`이 내부 바인드 주소
 * (예: `http://0.0.0.0:8080`)로 잡혀 메일 링크가 깨진다. 우선순위:
 *  1) `APP_URL` 환경변수 — 가장 신뢰(호스트 헤더 인젝션과 무관). 프로덕션 권장.
 *  2) `x-forwarded-host` (+ `x-forwarded-proto`) — 프록시가 설정한 공개 호스트.
 *  3) 마지막 폴백으로 요청 origin.
 * 후행 슬래시는 제거한다(호출부가 `${baseUrl}/verify-email` 식으로 이어 붙임).
 */
export function getBaseUrl(request: Request): string {
  const envUrl = process.env.APP_URL;
  if (envUrl) return envUrl.replace(/\/+$/, '');

  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  if (host) {
    const proto = request.headers.get('x-forwarded-proto') ?? 'https';
    return `${proto}://${host}`;
  }

  return new URL(request.url).origin;
}
