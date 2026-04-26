import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { withAdminCors, verifyAdminKey, adminCorsHeaders } from './adminAuth';
import { ForbiddenError } from './errors';

// logger는 사용되지 않지만 errors.ts가 import하므로 mock
vi.mock('@/lib/utils/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

// errors.ts → failover.ts → connection.ts 체인 mock
vi.mock('@/lib/db/failover', () => ({
  isDbConnectionError: vi.fn().mockReturnValue(false),
  reportFailure: vi.fn(),
}));

// i18n mock
vi.mock('@/lib/i18n', () => ({
  t: (key: string) => key,
}));

// ───────────────────────────────────────────────
// withAdminCors
// ───────────────────────────────────────────────
describe('withAdminCors()', () => {
  it('원본 응답에 CORS 헤더를 추가한다', () => {
    const original = new Response('{"ok":true}', { status: 200 });
    const result = withAdminCors(original);

    for (const [key, value] of Object.entries(adminCorsHeaders)) {
      expect(result.headers.get(key)).toBe(value);
    }
  });

  it('원본 status / statusText를 유지한다', () => {
    const original = new Response(null, { status: 204, statusText: 'No Content' });
    const result = withAdminCors(original);
    expect(result.status).toBe(204);
    expect(result.statusText).toBe('No Content');
  });

  it('기존 헤더에 CORS 헤더를 추가(덮어쓰기)한다', () => {
    const original = new Response(null, {
      headers: { 'X-Custom': 'hello', 'Access-Control-Allow-Origin': 'https://old.example.com' },
    });
    const result = withAdminCors(original);
    // 기존 커스텀 헤더는 유지
    expect(result.headers.get('X-Custom')).toBe('hello');
    // CORS 헤더는 adminCorsHeaders 값으로 덮어씌워짐
    expect(result.headers.get('Access-Control-Allow-Origin')).toBe(
      adminCorsHeaders['Access-Control-Allow-Origin']
    );
  });
});

// ───────────────────────────────────────────────
// verifyAdminKey
// ───────────────────────────────────────────────
describe('verifyAdminKey()', () => {
  // 각 테스트에서 다른 IP를 사용해 rate-limit 카운터 오염 방지
  let ipCounter = 0;
  function makeRequest(headers: Record<string, string> = {}, ip?: string): Request {
    const resolvedIp = ip ?? `10.0.0.${ipCounter++}`;
    return new Request('http://test.com/admin', {
      headers: {
        'x-forwarded-for': resolvedIp,
        ...headers,
      },
    });
  }

  beforeEach(() => {
    vi.stubEnv('ADMIN_API_KEY', 'secret-admin-key');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('Authorization 헤더 없으면 ForbiddenError를 던진다', () => {
    expect(() => verifyAdminKey(makeRequest())).toThrow(ForbiddenError);
  });

  it("'Bearer'로 시작하지 않으면 ForbiddenError를 던진다", () => {
    expect(() =>
      verifyAdminKey(makeRequest({ Authorization: 'Token secret-admin-key' }))
    ).toThrow(ForbiddenError);
  });

  it('ADMIN_API_KEY 환경변수가 없으면 ForbiddenError를 던진다', () => {
    vi.stubEnv('ADMIN_API_KEY', '');
    // 빈 문자열은 falsy이므로 에러 발생
    expect(() =>
      verifyAdminKey(makeRequest({ Authorization: 'Bearer secret-admin-key' }))
    ).toThrow(ForbiddenError);
  });

  it('잘못된 키이면 ForbiddenError를 던진다', () => {
    expect(() =>
      verifyAdminKey(makeRequest({ Authorization: 'Bearer wrong-key' }))
    ).toThrow(ForbiddenError);
  });

  it('올바른 키이면 에러 없이 통과한다', () => {
    expect(() =>
      verifyAdminKey(makeRequest({ Authorization: 'Bearer secret-admin-key' }))
    ).not.toThrow();
  });

  it('x-real-ip 헤더만 있어도 레이트 리밋 IP를 식별한다', () => {
    const req = new Request('http://test.com/admin', {
      headers: {
        'x-real-ip': '192.168.1.100',
        Authorization: 'Bearer secret-admin-key',
      },
    });
    expect(() => verifyAdminKey(req)).not.toThrow();
  });

  it('헤더 없이 요청하면 IP가 unknown으로 처리된다 (에러 종류만 확인)', () => {
    // Authorization 없으므로 ForbiddenError 발생 (IP unknown 처리는 내부)
    const req = new Request('http://test.com/admin');
    expect(() => verifyAdminKey(req)).toThrow(ForbiddenError);
  });

  describe('레이트 리밋', () => {
    it('같은 IP로 61회 이상 호출하면 ForbiddenError(레이트 리밋)를 던진다', () => {
      const rateIp = `rate-test-ip-${Date.now()}`;
      // 올바른 키로 60회 통과
      for (let i = 0; i < 60; i++) {
        expect(() =>
          verifyAdminKey(
            new Request('http://test.com/admin', {
              headers: {
                'x-forwarded-for': rateIp,
                Authorization: 'Bearer secret-admin-key',
              },
            })
          )
        ).not.toThrow();
      }
      // 61번째 요청 → 레이트 리밋 초과
      expect(() =>
        verifyAdminKey(
          new Request('http://test.com/admin', {
            headers: {
              'x-forwarded-for': rateIp,
              Authorization: 'Bearer secret-admin-key',
            },
          })
        )
      ).toThrow(ForbiddenError);
    });
  });
});
