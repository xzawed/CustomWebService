import { logger } from './logger';
import { isDbConnectionError, reportFailure } from '@/lib/db/failover';

export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 500
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    super('NOT_FOUND', `${resource}${id ? ` (${id})` : ''}을(를) 찾을 수 없습니다.`, 404);
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super('INVALID_INPUT', message, 400);
    this.name = 'ValidationError';
  }
}

export class AuthRequiredError extends AppError {
  constructor() {
    super('AUTH_REQUIRED', '로그인이 필요합니다.', 401);
    this.name = 'AuthRequiredError';
  }
}

export class ForbiddenError extends AppError {
  constructor(message = '접근 권한이 없습니다.') {
    super('FORBIDDEN', message, 403);
    this.name = 'ForbiddenError';
  }
}

export class RateLimitError extends AppError {
  constructor(message = '요청 횟수를 초과했습니다. 잠시 후 다시 시도해주세요.') {
    super('RATE_LIMITED', message, 429);
    this.name = 'RateLimitError';
  }
}

export class GenerationError extends AppError {
  constructor(message = '코드 생성에 실패했습니다.') {
    super('GENERATION_FAILED', message, 500);
    this.name = 'GenerationError';
  }
}

export class DeployError extends AppError {
  constructor(message = '배포에 실패했습니다.') {
    super('DEPLOY_FAILED', message, 500);
    this.name = 'DeployError';
  }
}

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8' };

/** Wrapper around Response that always includes charset=utf-8 in Content-Type */
export function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { ...JSON_HEADERS, ...(typeof init?.headers === 'object' ? init.headers : {}) },
  });
}

export function handleApiError(error: unknown): Response {
  // DB 연결 에러 감지 → failover 시스템에 보고
  if (isDbConnectionError(error)) {
    reportFailure(error);
  }

  if (error instanceof AppError) {
    return jsonResponse(
      { success: false, error: { code: error.code, message: error.message } },
      { status: error.statusCode }
    );
  }

  // ZodError → 400 Bad Request
  if (error instanceof Error && error.name === 'ZodError') {
    return jsonResponse(
      { success: false, error: { code: 'INVALID_INPUT', message: '입력값이 올바르지 않습니다.' } },
      { status: 400 }
    );
  }

  // PostgREST / Supabase database errors (plain objects with code + message)
  if (
    error &&
    typeof error === 'object' &&
    'code' in error &&
    'message' in error &&
    !(error instanceof Error)
  ) {
    const pgError = error as { code: string; message: string; details?: string; hint?: string };
    logger.error('Database error', {
      code: pgError.code,
      message: pgError.message,
      details: pgError.details,
      hint: pgError.hint,
    });

    return jsonResponse(
      {
        success: false,
        error: { code: 'DATABASE_ERROR', message: `데이터베이스 오류: ${pgError.message}` },
      },
      { status: 500 }
    );
  }

  // Generic Error instances - log full details server-side only
  const errMessage = error instanceof Error ? error.message : String(error);
  logger.error('Unhandled API error', {
    message: errMessage,
    name: error instanceof Error ? error.name : undefined,
    stack: error instanceof Error ? error.stack : undefined,
  });

  // Never expose internal error details in production
  const clientMessage =
    process.env.NODE_ENV === 'production'
      ? '서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.'
      : errMessage || '서버 오류가 발생했습니다.';

  return jsonResponse(
    { success: false, error: { code: 'INTERNAL_ERROR', message: clientMessage } },
    { status: 500 }
  );
}
