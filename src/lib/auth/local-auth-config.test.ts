import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// NextAuth 및 Credentials Provider는 Node 환경에서 Next.js 런타임이 없으면 모듈 해석 실패.
// authorizeCredentials / authorizeWithLoginRateLimit는 순수 함수이므로 NextAuth를 모킹해 분리 테스트한다.
vi.mock('next-auth', () => ({
  default: vi.fn(() => ({ auth: vi.fn(), handlers: {}, signIn: vi.fn(), signOut: vi.fn() })),
}));
vi.mock('next-auth/providers/credentials', () => ({
  default: vi.fn(() => ({})),
}));

import {
  authorizeCredentials,
  authorizeWithLoginRateLimit,
} from './local-auth-config';
import { hashPassword } from './password';
import {
  isLimited,
  recordFailure,
  __resetAuthRateLimit,
} from './rateLimit';
import {
  LOGIN_IP_FAIL_LIMIT,
  LOGIN_IP_WINDOW_MS,
  LOGIN_ACCOUNT_FAIL_LIMIT,
  LOGIN_ACCOUNT_WINDOW_MS,
} from '@/lib/config/rateLimit';

function depsWith(user: {
  id: string;
  email: string;
  name: string | null;
  passwordHash: string | null;
}) {
  return { findByEmail: vi.fn(async (email: string) => (email === user.email ? user : null)) };
}

function requestWithIp(ip: string, xffChain?: string): Request {
  // @auth/core@0.41.3 callback/index.js 는 authorize 두 번째 인자를
  // `new Request(url, { headers, method, body: JSON.stringify(body) })` 로 재구성한다
  // (TODO: "Forward the original request as is"). 헤더가 빠지면 getClientIp가
  // 'unknown'으로 붕괴하므로 동일 형태로 고정 검증한다.
  const xff = xffChain ?? ip;
  const headers = Object.fromEntries(
    new Headers({
      'x-forwarded-for': xff,
      'content-type': 'application/x-www-form-urlencoded',
    }),
  );
  return new Request('https://xzawed.xyz/api/auth/callback/credentials', {
    headers,
    method: 'POST',
    body: JSON.stringify({ email: 'probe@example.com', password: 'x' }),
  });
}

describe('authorizeCredentials', () => {
  const user = {
    id: 'u-1',
    email: 'a@example.com',
    name: 'A',
    passwordHash: hashPassword('pw12345678'),
  };

  it('이메일·비밀번호 일치 시 사용자 신원 반환', async () => {
    const res = await authorizeCredentials('a@example.com', 'pw12345678', depsWith(user));
    expect(res).toEqual({ id: 'u-1', email: 'a@example.com', name: 'A' });
  });
  it('비밀번호 불일치 시 null', async () => {
    expect(await authorizeCredentials('a@example.com', 'wrong', depsWith(user))).toBeNull();
  });
  it('미존재 이메일 시 null', async () => {
    expect(await authorizeCredentials('none@example.com', 'pw12345678', depsWith(user))).toBeNull();
  });
  it('passwordHash 없는 계정은 null', async () => {
    const u = { ...user, passwordHash: null };
    expect(await authorizeCredentials('a@example.com', 'pw12345678', depsWith(u))).toBeNull();
  });
});

