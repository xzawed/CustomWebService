import { describe, it, expect, vi } from 'vitest';
import type { ApiCatalogItem, ApiEndpoint } from '@/types/api';

// evaluateComplexityScore only uses its own pure logic — no imports that need mocking.
// We still need to stub the heavy transitive deps so the module loads.
vi.mock('@/providers/ai/AiProviderFactory', () => ({ AiProviderFactory: { createForTask: vi.fn() } }));
vi.mock('@/lib/ai/codeParser', () => ({ assembleHtml: vi.fn() }));
vi.mock('@/lib/ai/codeValidator', () => ({ validateAll: vi.fn(), evaluateQuality: vi.fn() }));
vi.mock('@/lib/ai/qualityLoop', () => ({ runQualityLoop: vi.fn() }));
vi.mock('@/lib/qc', () => ({ runFastQc: vi.fn(), isQcEnabled: vi.fn().mockReturnValue(false) }));
vi.mock('@/lib/events/eventBus', () => ({ eventBus: { on: vi.fn(), emit: vi.fn() } }));
vi.mock('@/lib/utils/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock('@/lib/ai/generationTracker', () => ({
  generationTracker: { start: vi.fn(), fail: vi.fn(), updateProgress: vi.fn() },
}));
vi.mock('@/lib/ai/stageRunner', () => ({
  runStage1: vi.fn(),
  runStage2Function: vi.fn(),
  runStage3: vi.fn(),
}));
vi.mock('@/lib/ai/generationSaver', () => ({ saveGeneratedCode: vi.fn() }));
vi.mock('@/lib/ai/featureExtractor', () => ({ extractFeatures: vi.fn() }));

import { evaluateComplexityScore } from '@/lib/ai/generationPipeline';

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function makeApi(overrides: Partial<ApiCatalogItem> = {}): ApiCatalogItem {
  return {
    id: 'api-1',
    name: 'Test API',
    description: '',
    category: 'test',
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
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  } as ApiCatalogItem;
}

