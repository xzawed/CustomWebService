import { describe, it, expect } from 'vitest';
import { z } from 'zod/v4';
import { parseJsonBody, enforceRateLimit } from './routeHelpers';
import { ValidationError, RateLimitError } from '@/lib/utils/errors';

const testSchema = z.object({ name: z.string(), age: z.number() });

function makeRequest(body: unknown, ip = '127.0.0.1'): Request {
  return new Request('https://test.example.com/api', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify(body),
  });
}

function makeMalformedRequest(ip = '127.0.0.1'): Request {
  return new Request('https://test.example.com/api', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: 'not-valid-json{{{',
  });
}

describe('parseJsonBody', () => {
  it('유효한 바디는 파싱된 데이터를 반환한다', async () => {
    const req = makeRequest({ name: 'Alice', age: 30 });
    const result = await parseJsonBody(req, testSchema);
    expect(result).toEqual({ name: 'Alice', age: 30 });
  });

  it('JSON 파싱 실패 시 ValidationError("요청 형식이 올바르지 않습니다.")를 던진다', async () => {
    await expect(parseJsonBody(makeMalformedRequest(), testSchema)).rejects.toThrow(ValidationError);
    try {
      await parseJsonBody(makeMalformedRequest(), testSchema);
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      expect((err as ValidationError).message).toBe('요청 형식이 올바르지 않습니다.');
    }
  });

  it('스키마 검증 실패 시 기본 메시지로 ValidationError를 던진다', async () => {
    const req = makeRequest({ name: 'Alice', age: 'not-a-number' });
    try {
      await parseJsonBody(req, testSchema);
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      expect((err as ValidationError).message).toBe('입력값이 올바르지 않습니다.');
    }
  });

  it('스키마 검증 실패 시 커스텀 메시지로 ValidationError를 던진다', async () => {
    const req = makeRequest({ name: 123, age: 'oops' });
    try {
      await parseJsonBody(req, testSchema, '커스텀 오류 메시지');
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      expect((err as ValidationError).message).toBe('커스텀 오류 메시지');
    }
  });
});

describe('enforceRateLimit', () => {
  it('한도 내에서는 예외를 던지지 않는다', () => {
    // 고유 prefix를 사용해 다른 테스트와 충돌 방지
    const uniquePrefix = `test-ok-${Date.now()}-${Math.random()}`;
    const req = makeRequest({}, '10.0.0.1');
    expect(() => enforceRateLimit(req, uniquePrefix, 3, 60 * 1000)).not.toThrow();
  });

  it('한도 초과 시 RateLimitError를 던진다', () => {
    const uniquePrefix = `test-limit-${Date.now()}-${Math.random()}`;
    const ip = '10.0.0.2';

    // limit=2 설정: 2번은 통과, 3번째에서 실패
    const req1 = makeRequest({}, ip);
    const req2 = makeRequest({}, ip);
    const req3 = makeRequest({}, ip);

    expect(() => enforceRateLimit(req1, uniquePrefix, 2, 60 * 1000)).not.toThrow();
    expect(() => enforceRateLimit(req2, uniquePrefix, 2, 60 * 1000)).not.toThrow();
    expect(() => enforceRateLimit(req3, uniquePrefix, 2, 60 * 1000)).toThrow(RateLimitError);
  });
});
