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
 * 보안: 비밀번호 재설정 같은 보안 링크를 **클라이언트가 위조 가능한 호스트 헤더**
 * (`x-forwarded-host`/`host`)에서 만들면 host-header 인젝션(피해자에게 공격자 도메인
 * 링크를 보내 토큰 탈취 → password reset poisoning)에 노출된다. 따라서 헤더를 신뢰하지
 * 않고 **서버 설정에서만** 도출한다. 우선순위:
 *  1) `APP_URL` 환경변수 (가장 명시적)
 *  2) `NEXT_PUBLIC_ROOT_DOMAIN` (apex 도메인, https 가정)
 *  3) 로컬/개발 폴백으로 요청 origin (프로덕션에선 위 둘 중 하나가 반드시 설정됨)
 * 후행 슬래시는 제거한다(호출부가 `${baseUrl}/verify-email` 식으로 이어 붙임).
 *
 * 참고: 프록시(Railway) 뒤에서 `new URL(request.url).origin`은 내부 바인드 주소
 * (예: `http://0.0.0.0:8080`)로 잡히므로 프로덕션 폴백으로 쓰면 안 된다 —
 * 그래서 신뢰 가능한 `APP_URL`/`NEXT_PUBLIC_ROOT_DOMAIN`을 먼저 사용한다.
 */
export function getBaseUrl(request: Request): string {
  const appUrl = process.env.APP_URL;
  if (appUrl) return appUrl.replace(/\/+$/, '');

  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN;
  if (rootDomain) return `https://${rootDomain.replace(/\/+$/, '')}`;

  return new URL(request.url).origin;
}
