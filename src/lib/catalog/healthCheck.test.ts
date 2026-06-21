import { describe, it, expect } from 'vitest';
import {
  classifyResponse,
  summarizeApi,
  buildTestUrl,
  toVerificationStatus,
  SLOW_THRESHOLD_MS,
  type HealthStatus,
} from './healthCheck';

const base = {
  authType: 'none' as const,
  httpStatus: 200,
  contentType: 'application/json',
  bodyText: '{"results":[1,2,3]}',
  elapsedMs: 120,
};

describe('classifyResponse', () => {
  it('treats a valid 2xx JSON body as working', () => {
    expect(classifyResponse(base).status).toBe('working');
  });

  it('treats a 2xx non-JSON (image) response as working', () => {
    expect(
      classifyResponse({ ...base, contentType: 'image/png', bodyText: '' }).status,
    ).toBe('working');
  });

  it('degrades a working response that is slow', () => {
    expect(
      classifyResponse({ ...base, elapsedMs: SLOW_THRESHOLD_MS + 1 }).status,
    ).toBe('degraded');
  });

  it('flags a 2xx body with success:false as broken (deprecation masking)', () => {
    expect(
      classifyResponse({
        ...base,
        bodyText:
          '{"success":false,"data":null,"errors":[{"message":"This API version has been deprecated"}]}',
      }).status,
    ).toBe('broken');
  });

  it('flags a 2xx body with a non-empty errors array as broken', () => {
    expect(
      classifyResponse({ ...base, bodyText: '{"errors":[{"message":"bad"}]}' }).status,
    ).toBe('broken');
  });

  it('flags a 2xx body whose text contains a deprecation notice as broken', () => {
    expect(
      classifyResponse({
        ...base,
        contentType: 'text/plain',
        bodyText: 'This API version has been deprecated. Migrate to v5.',
      }).status,
    ).toBe('broken');
  });

  it('does NOT flag error:false (JokeAPI shape) as broken', () => {
    expect(
      classifyResponse({ ...base, bodyText: '{"error":false,"joke":"x"}' }).status,
    ).toBe('working');
  });

  it('does NOT flag result:"success" (ExchangeRate shape) as broken', () => {
    expect(
      classifyResponse({ ...base, bodyText: '{"result":"success","rates":{}}' }).status,
    ).toBe('working');
  });

  it('does NOT flag status:"success" (Dog API shape) as broken', () => {
    expect(
      classifyResponse({ ...base, bodyText: '{"status":"success","message":"url"}' }).status,
    ).toBe('working');
  });

  it('treats a raw JSON array (Hacker News shape) as working', () => {
    expect(classifyResponse({ ...base, bodyText: '[1,2,3]' }).status).toBe('working');
  });

  it('classifies 401 for a keyed API as key_gated (host alive)', () => {
    expect(
      classifyResponse({ ...base, authType: 'api_key', httpStatus: 401, bodyText: 'Unauthorized' }).status,
    ).toBe('key_gated');
  });

  it('classifies 403 for a keyed API as key_gated', () => {
    expect(
      classifyResponse({ ...base, authType: 'api_key', httpStatus: 403, bodyText: '' }).status,
    ).toBe('key_gated');
  });

  it('classifies 401 for a keyless API as broken (unexpected)', () => {
    expect(
      classifyResponse({ ...base, authType: 'none', httpStatus: 401, bodyText: '' }).status,
    ).toBe('broken');
  });

  it('classifies 429 as degraded (rate limited but alive)', () => {
    expect(classifyResponse({ ...base, httpStatus: 429, bodyText: '' }).status).toBe('degraded');
  });

  it('classifies 5xx as broken', () => {
    expect(classifyResponse({ ...base, httpStatus: 503, bodyText: '' }).status).toBe('broken');
  });

  it('classifies a network error as broken', () => {
    expect(
      classifyResponse({ ...base, httpStatus: 0, networkError: true, bodyText: '' }).status,
    ).toBe('broken');
  });

  it('classifies an unexpected 4xx (likely test-param mismatch) as unknown, not broken', () => {
    expect(classifyResponse({ ...base, httpStatus: 404, bodyText: 'Not Found' }).status).toBe('unknown');
  });
});

describe('summarizeApi', () => {
  const cases: Array<[HealthStatus[], HealthStatus]> = [
    [['working', 'working'], 'working'],
    [['working', 'broken'], 'broken'],
    [['key_gated', 'key_gated'], 'key_gated'],
    [['working', 'degraded'], 'degraded'],
    [['key_gated', 'working'], 'working'],
    [['working', 'unknown'], 'working'],
    [[], 'unknown'],
  ];
  it.each(cases)('summarizes %j as %s', (input, expected) => {
    expect(summarizeApi(input)).toBe(expected);
  });
});

describe('toVerificationStatus', () => {
  it('maps working/degraded to verified', () => {
    expect(toVerificationStatus('working')).toBe('verified');
    expect(toVerificationStatus('degraded')).toBe('verified');
  });
  it('maps broken to broken', () => {
    expect(toVerificationStatus('broken')).toBe('broken');
  });
  it('returns null for key_gated/unknown (do not clobber DB)', () => {
    expect(toVerificationStatus('key_gated')).toBeNull();
    expect(toVerificationStatus('unknown')).toBeNull();
  });
});

describe('buildTestUrl', () => {
  it('substitutes a single path placeholder', () => {
    expect(buildTestUrl('https://restcountries.com', { path: '/v3.1/name/{name}' })).toBe(
      'https://restcountries.com/v3.1/name/korea',
    );
  });

  it('substitutes multiple path placeholders (width/height)', () => {
    expect(buildTestUrl('https://picsum.photos', { path: '/{width}/{height}' })).toBe(
      'https://picsum.photos/200/300',
    );
  });

  it('preserves a base URL that already contains a path prefix', () => {
    expect(
      buildTestUrl('https://www.themealdb.com/api/json/v1/1', { path: '/random.php' }),
    ).toBe('https://www.themealdb.com/api/json/v1/1/random.php');
  });

  it('adds object-map query params with sensible samples', () => {
    const url = buildTestUrl('https://opentdb.com', {
      path: '/api.php',
      parameters: { amount: 'number' },
    });
    expect(url).toContain('amount=1');
  });

  it('skips auth params (api_key) when building the query', () => {
    const url = buildTestUrl('https://api.nasa.gov', {
      path: '/planetary/apod',
      parameters: { date: 'string', api_key: 'string' },
    });
    expect(url).not.toContain('api_key=');
  });

  it('merges params from a plain example_call query string', () => {
    const url = buildTestUrl('https://api.open-meteo.com', {
      path: '/v1/forecast',
      exampleCall: '/v1/forecast?latitude=37.5665&longitude=126.9780&current_weather=true',
    });
    expect(url).toContain('latitude=37.5665');
    expect(url).toContain('longitude=126.9780');
  });
});
