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
