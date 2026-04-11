import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getDbProvider, getAuthProvider, _resetProviderCache } from '@/lib/config/providers';

// 각 테스트 후 환경변수 원상 복구
function withEnv(vars: Record<string, string | undefined>, fn: () => void): void {
  const original: Record<string, string | undefined> = {};
  for (const key of Object.keys(vars)) {
    original[key] = process.env[key];
    if (vars[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = vars[key];
    }
  }
  try {
    fn();
  } finally {
    for (const key of Object.keys(original)) {
      if (original[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = original[key];
      }
    }
  }
}

beforeEach(() => {
  _resetProviderCache();
});

afterEach(() => {
  delete process.env.DB_PROVIDER;
  delete process.env.DATABASE_URL;
  delete process.env.AUTH_PROVIDER;
  delete process.env.AUTH_SECRET;
  _resetProviderCache();
});

describe('getDbProvider()', () => {
  it('DB_PROVIDER 미설정 시 supabase를 반환한다', () => {
    withEnv({ DB_PROVIDER: undefined }, () => {
      expect(getDbProvider()).toBe('supabase');
    });
  });

  it('DB_PROVIDER=supabase 이면 supabase를 반환한다', () => {
    withEnv({ DB_PROVIDER: 'supabase' }, () => {
      expect(getDbProvider()).toBe('supabase');
    });
  });

  it('DB_PROVIDER=postgres 이고 DATABASE_URL이 설정된 경우 postgres를 반환한다', () => {
    withEnv({ DB_PROVIDER: 'postgres', DATABASE_URL: 'postgresql://localhost/test' }, () => {
      expect(getDbProvider()).toBe('postgres');
    });
  });

  it('DB_PROVIDER=postgres 이지만 DATABASE_URL이 없으면 에러를 던진다', () => {
    withEnv({ DB_PROVIDER: 'postgres', DATABASE_URL: undefined }, () => {
      expect(() => getDbProvider()).toThrow(
        'DB_PROVIDER=postgres 설정 시 DATABASE_URL 환경변수가 필요합니다.'
      );
    });
  });

  it('알 수 없는 DB_PROVIDER 값이면 에러를 던진다', () => {
    withEnv({ DB_PROVIDER: 'mysql' }, () => {
      expect(() => getDbProvider()).toThrow(
        '알 수 없는 DB_PROVIDER 값: "mysql". "supabase" 또는 "postgres"를 사용하세요.'
      );
    });
  });
});

describe('getAuthProvider()', () => {
  it('AUTH_PROVIDER 미설정 시 supabase를 반환한다', () => {
    withEnv({ AUTH_PROVIDER: undefined }, () => {
      expect(getAuthProvider()).toBe('supabase');
    });
  });

  it('AUTH_PROVIDER=supabase 이면 supabase를 반환한다', () => {
    withEnv({ AUTH_PROVIDER: 'supabase' }, () => {
      expect(getAuthProvider()).toBe('supabase');
    });
  });

  it('AUTH_PROVIDER=authjs 이고 AUTH_SECRET이 설정된 경우 authjs를 반환한다', () => {
    withEnv({ AUTH_PROVIDER: 'authjs', AUTH_SECRET: 'super-secret' }, () => {
      expect(getAuthProvider()).toBe('authjs');
    });
  });

  it('AUTH_PROVIDER=authjs 이지만 AUTH_SECRET이 없으면 에러를 던진다', () => {
    withEnv({ AUTH_PROVIDER: 'authjs', AUTH_SECRET: undefined }, () => {
      expect(() => getAuthProvider()).toThrow(
        'AUTH_PROVIDER=authjs 설정 시 AUTH_SECRET 환경변수가 필요합니다.'
      );
    });
  });

  it('알 수 없는 AUTH_PROVIDER 값이면 에러를 던진다', () => {
    withEnv({ AUTH_PROVIDER: 'firebase' }, () => {
      expect(() => getAuthProvider()).toThrow(
        '알 수 없는 AUTH_PROVIDER 값: "firebase". "supabase" 또는 "authjs"를 사용하세요.'
      );
    });
  });
});
