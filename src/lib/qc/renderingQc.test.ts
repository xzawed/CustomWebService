import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { checkConsoleErrors, checkHorizontalScroll, checkFooterVisible, checkTouchTargets } from './qcChecks';
import { isQcEnabled } from './browserPool';
import { shouldRetryGeneration } from '@/lib/ai/qualityLoop';
import type { QualityMetrics } from '@/lib/ai/codeValidator';
import type { QcReport } from '@/types/qc';

// ---------------------------------------------------------------------------
// Mock Page factory
// ---------------------------------------------------------------------------

function createMockPage(overrides: Record<string, unknown> = {}) {
  return {
    evaluate: vi.fn(),
    $: vi.fn(),
    $$eval: vi.fn(),
    setViewportSize: vi.fn(),
    ...overrides,
  } as unknown as import('playwright-core').Page;
}

// ---------------------------------------------------------------------------
// High-quality metrics fixture (above thresholds)
// ---------------------------------------------------------------------------

function makeHighQualityMetrics(overrides: Partial<QualityMetrics> = {}): QualityMetrics {
  return {
    structuralScore: 80,
    mobileScore: 80,
    hasSemanticHtml: true,
    hasMockData: false,
    hasInteraction: true,
    hasResponsiveClasses: true,
    hasAdequateResponsive: true,
    noFixedOverflow: true,
    hasImageProtection: true,
    hasMobileNav: true,
    hasFooter: true,
    hasImgAlt: true,
    fetchCallCount: 1,
    hasProxyCall: false,
    hasJsonParse: true,
    placeholderCount: 0,
    hardcodedArrayCount: 0,
    details: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. checkConsoleErrors
// ---------------------------------------------------------------------------

describe('checkConsoleErrors', () => {
  it('빈 배열 → passed: true, score: 100', () => {
    const result = checkConsoleErrors([]);
    expect(result.name).toBe('consoleErrors');
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.details).toHaveLength(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('에러가 있는 배열 → passed: false, score: 0, details에 메시지 포함', () => {
    const errors = ['TypeError: undefined is not a function', 'ReferenceError: foo is not defined'];
    const result = checkConsoleErrors(errors);
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
    expect(result.details).toEqual(errors);
  });

  it('에러가 1개인 배열 → passed: false', () => {
    const result = checkConsoleErrors(['SyntaxError: unexpected token']);
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
    expect(result.details).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 2. checkHorizontalScroll
// ---------------------------------------------------------------------------

describe('checkHorizontalScroll', () => {
  it('scrollWidth <= clientWidth → passed: true, details 없음', async () => {
    const page = createMockPage({
      evaluate: vi.fn().mockResolvedValue({ scrollWidth: 375, clientWidth: 375 }),
    });
    const result = await checkHorizontalScroll(page, 375);
    expect(result.name).toBe('horizontalScroll');
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.details).toHaveLength(0);
  });

  it('scrollWidth > clientWidth → passed: false, details에 overflow 양 포함', async () => {
    const page = createMockPage({
      evaluate: vi.fn().mockResolvedValue({ scrollWidth: 420, clientWidth: 375 }),
    });
    const result = await checkHorizontalScroll(page, 375);
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
    expect(result.details).toHaveLength(1);
    expect(result.details[0]).toContain('45px');
    expect(result.details[0]).toContain('375px');
  });

  it('evaluate 오류 → passed: false, details에 에러 메시지', async () => {
    const page = createMockPage({
      evaluate: vi.fn().mockRejectedValue(new Error('execution context destroyed')),
    });
    const result = await checkHorizontalScroll(page, 375);
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
    expect(result.details[0]).toContain('execution context destroyed');
  });
});

// ---------------------------------------------------------------------------
// 3. checkFooterVisible
// ---------------------------------------------------------------------------

describe('checkFooterVisible', () => {
  it('footer 존재 + visible → passed: true, score: 100', async () => {
    const mockElement = { isVisible: vi.fn().mockResolvedValue(true) };
    const page = createMockPage({
      $: vi.fn().mockResolvedValue(mockElement),
    });
    const result = await checkFooterVisible(page);
    expect(result.name).toBe('footerVisible');
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.details).toHaveLength(0);
  });

  it('footer 없음 → passed: false, details에 not found 메시지', async () => {
    const page = createMockPage({
      $: vi.fn().mockResolvedValue(null),
    });
    const result = await checkFooterVisible(page);
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
    expect(result.details[0]).toContain('No <footer>');
  });

  it('footer 존재 + invisible → passed: false, score: 50', async () => {
    const mockElement = { isVisible: vi.fn().mockResolvedValue(false) };
    const page = createMockPage({
      $: vi.fn().mockResolvedValue(mockElement),
    });
    const result = await checkFooterVisible(page);
    expect(result.passed).toBe(false);
    expect(result.score).toBe(50);
    expect(result.details[0]).toContain('not visible');
  });

  it('page.$ 오류 → passed: false, details에 에러 메시지', async () => {
    const page = createMockPage({
      $: vi.fn().mockRejectedValue(new Error('detached frame')),
    });
    const result = await checkFooterVisible(page);
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
    expect(result.details[0]).toContain('detached frame');
  });
});

// ---------------------------------------------------------------------------
// 4. checkTouchTargets
// ---------------------------------------------------------------------------

describe('checkTouchTargets', () => {
  it('인터랙티브 요소 없음 → passed: true, score: 100', async () => {
    const page = createMockPage({
      $$eval: vi.fn().mockResolvedValue([]),
    });
    const result = await checkTouchTargets(page);
    expect(result.name).toBe('touchTargets');
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.details[0]).toContain('No interactive elements');
  });

  it('모든 요소 >= 44px → passed: true, score: 100', async () => {
    const page = createMockPage({
      $$eval: vi.fn().mockResolvedValue([
        { tag: 'button', text: '제출', width: 120, height: 44 },
        { tag: 'a', text: '홈으로', width: 80, height: 48 },
      ]),
    });
    const result = await checkTouchTargets(page);
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.details).toHaveLength(0);
  });

  it('일부 요소 < 44px → score가 비례하여 감소', async () => {
    const page = createMockPage({
      $$eval: vi.fn().mockResolvedValue([
        { tag: 'button', text: '큰버튼', width: 120, height: 44 },
        { tag: 'button', text: '작은버튼', width: 30, height: 20 },
        { tag: 'a', text: '링크', width: 50, height: 10 },
        { tag: 'button', text: '정상버튼', width: 100, height: 50 },
      ]),
    });
    const result = await checkTouchTargets(page);
    expect(result.passed).toBe(false);
    // 4개 중 2개 실패 → score = round(2/4 * 100) = 50
    expect(result.score).toBe(50);
    expect(result.details.length).toBeGreaterThan(0);
  });

  it('form 요소는 width만 검사 (height 무관)', async () => {
    const page = createMockPage({
      $$eval: vi.fn().mockResolvedValue([
        { tag: 'input', text: '', width: 200, height: 20 }, // height 작아도 통과
        { tag: 'input', text: '', width: 30, height: 50 },  // width 작아서 실패
      ]),
    });
    const result = await checkTouchTargets(page);
    expect(result.passed).toBe(false);
    // 2개 중 1개 실패 → score = 50
    expect(result.score).toBe(50);
  });

  it('$$eval 오류 → passed: false, details에 에러 메시지', async () => {
    const page = createMockPage({
      $$eval: vi.fn().mockRejectedValue(new Error('context lost')),
    });
    const result = await checkTouchTargets(page);
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
    expect(result.details[0]).toContain('context lost');
  });
});

// ---------------------------------------------------------------------------
// 5. isQcEnabled
// ---------------------------------------------------------------------------

describe('isQcEnabled', () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.ENABLE_RENDERING_QC;
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.ENABLE_RENDERING_QC;
    } else {
      process.env.ENABLE_RENDERING_QC = originalEnv;
    }
  });

  it('ENABLE_RENDERING_QC=true → true 반환', () => {
    process.env.ENABLE_RENDERING_QC = 'true';
    expect(isQcEnabled()).toBe(true);
  });

  it('ENABLE_RENDERING_QC 미설정 → false 반환', () => {
    delete process.env.ENABLE_RENDERING_QC;
    expect(isQcEnabled()).toBe(false);
  });

  it('ENABLE_RENDERING_QC=false → false 반환', () => {
    process.env.ENABLE_RENDERING_QC = 'false';
    expect(isQcEnabled()).toBe(false);
  });

  it('ENABLE_RENDERING_QC=1 → false 반환 (정확히 "true"만 허용)', () => {
    process.env.ENABLE_RENDERING_QC = '1';
    expect(isQcEnabled()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 6. shouldRetryGeneration with QcReport
// ---------------------------------------------------------------------------

describe('shouldRetryGeneration — QcReport 통합', () => {
  it('고품질 + QcReport 없음 → false', () => {
    const metrics = makeHighQualityMetrics();
    expect(shouldRetryGeneration(metrics)).toBe(false);
    expect(shouldRetryGeneration(metrics, null)).toBe(false);
    expect(shouldRetryGeneration(metrics, undefined)).toBe(false);
  });

  it('고품질 + QcReport에 consoleErrors 실패 → true', () => {
    const metrics = makeHighQualityMetrics();
    const qcReport: QcReport = {
      overallScore: 50,
      passed: false,
      viewportsTested: [375],
      durationMs: 100,
      timestamp: new Date().toISOString(),
      checks: [
        { name: 'consoleErrors', passed: false, score: 0, details: ['TypeError'], durationMs: 1 },
        { name: 'horizontalScroll', passed: true, score: 100, details: [], durationMs: 1 },
      ],
    };
    expect(shouldRetryGeneration(metrics, qcReport)).toBe(true);
  });

  it('고품질 + QcReport에 horizontalScroll 실패 → true', () => {
    const metrics = makeHighQualityMetrics();
    const qcReport: QcReport = {
      overallScore: 50,
      passed: false,
      viewportsTested: [375],
      durationMs: 100,
      timestamp: new Date().toISOString(),
      checks: [
        { name: 'consoleErrors', passed: true, score: 100, details: [], durationMs: 1 },
        { name: 'horizontalScroll', passed: false, score: 0, details: ['Overflow: 45px'], durationMs: 1 },
      ],
    };
    expect(shouldRetryGeneration(metrics, qcReport)).toBe(true);
  });

  it('고품질 + QcReport 모두 통과 → false', () => {
    const metrics = makeHighQualityMetrics();
    const qcReport: QcReport = {
      overallScore: 100,
      passed: true,
      viewportsTested: [375],
      durationMs: 100,
      timestamp: new Date().toISOString(),
      checks: [
        { name: 'consoleErrors', passed: true, score: 100, details: [], durationMs: 1 },
        { name: 'horizontalScroll', passed: true, score: 100, details: [], durationMs: 1 },
        { name: 'footerVisible', passed: true, score: 100, details: [], durationMs: 1 },
      ],
    };
    expect(shouldRetryGeneration(metrics, qcReport)).toBe(false);
  });

  it('저품질(structuralScore 낮음) + QcReport 모두 통과 → true (기존 로직 유지)', () => {
    const metrics = makeHighQualityMetrics({ structuralScore: 20 });
    const qcReport: QcReport = {
      overallScore: 100,
      passed: true,
      viewportsTested: [375],
      durationMs: 100,
      timestamp: new Date().toISOString(),
      checks: [
        { name: 'consoleErrors', passed: true, score: 100, details: [], durationMs: 1 },
        { name: 'horizontalScroll', passed: true, score: 100, details: [], durationMs: 1 },
      ],
    };
    expect(shouldRetryGeneration(metrics, qcReport)).toBe(true);
  });

  it('고품질 + QcReport에 footerVisible 실패 → true (재시도 트리거)', () => {
    const metrics = makeHighQualityMetrics();
    const qcReport: QcReport = {
      overallScore: 70,
      passed: false,
      viewportsTested: [375],
      durationMs: 100,
      timestamp: new Date().toISOString(),
      checks: [
        { name: 'consoleErrors', passed: true, score: 100, details: [], durationMs: 1 },
        { name: 'horizontalScroll', passed: true, score: 100, details: [], durationMs: 1 },
        { name: 'footerVisible', passed: false, score: 0, details: ['No <footer>'], durationMs: 1 },
      ],
    };
    expect(shouldRetryGeneration(metrics, qcReport)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 7. checkNoRuntimePlaceholder — export check
// ---------------------------------------------------------------------------

describe('checkNoRuntimePlaceholder — export check', () => {
  it('is exported from qcChecks', async () => {
    const { checkNoRuntimePlaceholder } = await import('./qcChecks');
    expect(typeof checkNoRuntimePlaceholder).toBe('function');
  });
});
