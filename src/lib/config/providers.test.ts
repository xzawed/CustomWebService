import { describe, it, expect, afterEach } from 'vitest';
import { getDbProvider, getAuthProvider, _resetProviderCache } from '@/lib/config/providers';

afterEach(() => {
  delete process.env.AUTH_SECRET;
  _resetProviderCache();
});

describe('getDbProvider()', () => {
  it('항상 sqlite를 반환한다 (임베디드 단일 스택)', () => {
    expect(getDbProvider()).toBe('sqlite');
  });
});

describe('getAuthProvider()', () => {
  it('AUTH_SECRET이 설정되면 local을 반환한다', () => {
    process.env.AUTH_SECRET = 'super-secret';
    expect(getAuthProvider()).toBe('local');
  });

  it('AUTH_SECRET이 없으면 에러를 던진다', () => {
    delete process.env.AUTH_SECRET;
    expect(() => getAuthProvider()).toThrow('AUTH_SECRET');
  });
});
