import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { withAdminCors, verifyAdminKey, adminCorsHeaders } from './adminAuth';
import { ForbiddenError } from './errors';

// logger는 사용되지 않지만 errors.ts가 import하므로 mock
vi.mock('@/lib/utils/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
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

// ───────────────────────────────────────────────
// 레이트리밋 용량 정책 (SDD 4.1 — 활성 윈도 evict 금지)
//
// 버킷 Map이 모듈 레벨이므로 `vi.resetModules()` + 동적 import로 매 테스트를 격리한다.
// 용량·한도를 작게 낮춰 1000회 반복 없이 경계를 검증한다.
// ───────────────────────────────────────────────
describe('verifyAdminKey() 레이트리밋 용량 정책', () => {
  const KEY = 'secret-admin-key';

  /**
   * `vi.resetModules()` 이후의 모듈은 `errors.ts`까지 새로 로드하므로,
   * 파일 최상단에서 정적 import한 `ForbiddenError`와 **클래스 identity가 다르다**.
   * `toThrow(ForbiddenError)`가 조용히 어긋나지 않도록 같은 레지스트리의 클래스를 함께 돌려준다.
   */
  async function loadAdminAuth(
    maxUsers: number,
    perMin: number
  ): Promise<{
    verifyAdminKey: (request: Request) => void;
    Forbidden: typeof ForbiddenError;
  }> {
    vi.resetModules();
    vi.stubEnv('ADMIN_API_KEY', KEY);
    vi.stubEnv('MAX_CONCURRENT_RATE_LIMIT_USERS', String(maxUsers));
    vi.stubEnv('RATE_LIMIT_PER_MIN', String(perMin));
    const [{ verifyAdminKey }, { ForbiddenError: Forbidden }] = await Promise.all([
      import('./adminAuth'),
      import('./errors'),
    ]);
    return { verifyAdminKey, Forbidden };
  }

  function req(ip: string): Request {
    return new Request('http://test.com/admin', {
      headers: { 'x-forwarded-for': ip, Authorization: `Bearer ${KEY}` },
    });
  }

  /** x-forwarded-for 없이 x-real-ip만 붙인 요청 — 신뢰 경계가 붙였다는 보장이 없다. */
  function reqRealIpOnly(realIp: string): Request {
    return new Request('http://test.com/admin', {
      headers: { 'x-real-ip': realIp, Authorization: `Bearer ${KEY}` },
    });
  }

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it('용량이 가득 차면 살아 있는 윈도를 버리는 대신 새 IP를 차단한다', async () => {
    const { verifyAdminKey, Forbidden } = await loadAdminAuth(2, 2);

    // ip-a 한도 소진
    expect(() => verifyAdminKey(req('ip-a'))).not.toThrow();
    expect(() => verifyAdminKey(req('ip-a'))).not.toThrow();
    expect(() => verifyAdminKey(req('ip-a'))).toThrow(Forbidden);

    // ip-b 로 용량을 상한까지 채운다
    expect(() => verifyAdminKey(req('ip-b'))).not.toThrow();

    // ip-c 는 자리가 없다 → 활성 카운터를 evict하지 말고 차단해야 한다
    expect(() => verifyAdminKey(req('ip-c'))).toThrow(Forbidden);
  });

  it('용량 압박이 있어도 기존 IP의 한도가 리셋되지 않는다 (우회 회귀)', async () => {
    const { verifyAdminKey, Forbidden } = await loadAdminAuth(2, 2);

    expect(() => verifyAdminKey(req('ip-a'))).not.toThrow();
    expect(() => verifyAdminKey(req('ip-a'))).not.toThrow();
    expect(() => verifyAdminKey(req('ip-a'))).toThrow(Forbidden);

    // 용량을 넘기는 신규 IP들 — LRU였다면 여기서 ip-a 버킷이 evict된다
    expect(() => verifyAdminKey(req('ip-b'))).not.toThrow();
    expect(() => verifyAdminKey(req('ip-c'))).toThrow(Forbidden);

    // ip-a 는 여전히 한도 초과 상태여야 한다. 통과하면 한도가 우회된 것이다.
    expect(() => verifyAdminKey(req('ip-a'))).toThrow(Forbidden);
  });

  it('만료된 버킷은 정리되어 새 IP가 다시 들어갈 수 있다', async () => {
    vi.useFakeTimers();
    const { verifyAdminKey, Forbidden } = await loadAdminAuth(2, 5);

    expect(() => verifyAdminKey(req('ip-a'))).not.toThrow();
    expect(() => verifyAdminKey(req('ip-b'))).not.toThrow();
    // 상한 도달 — 만료된 것이 없으므로 차단
    expect(() => verifyAdminKey(req('ip-c'))).toThrow(Forbidden);

    // 윈도가 지나면 만료 버킷이 정리되어 자리가 생긴다
    vi.advanceTimersByTime(60_001);
    expect(() => verifyAdminKey(req('ip-c'))).not.toThrow();
  });

  it('용량 소진 경고는 윈도당 1회만 남긴다 (봇 트래픽 로그 폭발 방지)', async () => {
    const { verifyAdminKey, Forbidden } = await loadAdminAuth(1, 5);
    // resetModules 이후의 mock 인스턴스를 잡아야 대상 모듈과 같은 logger를 본다
    const { logger } = await import('@/lib/utils/logger');
    vi.mocked(logger.warn).mockClear();

    expect(() => verifyAdminKey(req('ip-a'))).not.toThrow();
    expect(() => verifyAdminKey(req('ip-b'))).toThrow(Forbidden);
    expect(() => verifyAdminKey(req('ip-c'))).toThrow(Forbidden);

    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it('x-real-ip는 신뢰하지 않는다 — 값이 달라도 같은 unknown 버킷을 공유한다', async () => {
    const { verifyAdminKey, Forbidden } = await loadAdminAuth(10, 1);

    // 첫 요청이 'unknown' 버킷을 만들고 한도(1)를 소진한다
    expect(() => verifyAdminKey(reqRealIpOnly('192.168.1.100'))).not.toThrow();

    // x-real-ip를 바꿔도 별도 버킷이 생기면 안 된다.
    // 통과한다면 헤더 회전으로 per-IP 한도를 무한히 우회할 수 있다는 뜻이다.
    expect(() => verifyAdminKey(reqRealIpOnly('203.0.113.7'))).toThrow(Forbidden);
  });
});
