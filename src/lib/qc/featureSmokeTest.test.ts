import { describe, it, expect, vi } from 'vitest';
import { runFeatureSmokeTests } from './featureSmokeTest';
import type { Feature } from '../ai/featureExtractor';

// ---------------------------------------------------------------------------
// Mock Page factory
// ---------------------------------------------------------------------------

function createMockPage(overrides: Record<string, unknown> = {}) {
  return {
    $: vi.fn().mockResolvedValue(null),
    $$: vi.fn().mockResolvedValue([]),
    $$eval: vi.fn().mockResolvedValue(0),
    evaluate: vi.fn().mockResolvedValue(0),
    fill: vi.fn().mockResolvedValue(undefined),
    click: vi.fn().mockResolvedValue(undefined),
    waitForTimeout: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as import('playwright-core').Page;
}

function makeFeature(verifiableBy: Feature['verifiableBy'], id = 1): Feature {
  return {
    id: `feature-${verifiableBy}-${id}`,
    description: `${verifiableBy} 기능`,
    verifiableBy,
  };
}

// ---------------------------------------------------------------------------
// 1. 'list' 검증: 5개 요소 → passes
// ---------------------------------------------------------------------------

describe("'list' 검증", () => {
  it('mocked page가 5개 요소를 반환하면 passed: true', async () => {
    const fakeElements = Array(5).fill({});
    const page = createMockPage({
      $$: vi.fn().mockResolvedValue(fakeElements),
    });

    const report = await runFeatureSmokeTests(page, [makeFeature('list')]);

    expect(report.results).toHaveLength(1);
    expect(report.results[0].passed).toBe(true);
    expect(report.results[0].detail).toContain('5');
    expect(report.passedCount).toBe(1);
    expect(report.coveragePercent).toBe(100);
  });

  it('mocked page가 2개 요소를 반환하면 passed: false (< 3)', async () => {
    const page = createMockPage({
      $$: vi.fn().mockResolvedValue([{}, {}]),
    });

    const report = await runFeatureSmokeTests(page, [makeFeature('list')]);

    expect(report.results[0].passed).toBe(false);
    expect(report.results[0].detail).toContain('2');
  });
});

// ---------------------------------------------------------------------------
// 2. 'chart-element' 검증: canvas 요소 존재 → passes
// ---------------------------------------------------------------------------

describe("'chart-element' 검증", () => {
  it('canvas 요소가 있으면 passed: true', async () => {
    const page = createMockPage({
      $: vi.fn().mockResolvedValue({}), // canvas 존재
    });

    const report = await runFeatureSmokeTests(page, [makeFeature('chart-element')]);

    expect(report.results[0].passed).toBe(true);
    expect(report.results[0].detail).toContain('canvas');
  });

  it('canvas 요소가 없으면 passed: false', async () => {
    const page = createMockPage({
      $: vi.fn().mockResolvedValue(null),
    });

    const report = await runFeatureSmokeTests(page, [makeFeature('chart-element')]);

    expect(report.results[0].passed).toBe(false);
    expect(report.results[0].detail).toContain('canvas');
  });
});

// ---------------------------------------------------------------------------
// 3. 'unknown' 항상 통과
// ---------------------------------------------------------------------------

describe("'unknown' 검증", () => {
  it('항상 passed: true 반환', async () => {
    const page = createMockPage();

    const report = await runFeatureSmokeTests(page, [makeFeature('unknown')]);

    expect(report.results[0].passed).toBe(true);
    expect(report.results[0].detail).toContain('통과 처리');
  });
});

// ---------------------------------------------------------------------------
// 4. 에러 fallback: page.$$ throws → passed: false, detail starts with '오류:'
// ---------------------------------------------------------------------------

describe('에러 fallback', () => {
  it('page.$$ throws → passed: false, detail이 "오류:"로 시작', async () => {
    const page = createMockPage({
      $$: vi.fn().mockRejectedValue(new Error('execution context destroyed')),
    });

    const report = await runFeatureSmokeTests(page, [makeFeature('list')]);

    expect(report.results[0].passed).toBe(false);
    expect(report.results[0].detail.startsWith('오류:')).toBe(true);
    expect(report.results[0].detail).toContain('execution context destroyed');
  });

  it('page.$ throws → passed: false, detail이 "오류:"로 시작', async () => {
    const page = createMockPage({
      $: vi.fn().mockRejectedValue(new Error('detached frame')),
    });

    const report = await runFeatureSmokeTests(page, [makeFeature('chart-element')]);

    expect(report.results[0].passed).toBe(false);
    expect(report.results[0].detail.startsWith('오류:')).toBe(true);
  });

  it('다른 feature는 계속 진행 — 오류가 전파되지 않음', async () => {
    let callCount = 0;
    const page = createMockPage({
      $$: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.reject(new Error('first fails'));
        return Promise.resolve(Array(5).fill({}));
      }),
    });

    const features = [makeFeature('list', 1), makeFeature('list', 2)];
    const report = await runFeatureSmokeTests(page, features);

    expect(report.results).toHaveLength(2);
    expect(report.results[0].passed).toBe(false);
    expect(report.results[1].passed).toBe(true);
    expect(report.passedCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 5. coveragePercent 계산: 4개 중 3개 통과 → 75%
// ---------------------------------------------------------------------------

describe('coveragePercent 계산', () => {
  it('4개 중 3개 통과 → 75%', async () => {
    // Use a mix of verifiable types where outcomes are deterministic:
    // 'unknown' always passes (2x), 'list' with 5 items passes (1x), 'chart-element' with no canvas fails (1x)
    const page = createMockPage({
      $$: vi.fn().mockResolvedValue(Array(5).fill({})), // list → 5 items → pass
      $: vi.fn().mockResolvedValue(null),               // chart-element → no canvas → fail
    });

    const features: Feature[] = [
      makeFeature('unknown', 1),       // always pass
      makeFeature('unknown', 2),       // always pass
      makeFeature('list', 3),          // pass (5개)
      makeFeature('chart-element', 4), // fail (canvas 없음)
    ];

    const report = await runFeatureSmokeTests(page, features);

    expect(report.totalCount).toBe(4);
    expect(report.passedCount).toBe(3);
    expect(report.coveragePercent).toBe(75);
  });

  it('빈 feature 배열 → coveragePercent: 100, totalCount: 0', async () => {
    const page = createMockPage();
    const report = await runFeatureSmokeTests(page, []);

    expect(report.totalCount).toBe(0);
    expect(report.passedCount).toBe(0);
    expect(report.coveragePercent).toBe(100);
    expect(report.results).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 6. 결과 구조 검증 (featureId, description, verifiableBy 전달 확인)
// ---------------------------------------------------------------------------

describe('결과 구조 검증', () => {
  it('FeatureSmokeResult에 featureId, description, verifiableBy가 포함됨', async () => {
    const page = createMockPage({
      $$: vi.fn().mockResolvedValue(Array(5).fill({})),
    });

    const feature: Feature = {
      id: 'feature-list-42',
      description: '목록 표시 기능',
      verifiableBy: 'list',
    };

    const report = await runFeatureSmokeTests(page, [feature]);
    const result = report.results[0];

    expect(result.featureId).toBe('feature-list-42');
    expect(result.description).toBe('목록 표시 기능');
    expect(result.verifiableBy).toBe('list');
  });
});
