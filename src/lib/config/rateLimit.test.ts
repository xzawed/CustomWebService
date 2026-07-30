import { describe, it, expect, vi, afterEach } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('rateLimit envInt()', () => {
  it('env var 미설정 시 기본값을 반환한다', async () => {
    const mod = await import('./rateLimit');
    expect(mod.RATE_LIMIT_PER_MIN).toBe(60);
    expect(mod.MAX_CONCURRENT_RATE_LIMIT_USERS).toBe(1000);
    expect(mod.RATE_LIMIT_WINDOW_MS).toBe(60_000);
  });

  it('유효한 양의 정수이면 파싱된 값을 반환한다', async () => {
    vi.stubEnv('RATE_LIMIT_PER_MIN', '120');
    vi.stubEnv('MAX_CONCURRENT_RATE_LIMIT_USERS', '500');
    vi.resetModules();
    const mod = await import('./rateLimit');
    expect(mod.RATE_LIMIT_PER_MIN).toBe(120);
    expect(mod.MAX_CONCURRENT_RATE_LIMIT_USERS).toBe(500);
  });

  it('숫자가 아닌 값이면 기본값을 반환한다', async () => {
    vi.stubEnv('RATE_LIMIT_PER_MIN', 'abc');
    vi.resetModules();
    const mod = await import('./rateLimit');
    expect(mod.RATE_LIMIT_PER_MIN).toBe(60);
  });

  it('0이면 기본값을 반환한다', async () => {
    vi.stubEnv('RATE_LIMIT_PER_MIN', '0');
    vi.resetModules();
    const mod = await import('./rateLimit');
    expect(mod.RATE_LIMIT_PER_MIN).toBe(60);
  });

  it('음수이면 기본값을 반환한다', async () => {
    vi.stubEnv('MAX_CONCURRENT_RATE_LIMIT_USERS', '-10');
    vi.resetModules();
    const mod = await import('./rateLimit');
    expect(mod.MAX_CONCURRENT_RATE_LIMIT_USERS).toBe(1000);
  });

  describe('로그인 스로틀 상수 (#223)', () => {
    it('기본값 — IP 10회/15분, 계정 5회/5분, auth 버킷 상한 10000', async () => {
      vi.resetModules();
      const mod = await import('./rateLimit');
      expect(mod.LOGIN_IP_FAIL_LIMIT).toBe(10);
      expect(mod.LOGIN_IP_WINDOW_MS).toBe(15 * 60_000);
      expect(mod.LOGIN_ACCOUNT_FAIL_LIMIT).toBe(5);
      expect(mod.LOGIN_ACCOUNT_WINDOW_MS).toBe(5 * 60_000);
      expect(mod.MAX_AUTH_RATE_LIMIT_BUCKETS).toBe(10_000);
    });

    it('env로 재정의할 수 있다', async () => {
      vi.stubEnv('LOGIN_IP_FAIL_LIMIT', '3');
      vi.stubEnv('LOGIN_ACCOUNT_WINDOW_MS', '120000');
      vi.stubEnv('MAX_AUTH_RATE_LIMIT_BUCKETS', '250');
      vi.resetModules();
      const mod = await import('./rateLimit');
      expect(mod.LOGIN_IP_FAIL_LIMIT).toBe(3);
      expect(mod.LOGIN_ACCOUNT_WINDOW_MS).toBe(120_000);
      expect(mod.MAX_AUTH_RATE_LIMIT_BUCKETS).toBe(250);
    });

    // 잘못된 값이 0/NaN으로 흘러가면 한도가 0이 되어 모든 로그인이 막힌다.
    it('잘못된 값은 기본값으로 폴백한다 — 0이 되면 전 사용자가 잠긴다', async () => {
      vi.stubEnv('LOGIN_ACCOUNT_FAIL_LIMIT', '0');
      vi.stubEnv('LOGIN_IP_WINDOW_MS', 'abc');
      vi.resetModules();
      const mod = await import('./rateLimit');
      expect(mod.LOGIN_ACCOUNT_FAIL_LIMIT).toBe(5);
      expect(mod.LOGIN_IP_WINDOW_MS).toBe(15 * 60_000);
    });
  });
});
