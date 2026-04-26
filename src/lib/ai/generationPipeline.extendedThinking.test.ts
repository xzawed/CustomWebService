import { describe, it, expect } from 'vitest';
import { evaluateComplexityScore } from './generationPipeline';
import type { ApiCatalogItem, ApiEndpoint } from '@/types/api';

let _apiSeq = 0;
function makeApi(overrides: Partial<ApiCatalogItem> = {}): ApiCatalogItem {
  const seq = ++_apiSeq;
  return {
    id: `test-id-${seq}`,
    name: 'Test API',
    description: 'A test API',
    category: `cat-${seq}`, // unique by default — prevents accidental dependency score
    baseUrl: 'https://api.example.com',
    authType: 'none',
    authConfig: {},
    rateLimit: null,
    isActive: true,
    iconUrl: null,
    docsUrl: null,
    endpoints: [],
    tags: [],
    apiVersion: null,
    deprecatedAt: null,
    successorId: null,
    corsSupported: true,
    requiresProxy: false,
    creditRequired: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeEndpoint(method: ApiEndpoint['method'] = 'GET'): ApiEndpoint {
  return {
    path: '/test',
    method,
    description: 'Test endpoint',
    params: [],
    responseExample: {},
  };
}

describe('evaluateComplexityScore()', () => {
  describe('API count signal', () => {
    it('1개 API → 추가 점수 없음 (0점)', () => {
      expect(evaluateComplexityScore([makeApi()])).toBe(0);
    });

    it('2개 API → 0점 (기준선)', () => {
      expect(evaluateComplexityScore([makeApi(), makeApi()])).toBe(0);
    });

    it('3개 API → +5점', () => {
      const apis = [makeApi(), makeApi(), makeApi()];
      expect(evaluateComplexityScore(apis)).toBe(5);
    });

    it('6개 API → 최대 20점', () => {
      const apis = Array.from({ length: 6 }, () => makeApi());
      expect(evaluateComplexityScore(apis)).toBe(20);
    });

    it('10개 API → 상한 20점', () => {
      const apis = Array.from({ length: 10 }, () => makeApi());
      expect(evaluateComplexityScore(apis)).toBe(20);
    });
  });

  describe('Auth complexity signal', () => {
    it('authType=none → +0점', () => {
      expect(evaluateComplexityScore([makeApi({ authType: 'none' })])).toBe(0);
    });

    it('authType=api_key → +8점', () => {
      expect(evaluateComplexityScore([makeApi({ authType: 'api_key' })])).toBe(8);
    });

    it('authType=oauth → +15점 (최고)', () => {
      expect(evaluateComplexityScore([makeApi({ authType: 'oauth' })])).toBe(15);
    });

    it('여러 API 중 최고 auth가 oauth → +15점', () => {
      const apis = [makeApi({ authType: 'none' }), makeApi({ authType: 'oauth' })];
      expect(evaluateComplexityScore(apis)).toBe(15);
    });
  });

  describe('Endpoint diversity signal', () => {
    it('엔드포인트 0개 → +0점', () => {
      expect(evaluateComplexityScore([makeApi({ endpoints: [] })])).toBe(0);
    });

    it('엔드포인트 2개 → +5점', () => {
      const api = makeApi({ endpoints: [makeEndpoint('GET'), makeEndpoint('GET')] });
      expect(evaluateComplexityScore([api])).toBe(5);
    });

    it('엔드포인트 4개 이상 → +10점', () => {
      const api = makeApi({
        endpoints: [makeEndpoint(), makeEndpoint(), makeEndpoint(), makeEndpoint()],
      });
      expect(evaluateComplexityScore([api])).toBe(10);
    });

    it('POST 엔드포인트 포함 → +8점 추가', () => {
      const api = makeApi({ endpoints: [makeEndpoint('GET'), makeEndpoint('POST')] });
      // endpoints=2 → +5, has mutation → +8 = 13
      expect(evaluateComplexityScore([api])).toBe(13);
    });

    it('DELETE 엔드포인트 포함 → mutation 점수 부여', () => {
      const api = makeApi({ endpoints: [makeEndpoint('GET'), makeEndpoint('DELETE')] });
      expect(evaluateComplexityScore([api])).toBeGreaterThanOrEqual(8);
    });
  });

  describe('Context quality signal', () => {
    it('컨텍스트 없음 → +0점', () => {
      expect(evaluateComplexityScore([makeApi()])).toBe(0);
    });

    it('짧은 컨텍스트 (1~99자) → +3점 (100자↑보다 낮은 단조 증가)', () => {
      const score = evaluateComplexityScore([makeApi()], '짧은 설명');
      expect(score).toBe(3);
    });

    it('중간 컨텍스트 (100~499자) → +8점', () => {
      const ctx = 'a'.repeat(100);
      const score = evaluateComplexityScore([makeApi()], ctx);
      expect(score).toBe(8);
    });

    it('긴 컨텍스트 (500자 이상) → +15점', () => {
      const ctx = 'a'.repeat(500);
      const score = evaluateComplexityScore([makeApi()], ctx);
      expect(score).toBe(15);
    });
  });

  describe('Dependency complexity signal', () => {
    it('동일 카테고리 API 2개 이상 → +10점', () => {
      const apis = [
        makeApi({ category: 'weather' }),
        makeApi({ category: 'weather' }),
      ];
      expect(evaluateComplexityScore(apis)).toBe(10);
    });

    it('서로 다른 카테고리 → 의존성 점수 없음', () => {
      const apis = [makeApi({ category: 'weather' }), makeApi({ category: 'finance' })];
      expect(evaluateComplexityScore(apis)).toBe(0);
    });

    it('API 이름에 payment 포함 → +10점', () => {
      const api = makeApi({ name: 'Stripe Payment API' });
      expect(evaluateComplexityScore([api])).toBe(10);
    });

    it('API 이름에 결제 포함 → +10점', () => {
      const api = makeApi({ name: '카카오 결제 API' });
      expect(evaluateComplexityScore([api])).toBe(10);
    });
  });

  describe('임계값 35 — shouldUseExtendedThinking 등가 검증', () => {
    it('단순 단일 API + 짧은 컨텍스트 → 35 미만', () => {
      const score = evaluateComplexityScore([makeApi({ authType: 'none' })], '간단한 서비스');
      expect(score).toBeLessThan(35);
    });

    it('보통 (2개 API, api_key, 3개 엔드포인트+POST, 150자) → 35 미만', () => {
      // api_key: +8, endpoints≥2: +5, mutation: +8, context≥100: +8 = 29
      const apis = [
        makeApi({ authType: 'api_key', endpoints: [makeEndpoint('GET'), makeEndpoint('POST'), makeEndpoint('GET')] }),
        makeApi({ authType: 'none' }),
      ];
      const score = evaluateComplexityScore(apis, 'a'.repeat(150));
      expect(score).toBeLessThan(35);
    });

    it('중간 (3개 API, api_key, 5개 엔드포인트+변이, 300자) → 35 이상', () => {
      // API count: +5, api_key: +8, endpoints≥4: +10, mutation: +8, context≥100: +8 = 39
      const apis = [
        makeApi({
          authType: 'api_key',
          endpoints: [makeEndpoint('GET'), makeEndpoint('POST'), makeEndpoint('DELETE'), makeEndpoint('GET'), makeEndpoint('GET')],
        }),
        makeApi({ authType: 'none' }),
        makeApi({ authType: 'none' }),
      ];
      const score = evaluateComplexityScore(apis, 'a'.repeat(300));
      expect(score).toBeGreaterThanOrEqual(35);
    });

    it('결제 포함 (2개, api_key, 4개 엔드포인트+POST, 200자) → 35 이상', () => {
      // api_key: +8, endpoints≥4: +10, mutation: +8, context≥100: +8, payment: +10 = 44
      const apis = [
        makeApi({
          name: 'Stripe 결제 API',
          authType: 'api_key',
          endpoints: [makeEndpoint('GET'), makeEndpoint('POST'), makeEndpoint('PUT'), makeEndpoint('DELETE')],
        }),
        makeApi({ authType: 'none' }),
      ];
      const score = evaluateComplexityScore(apis, 'a'.repeat(200));
      expect(score).toBeGreaterThanOrEqual(35);
    });

    it('3개 API + oauth + 4개 엔드포인트(POST 포함) + 긴 컨텍스트 → 35 이상', () => {
      // API count: +5, oauth: +15, endpoints≥4: +10, mutation: +8, context≥500: +15 = 53
      const apis = [
        makeApi({
          authType: 'oauth',
          endpoints: [
            makeEndpoint('GET'), makeEndpoint('POST'),
            makeEndpoint('GET'), makeEndpoint('DELETE'),
          ],
        }),
        makeApi({ authType: 'none' }),
        makeApi({ authType: 'none' }),
      ];
      const ctx = 'a'.repeat(500);
      const score = evaluateComplexityScore(apis, ctx);
      expect(score).toBeGreaterThanOrEqual(35);
    });
  });
});