function makeEndpoint(method: ApiEndpoint['method'] = 'GET'): ApiEndpoint {
  return {
    path: '/test',
    method,
    description: '',
    params: [],
    responseExample: {},
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('evaluateComplexityScore', () => {
  it('returns 0 for an empty API list', () => {
    expect(evaluateComplexityScore([])).toBe(0);
  });

  it('returns 0 for 1 API with no auth, no endpoints, no context', () => {
    expect(evaluateComplexityScore([makeApi()])).toBe(0);
  });

  it('returns 0 for exactly 2 APIs (no API-count bonus, different categories)', () => {
    // Different categories → no same-category bonus
    const apis = [makeApi({ category: 'cat-a' }), makeApi({ id: 'api-2', category: 'cat-b' })];
    expect(evaluateComplexityScore(apis)).toBe(0);
  });

  it('adds +5 for 3 APIs (1 extra beyond 2), different categories', () => {
    // Use distinct categories so same-category bonus does not fire
    const apis = [
      makeApi({ id: 'api-1', category: 'cat-a' }),
      makeApi({ id: 'api-2', category: 'cat-b' }),
      makeApi({ id: 'api-3', category: 'cat-c' }),
    ];
    expect(evaluateComplexityScore(apis)).toBe(5);
  });

  it('caps API-count bonus at 20 for 6 or more APIs (different categories)', () => {
    // 6 APIs with distinct categories: (6-2)*5 = 20 — capped at 20; no same-category bonus
    const apis = Array.from({ length: 6 }, (_, i) =>
      makeApi({ id: `api-${i}`, category: `cat-${i}` }),
    );
    expect(evaluateComplexityScore(apis)).toBe(20);
  });

  it('adds +15 for oauth auth type', () => {
    expect(evaluateComplexityScore([makeApi({ authType: 'oauth' })])).toBe(15);
  });

  it('adds +8 for api_key auth type', () => {
    expect(evaluateComplexityScore([makeApi({ authType: 'api_key' })])).toBe(8);
  });

  it('uses the highest auth score when mixing oauth and api_key', () => {
    const apis = [makeApi({ authType: 'oauth' }), makeApi({ id: 'api-2', authType: 'api_key' })];
    // oauth wins → 15; same category (both 'test') + 2 APIs → +10
    expect(evaluateComplexityScore(apis)).toBe(15 + 10);
  });

  it('adds +5 for 2 total endpoints across APIs', () => {
    const api = makeApi({ endpoints: [makeEndpoint(), makeEndpoint()] });
    expect(evaluateComplexityScore([api])).toBe(5);
  });

  it('adds +10 for 4 or more total endpoints', () => {
    const api = makeApi({
      endpoints: [makeEndpoint(), makeEndpoint(), makeEndpoint(), makeEndpoint()],
    });
    expect(evaluateComplexityScore([api])).toBe(10);
  });

  it('adds +8 for POST mutation endpoint', () => {
    const api = makeApi({ endpoints: [makeEndpoint('POST')] });
    // 1 endpoint < 2 so no endpoint breadth bonus, but +8 for mutation
    expect(evaluateComplexityScore([api])).toBe(8);
  });

  it('adds +8 for PUT mutation endpoint', () => {
    const api = makeApi({ endpoints: [makeEndpoint('PUT')] });
    expect(evaluateComplexityScore([api])).toBe(8);
  });

  it('adds +8 for DELETE mutation endpoint', () => {
    const api = makeApi({ endpoints: [makeEndpoint('DELETE')] });
    expect(evaluateComplexityScore([api])).toBe(8);
  });

  it('adds +3 for context with 1–99 characters', () => {
    expect(evaluateComplexityScore([makeApi()], 'a'.repeat(50))).toBe(3);
  });

  it('adds +8 for context with exactly 100 characters (boundary)', () => {
    expect(evaluateComplexityScore([makeApi()], 'a'.repeat(100))).toBe(8);
  });

  it('adds +15 for context with exactly 500 characters (boundary)', () => {
    expect(evaluateComplexityScore([makeApi()], 'a'.repeat(500))).toBe(15);
  });

  it('adds +10 for same category with 2 APIs', () => {
    // Both have category 'test' by default in makeApi
    const apis = [makeApi(), makeApi({ id: 'api-2' })];
    expect(evaluateComplexityScore(apis)).toBe(10);
  });

  it('does NOT add the same-category bonus when categories differ', () => {
    const apis = [makeApi({ category: 'cat-a' }), makeApi({ id: 'api-2', category: 'cat-b' })];
    expect(evaluateComplexityScore(apis)).toBe(0);
  });

  it('adds +10 for an API name matching the "payment" keyword', () => {
    expect(evaluateComplexityScore([makeApi({ name: 'Stripe Payment' })])).toBe(10);
  });

  it('adds +10 for an API name matching "stripe" (case-insensitive)', () => {
    expect(evaluateComplexityScore([makeApi({ name: 'stripe integration' })])).toBe(10);
  });

  it('adds +10 for an API name matching "결제" keyword', () => {
    expect(evaluateComplexityScore([makeApi({ name: '카드 결제 API' })])).toBe(10);
  });

  it('adds +10 for an API name matching "pay" keyword', () => {
    expect(evaluateComplexityScore([makeApi({ name: 'PayPal API' })])).toBe(10);
  });

  it('computes a combined score correctly', () => {
    // 3 APIs (same category 'test') → API-count +5, same-category +10
    // api_key auth → +8
    // 2 endpoints → +5, POST mutation → +8
    // context 200 chars → +8
    // Expected: 5 + 10 + 8 + 5 + 8 + 8 = 44
    const apis = [
      makeApi({
        id: 'api-1',
        authType: 'api_key',
        endpoints: [makeEndpoint('POST'), makeEndpoint()],
      }),
      makeApi({ id: 'api-2' }),
      makeApi({ id: 'api-3' }),
    ];
    const context = 'a'.repeat(200);
    expect(evaluateComplexityScore(apis, context)).toBe(44);
  });
});
