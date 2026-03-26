import { describe, it, expect } from 'vitest';
import {
  AppError,
  NotFoundError,
  ValidationError,
  AuthRequiredError,
  ForbiddenError,
  RateLimitError,
  GenerationError,
  DeployError,
  handleApiError,
} from './errors';

describe('AppError', () => {
  it('기본 statusCode는 500이다', () => {
    const err = new AppError('TEST', '테스트 에러');
    expect(err.statusCode).toBe(500);
    expect(err.code).toBe('TEST');
    expect(err.message).toBe('테스트 에러');
  });
});

describe('NotFoundError', () => {
  it('statusCode가 404이다', () => {
    const err = new NotFoundError('프로젝트');
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
  });

  it('id를 포함한 메시지를 생성한다', () => {
    const err = new NotFoundError('프로젝트', 'abc-123');
    expect(err.message).toContain('abc-123');
  });

  it('id 없이도 메시지를 생성한다', () => {
    const err = new NotFoundError('프로젝트');
    expect(err.message).toContain('프로젝트');
  });
});

describe('ValidationError', () => {
  it('statusCode가 400이다', () => {
    const err = new ValidationError('입력값이 잘못되었습니다');
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('INVALID_INPUT');
  });
});

describe('AuthRequiredError', () => {
  it('statusCode가 401이다', () => {
    const err = new AuthRequiredError();
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('AUTH_REQUIRED');
  });
});

describe('ForbiddenError', () => {
  it('statusCode가 403이다', () => {
    const err = new ForbiddenError();
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe('FORBIDDEN');
  });

  it('커스텀 메시지를 받는다', () => {
    const err = new ForbiddenError('이 리소스에 접근할 수 없습니다');
    expect(err.message).toBe('이 리소스에 접근할 수 없습니다');
  });
});

describe('RateLimitError', () => {
  it('statusCode가 429이다', () => {
    const err = new RateLimitError();
    expect(err.statusCode).toBe(429);
    expect(err.code).toBe('RATE_LIMITED');
  });
});

describe('GenerationError', () => {
  it('statusCode가 500이다', () => {
    const err = new GenerationError();
    expect(err.statusCode).toBe(500);
    expect(err.code).toBe('GENERATION_FAILED');
  });
});

describe('DeployError', () => {
  it('statusCode가 500이다', () => {
    const err = new DeployError();
    expect(err.statusCode).toBe(500);
    expect(err.code).toBe('DEPLOY_FAILED');
  });
});

describe('handleApiError', () => {
  it('AppError를 올바른 status와 JSON으로 변환한다', async () => {
    const err = new ValidationError('잘못된 입력');
    const response = handleApiError(err);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('INVALID_INPUT');
  });

  it('일반 Error는 500으로 처리한다', async () => {
    const err = new Error('알 수 없는 오류');
    const response = handleApiError(err);
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error.code).toBe('INTERNAL_ERROR');
  });

  it('문자열 에러도 500으로 처리한다', async () => {
    const response = handleApiError('unexpected string error');
    expect(response.status).toBe(500);
  });

  it('ZodError는 400으로 처리한다', async () => {
    const zodError = new Error('zod validation failed');
    zodError.name = 'ZodError';
    const response = handleApiError(zodError);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe('INVALID_INPUT');
  });
});
