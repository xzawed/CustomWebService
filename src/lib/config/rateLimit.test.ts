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
});
