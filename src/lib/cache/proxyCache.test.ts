import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { proxyCache, buildCacheKey, keyFingerprint, NO_KEY_IDENTITY } from './proxyCache';

describe('buildCacheKey', () => {
  it('apiId + proxyPath + 빈 파라미터 + 키 신원', () => {
    const key = buildCacheKey('api-1', '/getVilageFcst', new URLSearchParams(), NO_KEY_IDENTITY);
    expect(key).toBe('api-1:/getVilageFcst::none');
  });

  it('파라미터는 알파벳 순 정렬', () => {
    const params = new URLSearchParams({ nx: '55', base_date: '20260505', ny: '127' });
    const key = buildCacheKey('api-1', '/getVilageFcst', params, NO_KEY_IDENTITY);
    expect(key).toBe('api-1:/getVilageFcst:base_date=20260505&nx=55&ny=127:none');
  });

  it('같은 파라미터 순서 달라도 동일 키', () => {
    const p1 = new URLSearchParams({ a: '1', b: '2' });
    const p2 = new URLSearchParams({ b: '2', a: '1' });
    expect(buildCacheKey('id', '/path', p1, NO_KEY_IDENTITY)).toBe(
      buildCacheKey('id', '/path', p2, NO_KEY_IDENTITY),
    );
  });

  it('키 신원이 다르면 캐시 키가 다르다 — 테넌트 간 응답 공유 차단', () => {
    const params = new URLSearchParams({ q: '1' });
    const a = buildCacheKey('id', '/path', params, keyFingerprint('owner-A-key'));
    const b = buildCacheKey('id', '/path', params, keyFingerprint('owner-B-key'));
    expect(a).not.toBe(b);
  });

  it('같은 키를 쓰면 캐시 키가 같다 — 캐시 이득이 유지된다', () => {
    const params = new URLSearchParams({ q: '1' });
    const a = buildCacheKey('id', '/path', params, keyFingerprint('same-key'));
    const b = buildCacheKey('id', '/path', params, keyFingerprint('same-key'));
    expect(a).toBe(b);
  });

  it('키 없는 요청과 키 있는 요청은 캐시를 공유하지 않는다', () => {
    const params = new URLSearchParams();
    expect(buildCacheKey('id', '/path', params, NO_KEY_IDENTITY)).not.toBe(
      buildCacheKey('id', '/path', params, keyFingerprint('some-key')),
    );
  });
});

describe('keyFingerprint', () => {
  it('같은 키는 같은 지문, 다른 키는 다른 지문', () => {
    expect(keyFingerprint('k1')).toBe(keyFingerprint('k1'));
    expect(keyFingerprint('k1')).not.toBe(keyFingerprint('k2'));
  });

  it('지문에 키 원문이 남지 않는다 — 캐시 키는 로그·디버깅에서 보일 수 있다', () => {
    const secret = 'sk-live-super-secret-value';
    expect(keyFingerprint(secret)).not.toContain(secret);
    expect(keyFingerprint(secret)).not.toContain('secret');
  });

  it('길이가 고정된 16자 hex라 키 길이를 유추할 수 없다', () => {
    expect(keyFingerprint('a')).toMatch(/^[0-9a-f]{16}$/);
    expect(keyFingerprint('a'.repeat(500))).toMatch(/^[0-9a-f]{16}$/);
  });

  it('키가 없음을 뜻하는 상수와 절대 충돌하지 않는다', () => {
    // 'none'은 16자 hex가 아니므로 어떤 지문과도 같아질 수 없다.
    expect(NO_KEY_IDENTITY).toBe('none');
    expect(keyFingerprint('none')).not.toBe(NO_KEY_IDENTITY);
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
