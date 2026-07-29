import { describe, it, expect, vi, afterEach } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('generation lock 설정', () => {
  it('env var 미설정 시 기본값을 반환한다', async () => {
    const mod = await import('./generation');
    expect(mod.GENERATION_LOCK_HEARTBEAT_MS).toBe(30_000);
    expect(mod.GENERATION_LOCK_STALE_MS).toBe(300_000);
  });

  it('유효한 양의 정수이면 파싱된 값을 반환한다', async () => {
    vi.stubEnv('GENERATION_LOCK_HEARTBEAT_MS', '10000');
    vi.stubEnv('GENERATION_LOCK_STALE_MS', '60000');
    vi.resetModules();
    const mod = await import('./generation');
    expect(mod.GENERATION_LOCK_HEARTBEAT_MS).toBe(10_000);
    expect(mod.GENERATION_LOCK_STALE_MS).toBe(60_000);
  });

  it('숫자가 아니거나 0·음수이면 기본값을 반환한다 — 0은 락을 즉시 만료시켜 중복 파이프라인을 다시 연다', async () => {
    vi.stubEnv('GENERATION_LOCK_STALE_MS', '0');
    vi.stubEnv('GENERATION_LOCK_HEARTBEAT_MS', 'abc');
    vi.resetModules();
    const mod = await import('./generation');
    expect(mod.GENERATION_LOCK_STALE_MS).toBe(300_000);
    expect(mod.GENERATION_LOCK_HEARTBEAT_MS).toBe(30_000);
  });

  it('stale은 heartbeat보다 반드시 커야 한다 — 아니면 살아 있는 파이프라인이 스스로 만료된다', async () => {
    vi.stubEnv('GENERATION_LOCK_HEARTBEAT_MS', '90000');
    vi.stubEnv('GENERATION_LOCK_STALE_MS', '60000');
    vi.resetModules();
    const mod = await import('./generation');
    expect(mod.GENERATION_LOCK_STALE_MS).toBeGreaterThan(mod.GENERATION_LOCK_HEARTBEAT_MS);
  });
});
