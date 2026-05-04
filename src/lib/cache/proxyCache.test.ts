import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { proxyCache, buildCacheKey } from './proxyCache';

describe('buildCacheKey', () => {
  it('apiId + proxyPath + 빈 파라미터', () => {
    const key = buildCacheKey('api-1', '/getVilageFcst', new URLSearchParams());
    expect(key).toBe('api-1:/getVilageFcst:');
  });

  it('파라미터는 알파벳 순 정렬', () => {
    const params = new URLSearchParams({ nx: '55', base_date: '20260505', ny: '127' });
    const key = buildCacheKey('api-1', '/getVilageFcst', params);
    expect(key).toBe('api-1:/getVilageFcst:base_date=20260505&nx=55&ny=127');
  });

  it('같은 파라미터 순서 달라도 동일 키', () => {
    const p1 = new URLSearchParams({ a: '1', b: '2' });
    const p2 = new URLSearchParams({ b: '2', a: '1' });
    expect(buildCacheKey('id', '/path', p1)).toBe(buildCacheKey('id', '/path', p2));
  });
});

describe('ProxyCache', () => {
  beforeEach(() => {
    proxyCache.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('set → get: 캐시 히트', () => {
    proxyCache.set('key1', { body: '{"ok":true}', contentType: 'application/json', status: 200 }, 10_000);
    const result = proxyCache.get('key1');
    expect(result).toMatchObject({ body: '{"ok":true}', status: 200 });
  });

  it('없는 키 → null', () => {
    expect(proxyCache.get('missing')).toBeNull();
  });

  it('TTL 만료 후 → null 반환 + 자동 삭제', () => {
    proxyCache.set('key2', { body: 'data', contentType: 'text/plain', status: 200 }, 5_000);
    vi.advanceTimersByTime(5_001);
    expect(proxyCache.get('key2')).toBeNull();
    expect(proxyCache.size).toBe(0);
  });

  it('TTL 이내에는 히트', () => {
    proxyCache.set('key3', { body: 'data', contentType: 'text/plain', status: 200 }, 10_000);
    vi.advanceTimersByTime(9_999);
    expect(proxyCache.get('key3')).not.toBeNull();
  });

  it('delete 후 miss', () => {
    proxyCache.set('key4', { body: 'x', contentType: 'text/plain', status: 200 }, 60_000);
    proxyCache.delete('key4');
    expect(proxyCache.get('key4')).toBeNull();
  });

  it('size 반영', () => {
    proxyCache.set('a', { body: '', contentType: '', status: 200 }, 60_000);
    proxyCache.set('b', { body: '', contentType: '', status: 200 }, 60_000);
    expect(proxyCache.size).toBe(2);
    proxyCache.clear();
    expect(proxyCache.size).toBe(0);
  });
});
