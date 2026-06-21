import { describe, it, expect, vi } from 'vitest';
import {
  classifyKeyResponse,
  resolvePrefix,
  verifyApiKey,
  type KeyCheckApi,
  type KeyFetch,
} from './keyCheck';

describe('classifyKeyResponse', () => {
  it('VALID for 2xx with non-error body', () => {
    expect(classifyKeyResponse(200, '{"documents":[]}', false).verdict).toBe('VALID');
  });
  it('INVALID for 401/403', () => {
    expect(classifyKeyResponse(401, 'Unauthorized', false).verdict).toBe('INVALID');
    expect(classifyKeyResponse(403, '', false).verdict).toBe('INVALID');
  });
  it('RATE_LIMITED for 429', () => {
    expect(classifyKeyResponse(429, '', false).verdict).toBe('RATE_LIMITED');
  });
  it('INVALID for 2xx whose body is an error', () => {
    expect(classifyKeyResponse(200, '{"success":false,"errors":[{"m":"x"}]}', false).verdict).toBe('INVALID');
  });
  it('ERROR for network failure', () => {
    expect(classifyKeyResponse(0, '', true).verdict).toBe('ERROR');
  });
  it('ERROR for unexpected status', () => {
    expect(classifyKeyResponse(404, 'nope', false).verdict).toBe('ERROR');
  });
});

describe('resolvePrefix', () => {
  it('reads prefix or header_prefix', () => {
    expect(resolvePrefix({ prefix: 'Client-ID ' })).toBe('Client-ID ');
    expect(resolvePrefix({ header_prefix: 'KakaoAK ' })).toBe('KakaoAK ');
    expect(resolvePrefix({})).toBe('');
    expect(resolvePrefix(null)).toBe('');
  });
});

const apiHeader: KeyCheckApi = {
  name: 'Kakao',
  baseUrl: 'https://dapi.kakao.com',
  authConfig: { env_var: 'API_KEY_F1EC6F97', param_in: 'header', param_name: 'Authorization', header_prefix: 'KakaoAK ' },
  endpoints: [{ path: '/v2/local/search/keyword.json', method: 'GET', parameters: { query: 'string' } }],
};

describe('verifyApiKey', () => {
  it('returns MISSING when key is undefined', async () => {
    const r = await verifyApiKey(apiHeader, undefined, vi.fn());
    expect(r.verdict).toBe('MISSING');
  });

  it('returns VALID when raw key injection succeeds (value embeds prefix)', async () => {
    const doFetch: KeyFetch = vi.fn(async () => ({ status: 200, bodyText: '{"documents":[]}', networkError: false }));
    const r = await verifyApiKey(apiHeader, 'KakaoAK realkey', doFetch);
    expect(r.verdict).toBe('VALID');
    expect(doFetch).toHaveBeenCalledTimes(1); // no retry needed
  });

  it('detects proxy prefix bug: raw INVALID but prefix-applied VALID', async () => {
    const calls: string[] = [];
    const doFetch: KeyFetch = vi.fn(async (_url, headers) => {
      calls.push(headers['Authorization']);
      // raw "rawkey" -> 401; "KakaoAK rawkey" -> 200
      return headers['Authorization'] === 'KakaoAK rawkey'
        ? { status: 200, bodyText: '{"documents":[]}', networkError: false }
        : { status: 401, bodyText: 'Unauthorized', networkError: false };
    });
    const r = await verifyApiKey(apiHeader, 'rawkey', doFetch);
    expect(r.verdict).toBe('VALID');
    expect(r.needsPrefixFix).toBe(true);
    expect(calls).toEqual(['rawkey', 'KakaoAK rawkey']);
  });

  it('returns INVALID when both raw and prefixed fail', async () => {
    const doFetch: KeyFetch = vi.fn(async () => ({ status: 401, bodyText: 'Unauthorized', networkError: false }));
    const r = await verifyApiKey(apiHeader, 'badkey', doFetch);
    expect(r.verdict).toBe('INVALID');
  });

  it('injects query-param keys (no prefix retry for query auth)', async () => {
    const queryApi: KeyCheckApi = {
      name: '공휴일',
      baseUrl: 'https://apis.data.go.kr/x',
      authConfig: { env_var: 'API_KEY_15B51435', param_in: 'query', param_name: 'serviceKey' },
      endpoints: [{ path: '/getRestDeInfo', method: 'GET' }],
    };
    let seenUrl = '';
    const doFetch: KeyFetch = vi.fn(async (url) => {
      seenUrl = url;
      return { status: 200, bodyText: '{"response":{}}', networkError: false };
    });
    const r = await verifyApiKey(queryApi, 'mykey', doFetch);
    expect(r.verdict).toBe('VALID');
    expect(seenUrl).toContain('serviceKey=mykey');
  });
});
