import { describe, it, expect, afterEach } from 'vitest';
import { z } from 'zod/v4';
import { parseJsonBody, enforceRateLimit, getBaseUrl } from './routeHelpers';
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

describe('getBaseUrl', () => {
  const originalAppUrl = process.env.APP_URL;
  afterEach(() => {
    if (originalAppUrl === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = originalAppUrl;
  });

  function reqWith(headers: Record<string, string>): Request {
    // 내부 바인드 주소를 흉내내 — 프록시 헤더가 우선되는지 검증
    return new Request('http://0.0.0.0:8080/api/v1/auth/forgot-password', { method: 'POST', headers });
  }

  it('APP_URL 환경변수가 있으면 우선하고 후행 슬래시를 제거한다', () => {
    process.env.APP_URL = 'https://xzawed.xyz/';
    expect(getBaseUrl(reqWith({ 'x-forwarded-host': 'evil.example.com' }))).toBe('https://xzawed.xyz');
  });

  it('APP_URL이 없으면 x-forwarded-host/proto로 공개 origin을 만든다 (내부 0.0.0.0 아님)', () => {
    delete process.env.APP_URL;
    const url = getBaseUrl(reqWith({ 'x-forwarded-host': 'xzawed.xyz', 'x-forwarded-proto': 'https' }));
    expect(url).toBe('https://xzawed.xyz');
  });

  it('x-forwarded-proto 미설정 시 https를 기본 사용한다', () => {
    delete process.env.APP_URL;
    expect(getBaseUrl(reqWith({ 'x-forwarded-host': 'xzawed.xyz' }))).toBe('https://xzawed.xyz');
  });

  it('포워드 헤더가 없으면 요청 origin으로 폴백한다', () => {
    delete process.env.APP_URL;
    expect(getBaseUrl(new Request('https://fallback.example.com/api', { method: 'POST' }))).toBe(
      'https://fallback.example.com',
    );
  });
});
