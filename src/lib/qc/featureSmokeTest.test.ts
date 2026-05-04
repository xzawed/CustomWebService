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
// 6. 'input+button' 검증
// ---------------------------------------------------------------------------

describe("'input+button' 검증", () => {
  it('input 없음 → passed: false, detail: 텍스트 입력 필드 없음', async () => {
    const page = createMockPage({
      $: vi.fn().mockResolvedValue(null),
    });

    const report = await runFeatureSmokeTests(page, [makeFeature('input+button')]);

    expect(report.results[0].passed).toBe(false);
    expect(report.results[0].detail).toBe('텍스트 입력 필드 없음');
  });

  it('input 있음 + button 없음 → passed: false, detail: 버튼 없음', async () => {
    const mockInput = { fill: vi.fn().mockResolvedValue(undefined) };
    // First call returns input element, second call returns null (no button)
    const mockDollar = vi.fn()
      .mockResolvedValueOnce(mockInput)  // input selector
      .mockResolvedValueOnce(null);      // button selector

    const page = createMockPage({ $: mockDollar });

    const report = await runFeatureSmokeTests(page, [makeFeature('input+button')]);

    expect(report.results[0].passed).toBe(false);
    expect(report.results[0].detail).toBe('버튼 없음');
    expect(mockInput.fill).toHaveBeenCalledWith('서울');
  });

  it('input + button 있음 + bodyText > 100 → passed: true', async () => {
    const mockInput = { fill: vi.fn().mockResolvedValue(undefined) };
    const mockButton = { click: vi.fn().mockResolvedValue(undefined) };
    const mockDollar = vi.fn()
      .mockResolvedValueOnce(mockInput)  // input selector
      .mockResolvedValueOnce(mockButton); // button selector

    const page = createMockPage({
      $: mockDollar,
      evaluate: vi.fn().mockResolvedValue(150), // textAfter > 100
    });

    const report = await runFeatureSmokeTests(page, [makeFeature('input+button')]);

    expect(report.results[0].passed).toBe(true);
    expect(report.results[0].detail).toBe('입력→버튼→DOM 변화 확인');
    expect(mockButton.click).toHaveBeenCalledOnce();
  });

  it('input + button 있음 + bodyText <= 100 → passed: false, detail: DOM 변화 없음', async () => {
    const mockInput = { fill: vi.fn().mockResolvedValue(undefined) };
    const mockButton = { click: vi.fn().mockResolvedValue(undefined) };
    const mockDollar = vi.fn()
      .mockResolvedValueOnce(mockInput)
      .mockResolvedValueOnce(mockButton);

    const page = createMockPage({
      $: mockDollar,
      evaluate: vi.fn().mockResolvedValue(50), // textAfter <= 100
    });

    const report = await runFeatureSmokeTests(page, [makeFeature('input+button')]);

    expect(report.results[0].passed).toBe(false);
    expect(report.results[0].detail).toBe('DOM 변화 없음');
  });
});

// ---------------------------------------------------------------------------
// 7. 'filter-button' 검증
// ---------------------------------------------------------------------------

describe("'filter-button' 검증", () => {
  it('필터 버튼 1개 → passed: false, detail: 필터 버튼 부족', async () => {
    const page = createMockPage({
      $$: vi.fn().mockResolvedValue([{}]), // only 1 button
    });

    const report = await runFeatureSmokeTests(page, [makeFeature('filter-button')]);

    expect(report.results[0].passed).toBe(false);
    expect(report.results[0].detail).toBe('필터 버튼 부족');
  });

  it('필터 버튼 2개 + before !== after → passed: true, detail: 필터 적용 확인', async () => {
    const mockFilterBtn1 = { click: vi.fn().mockResolvedValue(undefined) };
    const mockFilterBtn2 = { click: vi.fn().mockResolvedValue(undefined) };

    // $$eval: first call returns before=3, second call returns after=5
    const mockDblDollarEval = vi.fn()
      .mockResolvedValueOnce(3)  // before
      .mockResolvedValueOnce(5); // after

    // $ returns null for active element check
    const page = createMockPage({
      $$: vi.fn().mockResolvedValue([mockFilterBtn1, mockFilterBtn2]),
      $$eval: mockDblDollarEval,
      $: vi.fn().mockResolvedValue(null), // no active element
    });

    const report = await runFeatureSmokeTests(page, [makeFeature('filter-button')]);

    expect(report.results[0].passed).toBe(true);
    expect(report.results[0].detail).toBe('필터 적용 확인');
    expect(mockFilterBtn2.click).toHaveBeenCalledOnce();
  });

  it('필터 버튼 2개 + before === after + active 요소 존재 → passed: true, detail: active 상태 변화 확인', async () => {
    const mockFilterBtn1 = { click: vi.fn().mockResolvedValue(undefined) };
    const mockFilterBtn2 = { click: vi.fn().mockResolvedValue(undefined) };

    const mockDblDollarEval = vi.fn()
      .mockResolvedValueOnce(3)  // before
      .mockResolvedValueOnce(3); // after (same)

    const page = createMockPage({
      $$: vi.fn().mockResolvedValue([mockFilterBtn1, mockFilterBtn2]),
      $$eval: mockDblDollarEval,
      $: vi.fn().mockResolvedValue({}), // active element exists
    });

    const report = await runFeatureSmokeTests(page, [makeFeature('filter-button')]);

    expect(report.results[0].passed).toBe(true);
    expect(report.results[0].detail).toBe('active 상태 변화 확인');
  });

  it('필터 버튼 2개 + before === after + active 없음 → passed: false', async () => {
    const mockFilterBtn1 = { click: vi.fn().mockResolvedValue(undefined) };
    const mockFilterBtn2 = { click: vi.fn().mockResolvedValue(undefined) };

    const mockDblDollarEval = vi.fn()
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(3); // same

    const page = createMockPage({
      $$: vi.fn().mockResolvedValue([mockFilterBtn1, mockFilterBtn2]),
      $$eval: mockDblDollarEval,
      $: vi.fn().mockResolvedValue(null), // no active element
    });

    const report = await runFeatureSmokeTests(page, [makeFeature('filter-button')]);

    expect(report.results[0].passed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 8. 'text-display' 검증
// ---------------------------------------------------------------------------

describe("'text-display' 검증", () => {
  it('bodyText > 50 → passed: true, detail에 글자 수 포함', async () => {
    const page = createMockPage({
      evaluate: vi.fn().mockResolvedValue(120),
    });

    const report = await runFeatureSmokeTests(page, [makeFeature('text-display')]);

    expect(report.results[0].passed).toBe(true);
    expect(report.results[0].detail).toContain('120');
    expect(report.results[0].detail).toContain('텍스트');
  });

  it('bodyText <= 50 → passed: false', async () => {
    const page = createMockPage({
      evaluate: vi.fn().mockResolvedValue(30),
    });

    const report = await runFeatureSmokeTests(page, [makeFeature('text-display')]);

    expect(report.results[0].passed).toBe(false);
    expect(report.results[0].detail).toContain('30');
  });

  it('bodyText = 51 boundary → passed: true (> 50)', async () => {
    const page = createMockPage({
      evaluate: vi.fn().mockResolvedValue(51),
    });

    const report = await runFeatureSmokeTests(page, [makeFeature('text-display')]);

    expect(report.results[0].passed).toBe(true);
  });

  it('bodyText = 50 boundary → passed: false (not > 50)', async () => {
    const page = createMockPage({
      evaluate: vi.fn().mockResolvedValue(50),
    });

    const report = await runFeatureSmokeTests(page, [makeFeature('text-display')]);

    expect(report.results[0].passed).toBe(false);
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