describe('authorizeWithLoginRateLimit', () => {
  const password = 'pw12345678';
  const user = {
    id: 'u-1',
    email: 'a@example.com',
    name: 'A',
    passwordHash: hashPassword(password),
  };

  beforeEach(() => {
    __resetAuthRateLimit();
  });

  afterEach(() => {
    __resetAuthRateLimit();
  });

  it('한도 초과 시 null을 반환하고 findByEmail(검증 경로)을 호출하지 않는다', async () => {
    const email = 'throttled@example.com';
    const emailKey = `login:email:${email}`;
    for (let i = 0; i < LOGIN_ACCOUNT_FAIL_LIMIT; i++) {
      expect(recordFailure(emailKey, LOGIN_ACCOUNT_WINDOW_MS)).toBe(true);
    }
    expect(isLimited(emailKey, LOGIN_ACCOUNT_FAIL_LIMIT)).toBe(true);

    const deps = depsWith(user);
    const res = await authorizeWithLoginRateLimit(
      email,
      'any-password',
      requestWithIp('203.0.113.10'),
      deps,
    );
    expect(res).toBeNull();
    expect(deps.findByEmail).not.toHaveBeenCalled();
  });

  it('실패 시 IP·이메일 키 둘 다 기록한다', async () => {
    const ip = '203.0.113.20';
    const email = 'fail-both@example.com';
    const deps = {
      findByEmail: vi.fn(async () => null),
    };

    await authorizeWithLoginRateLimit(email, 'wrong', requestWithIp(ip), deps);

    expect(isLimited(`login:ip:${ip}`, 1)).toBe(true);
    expect(isLimited(`login:email:${email}`, 1)).toBe(true);
    expect(deps.findByEmail).toHaveBeenCalledWith(email);
  });

  it('성공 시 실패를 기록하지 않고 이메일 키만 지운다(IP 키는 유지)', async () => {
    const ip = '203.0.113.30';
    const email = user.email;
    const ipKey = `login:ip:${ip}`;
    const emailKey = `login:email:${email}`;

    // 사전 실패로 양쪽 버킷을 만든다
    expect(recordFailure(ipKey, LOGIN_IP_WINDOW_MS)).toBe(true);
    expect(recordFailure(emailKey, LOGIN_ACCOUNT_WINDOW_MS)).toBe(true);
    expect(isLimited(ipKey, 1)).toBe(true);
    expect(isLimited(emailKey, 1)).toBe(true);

    const deps = depsWith(user);
    const res = await authorizeWithLoginRateLimit(email, password, requestWithIp(ip), deps);

    expect(res).toEqual({ id: 'u-1', email: 'a@example.com', name: 'A' });
    expect(isLimited(emailKey, 1)).toBe(false);
    expect(isLimited(ipKey, 1)).toBe(true);
    // 성공 경로에서 추가 실패 기록 없음 — IP count가 2가 되면 limit 2에서 true
    expect(isLimited(ipKey, 2)).toBe(false);
  });

  it('미존재 이메일과 잘못된 비밀번호는 동일한 스로틀 동작을 만든다', async () => {
    const ip = '203.0.113.40';
    const missingEmail = 'missing@example.com';
    const wrongEmail = user.email;

    const missingDeps = { findByEmail: vi.fn(async () => null) };
    const wrongDeps = depsWith(user);

    for (let i = 0; i < LOGIN_ACCOUNT_FAIL_LIMIT; i++) {
      await authorizeWithLoginRateLimit(
        missingEmail,
        'guess',
        requestWithIp(ip),
        missingDeps,
      );
      await authorizeWithLoginRateLimit(wrongEmail, 'wrong', requestWithIp(ip), wrongDeps);
    }

    // 둘 다 계정 한도에 도달
    expect(isLimited(`login:email:${missingEmail}`, LOGIN_ACCOUNT_FAIL_LIMIT)).toBe(true);
    expect(isLimited(`login:email:${wrongEmail}`, LOGIN_ACCOUNT_FAIL_LIMIT)).toBe(true);

    const missingAfter = { findByEmail: vi.fn(async () => null) };
    const wrongAfter = depsWith(user);

    expect(
      await authorizeWithLoginRateLimit(missingEmail, 'guess', requestWithIp(ip), missingAfter),
    ).toBeNull();
    expect(
      await authorizeWithLoginRateLimit(wrongEmail, 'wrong', requestWithIp(ip), wrongAfter),
    ).toBeNull();

    // 한도 초과 후 검증 경로 미호출 — 클라이언트에 구분 신호 없음(둘 다 null)
    expect(missingAfter.findByEmail).not.toHaveBeenCalled();
    expect(wrongAfter.findByEmail).not.toHaveBeenCalled();
  });

  it('이메일을 trim+lowercase로 정규화해 버킷 키를 잡는다', async () => {
    const ip = '203.0.113.50';
    const deps = { findByEmail: vi.fn(async () => null) };

    await authorizeWithLoginRateLimit('  Foo@Example.COM ', 'x', requestWithIp(ip), deps);

    expect(deps.findByEmail).toHaveBeenCalledWith('foo@example.com');
    expect(isLimited('login:email:foo@example.com', 1)).toBe(true);
  });

  /**
   * @auth/core@0.41.3 은 authorize(credentials, request)의 request를
   * `new Request(url, { headers: Object.fromEntries(req.headers), method, body })`
   * 로 재구성한다 (lib/actions/callback/index.js, TODO: forward original).
   * 스로틀이 이 Request에서 최우측 XFF를 읽는지 고정한다.
   */
  it('스로틀은 @auth/core 재구성 Request의 최우측 XFF로 IP 키를 잡는다', async () => {
    const rightmost = '198.51.100.99';
    const request = requestWithIp(rightmost, `10.0.0.1, ${rightmost}`);
    const ipKey = `login:ip:${rightmost}`;

    for (let i = 0; i < LOGIN_IP_FAIL_LIMIT; i++) {
      expect(recordFailure(ipKey, LOGIN_IP_WINDOW_MS)).toBe(true);
    }
    expect(isLimited(ipKey, LOGIN_IP_FAIL_LIMIT)).toBe(true);

    const deps = depsWith(user);
    const res = await authorizeWithLoginRateLimit(
      user.email,
      password,
      request,
      deps,
    );
    expect(res).toBeNull();
    expect(deps.findByEmail).not.toHaveBeenCalled();
  });
});
