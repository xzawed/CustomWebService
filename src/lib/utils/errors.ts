import { logger } from './logger';
import { t } from '@/lib/i18n';

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
    super('NOT_FOUND', t('error.notFound', { resource, id: id ? ` (${id})` : '' }), 404);
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
    super('AUTH_REQUIRED', t('error.authRequired'), 401);
    this.name = 'AuthRequiredError';
  }
}

export class ForbiddenError extends AppError {
  constructor(message = t('error.forbidden')) {
    super('FORBIDDEN', message, 403);
    this.name = 'ForbiddenError';
  }
}

export class RateLimitError extends AppError {
  constructor(message = t('error.rateLimit')) {
    super('RATE_LIMITED', message, 429);
    this.name = 'RateLimitError';
  }
}

export class ConflictError extends AppError {
  constructor(message = t('error.conflict')) {
    super('CONFLICT', message, 409);
    this.name = 'ConflictError';
  }
}

export class EmailNotVerifiedError extends AppError {
  constructor(message = t('error.emailNotVerified')) {
    super('EMAIL_NOT_VERIFIED', message, 403);
    this.name = 'EmailNotVerifiedError';
  }
}

export class GenerationError extends AppError {
  constructor(message = t('error.generation')) {
    super('GENERATION_FAILED', message, 500);
    this.name = 'GenerationError';
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
  if (error instanceof AppError) {
    if (error.statusCode === 401 || error.statusCode === 403 || error.statusCode === 429) {
      logger.warn('Access control event', { code: error.code, status: error.statusCode });
    }
    return jsonResponse(
      { success: false, error: { code: error.code, message: error.message } },
      { status: error.statusCode }
    );
  }

  // ZodError → 400 Bad Request
  if (error instanceof Error && error.name === 'ZodError') {
    return jsonResponse(
      { success: false, error: { code: 'INVALID_INPUT', message: t('error.validation') } },
      { status: 400 }
    );
  }

  // 일반 DB 에러 (code + message를 가진 plain object 형태)
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
        error: { code: 'DATABASE_ERROR', message: t('error.database') },
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
      ? t('error.server')
      : errMessage || t('error.server');

  return jsonResponse(
    { success: false, error: { code: 'INTERNAL_ERROR', message: clientMessage } },
    { status: 500 }
  );
}
