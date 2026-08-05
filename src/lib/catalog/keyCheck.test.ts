import { describe, it, expect, vi } from 'vitest';
import {
  classifyKeyResponse,
  resolvePrefix,
  verifyApiKey,
  verifyApiKeyForActivation,
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

const apiQuery: KeyCheckApi = {
  name: '에어코리아',
  baseUrl: 'https://apis.data.go.kr/x',
  authConfig: { env_var: 'API_KEY_AIR', param_in: 'query', param_name: 'serviceKey' },
  endpoints: [{ path: '/getMsrstn', method: 'GET' }],
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

describe('verifyApiKeyForActivation (연속 검증 게이트)', () => {
  const okFetch: KeyFetch = vi.fn(async () => ({
    status: 200,
    bodyText: '{"ok":true}',
    networkError: false,
  }));

  it('3× VALID → 활성화 가능, successes:3, attempts:3, sleep 2회', async () => {
    const doFetch: KeyFetch = vi.fn(async () => ({
      status: 200,
      bodyText: '{"ok":true}',
      networkError: false,
    }));
    const sleep = vi.fn(async () => undefined);

    const r = await verifyApiKeyForActivation(apiQuery, 'k', doFetch, { sleep });

    expect(r.verdict).toBe('VALID');
    expect(r.successes).toBe(3);
    expect(r.attempts).toBe(3);
    expect(r.samples).toBe(3);
    expect(r.attemptResults.map((a) => a.verdict)).toEqual(['VALID', 'VALID', 'VALID']);
    expect(doFetch).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenNthCalledWith(1, 2000);
    expect(sleep).toHaveBeenNthCalledWith(2, 2000);
  });

  it('VALID 후 ERROR → 활성화 불가, attempts:2, 세 번째 fetch 없음', async () => {
    let n = 0;
    const doFetch: KeyFetch = vi.fn(async () => {
      n += 1;
      if (n === 1) return { status: 200, bodyText: '{"ok":true}', networkError: false };
      return { status: 504, bodyText: 'gateway', networkError: false };
    });
    const sleep = vi.fn(async () => undefined);

    const r = await verifyApiKeyForActivation(apiQuery, 'k', doFetch, { sleep });

    expect(r.verdict).toBe('ERROR');
    expect(r.successes).toBe(1);
    expect(r.attempts).toBe(2);
    expect(r.httpStatus).toBe(504);
    expect(doFetch).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it('첫 시도 INVALID → attempts:1, sleep 전혀 없음', async () => {
    const doFetch: KeyFetch = vi.fn(async () => ({
      status: 401,
      bodyText: 'Unauthorized',
      networkError: false,
    }));
    const sleep = vi.fn(async () => undefined);

    const r = await verifyApiKeyForActivation(apiQuery, 'bad', doFetch, { sleep });

    expect(r.verdict).toBe('INVALID');
    expect(r.successes).toBe(0);
    expect(r.attempts).toBe(1);
    expect(doFetch).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('2번째 시도 RATE_LIMITED → verdict 는 RATE_LIMITED (INVALID 로 덮지 않음)', async () => {
    let n = 0;
    const doFetch: KeyFetch = vi.fn(async () => {
      n += 1;
      if (n === 1) return { status: 200, bodyText: '{"ok":true}', networkError: false };
      return { status: 429, bodyText: 'rate', networkError: false };
    });
    const sleep = vi.fn(async () => undefined);

    const r = await verifyApiKeyForActivation(apiQuery, 'k', doFetch, { sleep });

    expect(r.verdict).toBe('RATE_LIMITED');
    expect(r.verdict).not.toBe('INVALID');
    expect(r.successes).toBe(1);
    expect(r.attempts).toBe(2);
    expect(doFetch).toHaveBeenCalledTimes(2);
  });

  it('MISSING → attempts:0, fetch·sleep 없음', async () => {
    const doFetch = vi.fn();
    const sleep = vi.fn(async () => undefined);

    const r = await verifyApiKeyForActivation(apiQuery, undefined, doFetch, { sleep });

    expect(r.verdict).toBe('MISSING');
    expect(r.attempts).toBe(0);
    expect(r.successes).toBe(0);
    expect(r.attemptResults).toEqual([]);
    expect(doFetch).not.toHaveBeenCalled();
    expect(sleep).not.toHaveBeenCalled();
  });

  it('samples:5 커스텀이 적용된다', async () => {
    const doFetch: KeyFetch = vi.fn(async () => ({
      status: 200,
      bodyText: '{"ok":true}',
      networkError: false,
    }));
    const sleep = vi.fn(async () => undefined);

    const r = await verifyApiKeyForActivation(apiQuery, 'k', doFetch, { samples: 5, sleep });

    expect(r.verdict).toBe('VALID');
    expect(r.samples).toBe(5);
    expect(r.successes).toBe(5);
    expect(r.attempts).toBe(5);
    expect(doFetch).toHaveBeenCalledTimes(5);
    expect(sleep).toHaveBeenCalledTimes(4);
  });

  it('gapMs 가 주입 sleep 에 전달된다', async () => {
    const sleep = vi.fn(async () => undefined);
    await verifyApiKeyForActivation(apiQuery, 'k', okFetch, { gapMs: 750, sleep });
    expect(sleep).toHaveBeenCalledWith(750);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  // samples 0·음수를 그대로 두면 루프가 한 번도 돌지 않는다. 그러면 프로브를 단 한 번도
  // 하지 않은 API가 "전부 VALID"로 떨어져 활성화된다 — 게이트를 통째로 무력화하는 값이다.
  // (구현 초기에 실제로 null 역참조로 죽었다.)
  it.each([0, -1, -99])('samples=%i 여도 최소 1회는 프로브한다 (게이트 무력화 방지)', async (bad) => {
    const doFetch: KeyFetch = vi.fn(async () => ({
      status: 200,
      bodyText: '{"ok":true}',
      networkError: false,
    }));
    const sleep = vi.fn(async () => undefined);

    const r = await verifyApiKeyForActivation(apiQuery, 'k', doFetch, { samples: bad, sleep });

    expect(r.verdict).toBe('VALID');
    expect(r.samples).toBe(1);
    expect(r.attempts).toBe(1);
    expect(doFetch).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('음수 gapMs 는 0으로 죈다', async () => {
    const sleep = vi.fn(async () => undefined);
    await verifyApiKeyForActivation(apiQuery, 'k', okFetch, { gapMs: -500, sleep });
    expect(sleep).toHaveBeenCalledWith(0);
  });

  // 아래 두 케이스는 프로브 이전에 빠지는 경로다 — fetch·sleep 이 한 번도 일어나면 안 된다.
  it('env_var 미정의면 ERROR 로 즉시 빠진다 (fetch 0회)', async () => {
    const doFetch: KeyFetch = vi.fn(async () => ({ status: 200, bodyText: '{}', networkError: false }));
    const sleep = vi.fn(async () => undefined);

    const r = await verifyApiKeyForActivation(
      { ...apiQuery, authConfig: { param_in: 'query', param_name: 'k' } },
      'k',
      doFetch,
      { sleep },
    );

    expect(r.verdict).toBe('ERROR');
    expect(r.detail).toContain('env_var');
    expect(r.attempts).toBe(0);
    expect(doFetch).not.toHaveBeenCalled();
    expect(sleep).not.toHaveBeenCalled();
  });

  it('GET 엔드포인트가 없으면 NO_ENDPOINT 로 즉시 빠진다 (fetch 0회)', async () => {
    const doFetch: KeyFetch = vi.fn(async () => ({ status: 200, bodyText: '{}', networkError: false }));
    const sleep = vi.fn(async () => undefined);

    const r = await verifyApiKeyForActivation(
      { ...apiQuery, endpoints: [{ path: '/x', method: 'POST' }] },
      'k',
      doFetch,
      { sleep },
    );

    expect(r.verdict).toBe('NO_ENDPOINT');
    expect(r.attempts).toBe(0);
    expect(doFetch).not.toHaveBeenCalled();
    expect(sleep).not.toHaveBeenCalled();
  });
});
