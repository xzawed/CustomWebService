import { describe, it, expect } from 'vitest';
import {
  verifyOneApi,
  runCatalogVerification,
  type VerifyApi,
  type HealthFetch,
} from './verifyRunner';

const baseApi = (over: Partial<VerifyApi> = {}): VerifyApi => ({
  id: 'id-1',
  name: 'API One',
  baseUrl: 'https://api.example.com',
  authType: 'none',
  verificationStatus: 'unverified',
  endpoints: [{ path: '/data', method: 'GET' }],
  ...over,
});

const fetchWith =
  (status: number, bodyText = '', extra: Partial<Awaited<ReturnType<HealthFetch>>> = {}): HealthFetch =>
  async () => ({
    status,
    bodyText,
    contentType: 'application/json',
    elapsedMs: 100,
    networkError: false,
    ...extra,
  });

describe('verifyOneApi', () => {
  it('GET 엔드포인트가 없으면 unknown/보존(null)', async () => {
    const api = baseApi({ endpoints: [{ path: '/x', method: 'POST' }] });
    const r = await verifyOneApi(api, fetchWith(200, '{}'));
    expect(r.health).toBe('unknown');
    expect(r.next).toBeNull();
  });

  it('endpoints가 null이면 unknown/보존(null)', async () => {
    const r = await verifyOneApi(baseApi({ endpoints: null }), fetchWith(200, '{}'));
    expect(r.health).toBe('unknown');
    expect(r.next).toBeNull();
  });

  it('200 정상 JSON → working/verified', async () => {
    const r = await verifyOneApi(baseApi(), fetchWith(200, '{"ok":true}'));
    expect(r.health).toBe('working');
    expect(r.next).toBe('verified');
  });

  it('method 미지정 엔드포인트는 GET으로 간주한다', async () => {
    const api = baseApi({ endpoints: [{ path: '/data' }] }); // method 없음
    const r = await verifyOneApi(api, fetchWith(200, '{"ok":true}'));
    expect(r.health).toBe('working');
    expect(r.next).toBe('verified');
  });

  it('5xx → broken/broken', async () => {
    const r = await verifyOneApi(baseApi(), fetchWith(503, 'service unavailable'));
    expect(r.health).toBe('broken');
    expect(r.next).toBe('broken');
  });

  it('키 의존 API의 401 → key_gated/보존(null)', async () => {
    const api = baseApi({ authType: 'api_key' });
    const r = await verifyOneApi(api, fetchWith(401, 'unauthorized'));
    expect(r.health).toBe('key_gated');
    expect(r.next).toBeNull();
  });

  it('키리스 API의 401 → broken', async () => {
    const r = await verifyOneApi(baseApi({ authType: 'none' }), fetchWith(401, 'no'));
    expect(r.health).toBe('broken');
    expect(r.next).toBe('broken');
  });

  it('네트워크 실패 → broken', async () => {
    const r = await verifyOneApi(baseApi(), fetchWith(0, '', { networkError: true }));
    expect(r.health).toBe('broken');
    expect(r.next).toBe('broken');
  });

  it('여러 GET 엔드포인트 중 하나라도 broken이면 broken으로 집계', async () => {
    const api = baseApi({
      endpoints: [
        { path: '/ok', method: 'GET' },
        { path: '/bad', method: 'GET' },
      ],
    });
    const doFetch: HealthFetch = async (url) => ({
      status: url.includes('/bad') ? 500 : 200,
      bodyText: url.includes('/bad') ? 'err' : '{"ok":true}',
      contentType: 'application/json',
      elapsedMs: 50,
      networkError: false,
    });
    const r = await verifyOneApi(api, doFetch);
    expect(r.health).toBe('broken');
    expect(r.next).toBe('broken');
  });
});

describe('runCatalogVerification', () => {
  it('상태가 바뀐 API만 업데이트하고 집계를 반환한다', async () => {
    const apis = [
      baseApi({ id: 'a', verificationStatus: 'unverified' }), // → verified (변경)
      baseApi({ id: 'b', verificationStatus: 'verified' }), // → verified (불변)
    ];
    const updates: Array<[string, string]> = [];

    const result = await runCatalogVerification(
      apis,
      fetchWith(200, '{"ok":true}'),
      async (id, status) => {
        updates.push([id, status]);
      }
    );

    expect(updates).toEqual([['a', 'verified']]);
    expect(result.checked).toBe(2);
    expect(result.updated).toBe(1);
    expect(result.unchanged).toBe(1);
    expect(result.skipped).toBe(0);
  });

  it('자동 판정 불가(next=null)는 업데이트하지 않고 skipped로 집계', async () => {
    const apis = [baseApi({ id: 'k', authType: 'api_key', verificationStatus: 'verified' })];
    const updates: Array<[string, string]> = [];

    const result = await runCatalogVerification(apis, fetchWith(403, 'forbidden'), async (id, s) => {
      updates.push([id, s]);
    });

    expect(updates).toEqual([]);
    expect(result.skipped).toBe(1);
    expect(result.updated).toBe(0);
    expect(result.results[0].next).toBeNull();
    expect(result.results[0].previous).toBe('verified');
  });

  it('broken으로 떨어진 API를 verified→broken으로 업데이트', async () => {
    const apis = [baseApi({ id: 'c', verificationStatus: 'verified' })];
    const updates: Array<[string, string]> = [];

    const result = await runCatalogVerification(apis, fetchWith(500, 'err'), async (id, s) => {
      updates.push([id, s]);
    });

    expect(updates).toEqual([['c', 'broken']]);
    expect(result.updated).toBe(1);
  });

  it('동시성 제한 하에서도 모든 API를 검사하고 결과 순서를 보존한다', async () => {
    const apis = Array.from({ length: 10 }, (_, i) =>
      baseApi({ id: `id-${i}`, verificationStatus: 'unverified' })
    );
    const result = await runCatalogVerification(apis, fetchWith(200, '{"ok":true}'), async () => {}, {
      concurrency: 3,
    });

    expect(result.checked).toBe(10);
    expect(result.updated).toBe(10);
    expect(result.results.map((r) => r.id)).toEqual(apis.map((a) => a.id));
  });
});
