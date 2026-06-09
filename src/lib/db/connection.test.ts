import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// pg.Pool / drizzle을 mock하여 실제 DB 연결 없이 getDb()의 풀 설정 분기를 검증한다.
vi.mock('pg', () => ({ Pool: vi.fn() }));
vi.mock('drizzle-orm/node-postgres', () => ({ drizzle: vi.fn(() => ({ __mockDb: true })) }));
vi.mock('@/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe('getDb()', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('DB_PROVIDER가 postgres가 아니면 throw한다', async () => {
    vi.stubEnv('DB_PROVIDER', 'supabase');
    const { getDb } = await import('./connection');
    expect(() => getDb()).toThrow();
  });

  it('DATABASE_URL 미설정 시 throw한다', async () => {
    vi.stubEnv('DB_PROVIDER', 'postgres');
    vi.stubEnv('DATABASE_URL', '');
    const { getDb } = await import('./connection');
    expect(() => getDb()).toThrow();
  });

  it('기본 풀 설정으로 Pool을 생성한다', async () => {
    vi.stubEnv('DB_PROVIDER', 'postgres');
    vi.stubEnv('DATABASE_URL', 'postgres://u:p@h:5432/db');
    const { getDb } = await import('./connection');
    getDb();

    const { Pool } = await import('pg');
    expect(vi.mocked(Pool)).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionString: 'postgres://u:p@h:5432/db',
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
      }),
    );
  });

  it('env로 풀 설정(max·idle·connection 타임아웃)을 오버라이드한다', async () => {
    vi.stubEnv('DB_PROVIDER', 'postgres');
    vi.stubEnv('DATABASE_URL', 'postgres://u:p@h:5432/db');
    vi.stubEnv('DB_POOL_MAX', '20');
    vi.stubEnv('DB_IDLE_TIMEOUT_MS', '60000');
    vi.stubEnv('DB_CONNECTION_TIMEOUT_MS', '8000');
    const { getDb } = await import('./connection');
    getDb();

    const { Pool } = await import('pg');
    expect(vi.mocked(Pool)).toHaveBeenCalledWith(
      expect.objectContaining({
        max: 20,
        idleTimeoutMillis: 60000,
        connectionTimeoutMillis: 8000,
      }),
    );
  });

  it('두 번째 호출은 캐시된 인스턴스를 반환한다 (Pool 1회만 생성)', async () => {
    vi.stubEnv('DB_PROVIDER', 'postgres');
    vi.stubEnv('DATABASE_URL', 'postgres://u:p@h:5432/db');
    const { getDb } = await import('./connection');
    const a = getDb();
    const b = getDb();

    expect(a).toBe(b);
    const { Pool } = await import('pg');
    expect(vi.mocked(Pool)).toHaveBeenCalledTimes(1);
  });
});
