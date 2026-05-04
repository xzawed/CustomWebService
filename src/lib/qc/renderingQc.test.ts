import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  checkConsoleErrors,
  checkHorizontalScroll,
  checkFooterVisible,
  checkTouchTargets,
  checkInteractiveBehavior,
  checkNetworkActivity,
  checkLoadingStateDisappears,
  checkAccessibility,
  checkImageLoading,
  checkNoLayoutOverlap,
  checkNoRuntimePlaceholder,
  checkResponsiveBreakpoints,
} from './qcChecks';
import { isQcEnabled } from './browserPool';
import { shouldRetryGeneration } from '@/lib/ai/qualityLoop';
import type { QualityMetrics } from '@/lib/ai/codeValidator';
import type { QcReport } from '@/types/qc';

// ---------------------------------------------------------------------------
// browserPool mock — used for runFastQc / runDeepQc tests (sections 9 & 10)
// ---------------------------------------------------------------------------

vi.mock('./browserPool', () => ({
  isQcEnabled: vi.fn().mockImplementation(() => process.env.ENABLE_RENDERING_QC === 'true'),
  getPage: vi.fn(),
  releasePage: vi.fn().mockResolvedValue(undefined),
}));

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
    hasProxyCall: true,
    hasJsonParse: true,
    placeholderCount: 0,
    hardcodedArrayCount: 0,
    hasTailwindCdn: true,
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

// ---------------------------------------------------------------------------
// 8. checkInteractiveBehavior — 재설계된 입력+버튼 / 필터·탭 서브체크
// ---------------------------------------------------------------------------

/**
 * 인터랙티브 행동 QC 체크 테스트 — 두 서브체크의 다양한 조합을 검증한다.
 *
 * createMockInteractivePage() 팩토리: 실제 Page API를 흉내내는 mock을 생성.
 * sub-check 1 (입력+버튼): $$, fill, click, waitForTimeout, evaluate (innerText, querySelectorAll)
 * sub-check 2 (필터/탭): $$, evaluateHandle, asElement, click, waitForTimeout, evaluate
 */

type MockElement = {
  isVisible: ReturnType<typeof vi.fn>;
  fill?: ReturnType<typeof vi.fn>;
  click?: ReturnType<typeof vi.fn>;
};

function createInteractivePage({
  inputsVisible = false,
  buttonVisible = true,
  beforeText = 'initial content',
  afterText = 'changed content with much more text added here to trigger threshold',
  beforeCount = 10,
  afterCount = 15,
  tabsVisible = false,
  beforeListCount = 3,
  afterListCount = 5,
  beforeActiveClass = 'tab-a active',
  afterActiveClass = 'tab-b active',
}: {
  inputsVisible?: boolean;
  buttonVisible?: boolean;
  beforeText?: string;
  afterText?: string;
  beforeCount?: number;
  afterCount?: number;
  tabsVisible?: boolean;
  beforeListCount?: number;
  afterListCount?: number;
  beforeActiveClass?: string;
  afterActiveClass?: string;
} = {}) {
  const inputElement: MockElement = {
    isVisible: vi.fn().mockResolvedValue(inputsVisible),
    fill: vi.fn().mockResolvedValue(undefined),
    click: vi.fn().mockResolvedValue(undefined),
  };

  const buttonElement: MockElement = {
    isVisible: vi.fn().mockResolvedValue(buttonVisible),
    click: vi.fn().mockResolvedValue(undefined),
  };

  const tabElement: MockElement = {
    isVisible: vi.fn().mockResolvedValue(tabsVisible),
    click: vi.fn().mockResolvedValue(undefined),
  };

  let evaluateCallCount = 0;

  const page = {
    $$: vi.fn().mockImplementation((selector: string) => {
      if (selector.includes('input')) return Promise.resolve(inputsVisible ? [inputElement] : []);
      if (selector.includes('tab') || selector.includes('@click') || selector.includes('x-on')) {
        return Promise.resolve(tabsVisible ? [tabElement, tabElement] : []);
      }
      return Promise.resolve([]);
    }),
    $: vi.fn().mockImplementation((selector: string) => {
      if (selector.includes('button')) return Promise.resolve(buttonVisible ? buttonElement : null);
      return Promise.resolve(null);
    }),
    evaluate: vi.fn().mockImplementation((fn: unknown) => {
      const fnStr = fn?.toString() ?? '';
      if (fnStr.includes('innerText')) {
        evaluateCallCount++;
        return Promise.resolve(evaluateCallCount === 1 ? beforeText : afterText);
      }
      if (fnStr.includes('querySelectorAll') && fnStr.includes('*').valueOf() && !fnStr.includes('li')) {
        evaluateCallCount++;
        return Promise.resolve(evaluateCallCount <= 2 ? beforeCount : afterCount);
      }
      if (fnStr.includes('li') || fnStr.includes('card') || fnStr.includes('item')) {
        return Promise.resolve(afterListCount); // for filter tab sub-check
      }
      if (fnStr.includes('active') || fnStr.includes('aria-selected')) {
        return Promise.resolve(afterActiveClass);
      }
      return Promise.resolve(undefined);
    }),
    evaluateHandle: vi.fn().mockResolvedValue({
      asElement: vi.fn().mockReturnValue(tabsVisible ? tabElement : null),
    }),
    waitForTimeout: vi.fn().mockResolvedValue(undefined),
  };

  return page as unknown as import('playwright-core').Page;
}

describe('checkInteractiveBehavior', () => {
  it('입력 필드 없음 + 필터/탭 없음 → 표시 전용 페이지, score: 70, passed: true', async () => {
    const page = createInteractivePage({ inputsVisible: false, tabsVisible: false });
    const result = await checkInteractiveBehavior(page);
    expect(result.name).toBe('interactiveBehavior');
    expect(result.passed).toBe(true);
    expect(result.score).toBe(70);
    expect(result.details.some(d => d.includes('없음'))).toBe(true);
  });

  it('입력 필드 있고 DOM 변화 있음, 필터/탭 없음 → score: 80, passed: true', async () => {
    // sub-check 1: found + passed, sub-check 2: not found
    let evaluateCallCount = 0;
    const inputEl = {
      isVisible: vi.fn().mockResolvedValue(true),
      fill: vi.fn().mockResolvedValue(undefined),
      click: vi.fn().mockResolvedValue(undefined),
    };
    const buttonEl = {
      isVisible: vi.fn().mockResolvedValue(true),
      click: vi.fn().mockResolvedValue(undefined),
    };
    const page = {
      $$: vi.fn().mockImplementation((sel: string) => {
        if (sel.includes('input')) return Promise.resolve([inputEl]);
        return Promise.resolve([]);
      }),
      $: vi.fn().mockResolvedValue(buttonEl),
      evaluate: vi.fn().mockImplementation((fn: unknown) => {
        const fnStr = fn?.toString() ?? '';
        evaluateCallCount++;
        if (fnStr.includes('innerText')) {
          return Promise.resolve(evaluateCallCount === 1 ? 'short text' : 'much longer text after interaction wow yes');
        }
        if (fnStr.includes('querySelectorAll')) {
          return Promise.resolve(evaluateCallCount <= 2 ? 5 : 8);
        }
        return Promise.resolve(0);
      }),
      evaluateHandle: vi.fn().mockResolvedValue({ asElement: vi.fn().mockReturnValue(null) }),
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
    } as unknown as import('playwright-core').Page;

    const result = await checkInteractiveBehavior(page);
    expect(result.name).toBe('interactiveBehavior');
    expect(result.passed).toBe(true);
    expect(result.score).toBe(80);
  });

  it('입력 필드 있고 DOM 변화 없음 (버튼만), 필터/탭 없음 → score: 40, passed: false', async () => {
    const inputEl = {
      isVisible: vi.fn().mockResolvedValue(true),
      fill: vi.fn().mockResolvedValue(undefined),
    };
    const buttonEl = {
      isVisible: vi.fn().mockResolvedValue(true),
      click: vi.fn().mockResolvedValue(undefined),
    };
    const page = {
      $$: vi.fn().mockImplementation((sel: string) => {
        if (sel.includes('input')) return Promise.resolve([inputEl]);
        return Promise.resolve([]);
      }),
      $: vi.fn().mockResolvedValue(buttonEl),
      // innerText same before/after; element count same
      evaluate: vi.fn().mockResolvedValue('same text no change'),
      evaluateHandle: vi.fn().mockResolvedValue({ asElement: vi.fn().mockReturnValue(null) }),
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
    } as unknown as import('playwright-core').Page;

    const result = await checkInteractiveBehavior(page);
    expect(result.passed).toBe(false);
    expect(result.score).toBe(40);
    expect(result.details.some(d => d.includes('DOM 변화 없음') || d.includes('없음'))).toBe(true);
  });

  it('입력 필드 없음 + 필터/탭 있고 변화 있음 → score: 80, passed: true', async () => {
    const tabEl = {
      isVisible: vi.fn().mockResolvedValue(true),
      click: vi.fn().mockResolvedValue(undefined),
    };
    let evaluateCallCount = 0;
    const page = {
      $$: vi.fn().mockImplementation((sel: string) => {
        if (sel.includes('input')) return Promise.resolve([]);
        // role=tab selector returns 2 elements
        return Promise.resolve([tabEl, tabEl]);
      }),
      $: vi.fn().mockResolvedValue(null),
      evaluate: vi.fn().mockImplementation((fn: unknown) => {
        const fnStr = fn?.toString() ?? '';
        evaluateCallCount++;
        if (fnStr.includes('li') || fnStr.includes('card')) {
          return Promise.resolve(evaluateCallCount === 1 ? 3 : 6);
        }
        if (fnStr.includes('active') || fnStr.includes('aria-selected')) {
          return Promise.resolve(evaluateCallCount === 2 ? 'tab-a active' : 'tab-b active');
        }
        return Promise.resolve('unchanged text');
      }),
      evaluateHandle: vi.fn().mockResolvedValue({ asElement: vi.fn().mockReturnValue(null) }),
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
    } as unknown as import('playwright-core').Page;

    const result = await checkInteractiveBehavior(page);
    expect(result.name).toBe('interactiveBehavior');
    expect(result.passed).toBe(true);
    expect(result.score).toBe(80);
  });

  it('evaluate 오류 → passed: false, score: 0, details에 에러 메시지', async () => {
    const page = {
      $$: vi.fn().mockRejectedValue(new Error('context destroyed')),
      $: vi.fn().mockResolvedValue(null),
      evaluate: vi.fn().mockRejectedValue(new Error('context destroyed')),
      evaluateHandle: vi.fn().mockRejectedValue(new Error('context destroyed')),
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
    } as unknown as import('playwright-core').Page;

    const result = await checkInteractiveBehavior(page);
    expect(result.name).toBe('interactiveBehavior');
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
    expect(result.details[0]).toContain('Evaluation error');
  });
});

// ---------------------------------------------------------------------------
// 9. runFastQc / runDeepQc — Task 2
// ---------------------------------------------------------------------------

describe('runFastQc', () => {
  let runFastQc: (html: string) => Promise<QcReport | null>;
  let mockedBrowserPool: {
    isQcEnabled: ReturnType<typeof vi.fn>;
    getPage: ReturnType<typeof vi.fn>;
    releasePage: ReturnType<typeof vi.fn>;
  };

  // Rich mock page required by runFastQcInternal
  function createRichMockPage() {
    return {
      on: vi.fn(),
      setViewportSize: vi.fn().mockResolvedValue(undefined),
      setDefaultTimeout: vi.fn(),
      setContent: vi.fn().mockResolvedValue(undefined),
      evaluate: vi.fn().mockResolvedValue({ scrollWidth: 375, clientWidth: 375 }),
      $: vi.fn().mockResolvedValue(null),
      $$: vi.fn().mockResolvedValue([]),
      $$eval: vi.fn().mockResolvedValue([]),
      evaluateHandle: vi.fn().mockResolvedValue({ asElement: vi.fn().mockReturnValue(null) }),
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
    } as unknown as import('playwright-core').Page;
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    // Dynamically import so we get the mocked version
    const mod = await import('./renderingQc');
    runFastQc = mod.runFastQc;
    mockedBrowserPool = (await import('./browserPool')) as unknown as typeof mockedBrowserPool;
  });

  it('isQcEnabled() = false → null 반환', async () => {
    mockedBrowserPool.isQcEnabled.mockReturnValue(false);
    const result = await runFastQc('<html><body></body></html>');
    expect(result).toBeNull();
  });

  it('getPage() = null → null 반환 (QC page pool unavailable)', async () => {
    mockedBrowserPool.isQcEnabled.mockReturnValue(true);
    mockedBrowserPool.getPage.mockResolvedValue(null);
    const result = await runFastQc('<html><body></body></html>');
    expect(result).toBeNull();
  });

  it('정상 동작 → QcReport 반환 (overallScore, passed, checks, viewportsTested)', async () => {
    mockedBrowserPool.isQcEnabled.mockReturnValue(true);
    const mockPage = createRichMockPage();
    // footer exists and is visible
    (mockPage.$ as ReturnType<typeof vi.fn>).mockImplementation((sel: string) => {
      if (sel === 'footer') return Promise.resolve({ isVisible: vi.fn().mockResolvedValue(true) });
      return Promise.resolve(null);
    });
    // evaluate returns no overflow
    (mockPage.evaluate as ReturnType<typeof vi.fn>).mockResolvedValue('clean body text');
    // $$eval for href="#" returns 0
    (mockPage.$$eval as ReturnType<typeof vi.fn>).mockImplementation((sel: string) => {
      if (sel === 'a[href="#"]') return Promise.resolve(0);
      return Promise.resolve([]);
    });
    mockedBrowserPool.getPage.mockResolvedValue(mockPage);

    const result = await runFastQc('<html><body></body></html>');
    expect(result).not.toBeNull();
    expect(typeof result!.overallScore).toBe('number');
    expect(Array.isArray(result!.checks)).toBe(true);
    expect(Array.isArray(result!.viewportsTested)).toBe(true);
    expect(typeof result!.durationMs).toBe('number');
    // releasePage should be called
    expect(mockedBrowserPool.releasePage).toHaveBeenCalledWith(mockPage);
  });

  it('내부 오류 발생 → null 반환, releasePage 호출 보장', async () => {
    mockedBrowserPool.isQcEnabled.mockReturnValue(true);
    const mockPage = createRichMockPage();
    (mockPage.setContent as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('timeout navigating'));
    mockedBrowserPool.getPage.mockResolvedValue(mockPage);

    const result = await runFastQc('<html><body></body></html>');
    expect(result).toBeNull();
    expect(mockedBrowserPool.releasePage).toHaveBeenCalledWith(mockPage);
  });
});

describe('runDeepQc', () => {
  let runDeepQc: (html: string) => Promise<QcReport | null>;
  let mockedBrowserPool: {
    isQcEnabled: ReturnType<typeof vi.fn>;
    getPage: ReturnType<typeof vi.fn>;
    releasePage: ReturnType<typeof vi.fn>;
  };

  function createRichMockPage() {
    return {
      on: vi.fn(),
      setViewportSize: vi.fn().mockResolvedValue(undefined),
      setDefaultTimeout: vi.fn(),
      setContent: vi.fn().mockResolvedValue(undefined),
      evaluate: vi.fn().mockResolvedValue({ scrollWidth: 375, clientWidth: 375 }),
      $: vi.fn().mockResolvedValue(null),
      $$: vi.fn().mockResolvedValue([]),
      $$eval: vi.fn().mockResolvedValue([]),
      evaluateHandle: vi.fn().mockResolvedValue({ asElement: vi.fn().mockReturnValue(null) }),
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
    } as unknown as import('playwright-core').Page;
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('./renderingQc');
    runDeepQc = mod.runDeepQc;
    mockedBrowserPool = (await import('./browserPool')) as unknown as typeof mockedBrowserPool;
  });

  it('isQcEnabled() = false → null 반환', async () => {
    mockedBrowserPool.isQcEnabled.mockReturnValue(false);
    const result = await runDeepQc('<html><body></body></html>');
    expect(result).toBeNull();
  });

  it('getPage() = null → null 반환', async () => {
    mockedBrowserPool.isQcEnabled.mockReturnValue(true);
    mockedBrowserPool.getPage.mockResolvedValue(null);
    const result = await runDeepQc('<html><body></body></html>');
    expect(result).toBeNull();
  });

  it('정상 동작 → QcReport 반환 (checks 배열 포함)', async () => {
    mockedBrowserPool.isQcEnabled.mockReturnValue(true);
    const mockPage = createRichMockPage();
    (mockPage.$ as ReturnType<typeof vi.fn>).mockImplementation((sel: string) => {
      if (sel === 'footer') return Promise.resolve({ isVisible: vi.fn().mockResolvedValue(true) });
      return Promise.resolve(null);
    });
    (mockPage.evaluate as ReturnType<typeof vi.fn>).mockResolvedValue('clean body');
    (mockPage.$$eval as ReturnType<typeof vi.fn>).mockImplementation((sel: string) => {
      if (sel === 'a[href="#"]') return Promise.resolve(0);
      if (sel === 'img') return Promise.resolve([]);
      return Promise.resolve([]);
    });
    mockedBrowserPool.getPage.mockResolvedValue(mockPage);

    const result = await runDeepQc('<html><body></body></html>');
    expect(result).not.toBeNull();
    expect(result!.checks.length).toBeGreaterThan(0);
    expect(mockedBrowserPool.releasePage).toHaveBeenCalledWith(mockPage);
  });

  it('내부 오류 발생 → null 반환, releasePage 호출 보장', async () => {
    mockedBrowserPool.isQcEnabled.mockReturnValue(true);
    const mockPage = createRichMockPage();
    (mockPage.setContent as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('network idle timeout'));
    mockedBrowserPool.getPage.mockResolvedValue(mockPage);

    const result = await runDeepQc('<html><body></body></html>');
    expect(result).toBeNull();
    expect(mockedBrowserPool.releasePage).toHaveBeenCalledWith(mockPage);
  });
});

// ---------------------------------------------------------------------------
// 10. qcChecks deep check functions — Task 5
// ---------------------------------------------------------------------------

describe('checkNetworkActivity', () => {
  it('빈 요청 목록 → passed: false, score: 20 (API 요청 없음)', () => {
    const result = checkNetworkActivity([]);
    expect(result.name).toBe('networkActivity');
    expect(result.passed).toBe(false);
    expect(result.score).toBe(20);
    expect(result.details[0]).toContain('API 요청이 없습니다');
  });

  it('CDN 요청만 있는 경우 → passed: false, score: 20', () => {
    const result = checkNetworkActivity([
      'https://cdn.tailwindcss.com/3.0.0/tailwind.min.css',
      'https://cdn.jsdelivr.net/npm/chart.js',
      'https://unpkg.com/react@18/umd/react.production.min.js',
      'data:text/css;base64,abc123',
    ]);
    expect(result.passed).toBe(false);
    expect(result.score).toBe(20);
  });

  it('실제 API 요청 포함 → passed: true, score: 100', () => {
    const result = checkNetworkActivity([
      'https://api.example.com/data',
      'https://cdn.tailwindcss.com/tailwind.min.css',
    ]);
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.details[0]).toContain('Request:');
  });

  it('모든 요청이 비 CDN → details에 최대 3개만 포함', () => {
    const result = checkNetworkActivity([
      'https://api.example.com/1',
      'https://api.example.com/2',
      'https://api.example.com/3',
      'https://api.example.com/4',
    ]);
    expect(result.passed).toBe(true);
    expect(result.details.length).toBeLessThanOrEqual(3);
  });

  it('cdnjs.cloudflare.com 요청 → CDN으로 필터링', () => {
    const result = checkNetworkActivity([
      'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css',
    ]);
    expect(result.passed).toBe(false);
  });
});

describe('checkLoadingStateDisappears', () => {
  it('스켈레톤 요소 없음 → passed: true, score: 100', async () => {
    const page = createMockPage({
      $$eval: vi.fn().mockResolvedValue(0),
    });
    const result = await checkLoadingStateDisappears(page);
    expect(result.name).toBe('loadingStateDisappears');
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.details[0]).toContain('No loading skeleton');
  });

  it('.animate-pulse 존재 후 사라짐 → passed: true, score: 100', async () => {
    let callCount = 0;
    const page = createMockPage({
      $$eval: vi.fn().mockImplementation(() => {
        callCount++;
        // First call (.animate-pulse check): has element; second set of calls: 0
        return Promise.resolve(callCount === 1 ? 1 : 0);
      }),
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
    });
    const result = await checkLoadingStateDisappears(page);
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
  });

  it('.skeleton 존재 후에도 남아있음 → passed: false, score: 40', async () => {
    // First 4 selectors: return 0 for animate-pulse, 1 for skeleton
    let callCount = 0;
    const page = createMockPage({
      $$eval: vi.fn().mockImplementation((sel: string) => {
        callCount++;
        if (sel === '.skeleton') return Promise.resolve(1);
        return Promise.resolve(0);
      }),
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
    });
    const result = await checkLoadingStateDisappears(page);
    expect(result.passed).toBe(false);
    expect(result.score).toBe(40);
    expect(result.details[0]).toContain('로딩 스켈레톤');
  });

  it('$$eval 오류 → passed: false, score: 0', async () => {
    const page = createMockPage({
      $$eval: vi.fn().mockRejectedValue(new Error('context lost')),
    });
    const result = await checkLoadingStateDisappears(page);
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
    expect(result.details[0]).toContain('context lost');
  });
});

describe('checkAccessibility', () => {
  it('h1·main 모두 있고 헤딩 순서 정상 → passed: true, score: 100', async () => {
    const page = createMockPage({
      $: vi.fn().mockImplementation((sel: string) => {
        if (sel === 'h1' || sel === 'main') return Promise.resolve({});
        return Promise.resolve(null);
      }),
      $$eval: vi.fn().mockResolvedValue([1, 2, 3]),
    });
    const result = await checkAccessibility(page);
    expect(result.name).toBe('accessibility');
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.details).toHaveLength(0);
  });

  it('h1 없음 → passed: false, details에 Missing h1', async () => {
    const page = createMockPage({
      $: vi.fn().mockImplementation((sel: string) => {
        if (sel === 'main') return Promise.resolve({});
        return Promise.resolve(null); // no h1
      }),
      $$eval: vi.fn().mockResolvedValue([2, 3]),
    });
    const result = await checkAccessibility(page);
    expect(result.passed).toBe(false);
    expect(result.details.some(d => d.includes('h1'))).toBe(true);
  });

  it('main 없음 → passed: false, details에 Missing main', async () => {
    const page = createMockPage({
      $: vi.fn().mockImplementation((sel: string) => {
        if (sel === 'h1') return Promise.resolve({});
        return Promise.resolve(null); // no main
      }),
      $$eval: vi.fn().mockResolvedValue([1, 2]),
    });
    const result = await checkAccessibility(page);
    expect(result.passed).toBe(false);
    expect(result.details.some(d => d.includes('main'))).toBe(true);
  });

  it('헤딩 순서 건너뜀 (h1→h3) → noHeadingSkip = false, score 감소', async () => {
    const page = createMockPage({
      $: vi.fn().mockImplementation((sel: string) => {
        if (sel === 'h1' || sel === 'main') return Promise.resolve({});
        return Promise.resolve(null);
      }),
      $$eval: vi.fn().mockResolvedValue([1, 3]), // h1 → h3 skips h2
    });
    const result = await checkAccessibility(page);
    // passed = hasH1 && hasMain = true, but score is reduced because noHeadingSkip = false
    expect(result.score).toBeLessThan(100);
    expect(result.details.some(d => d.includes('skip') || d.includes('Heading'))).toBe(true);
  });

  it('page.$ 오류 → passed: false, details에 에러 메시지', async () => {
    const page = createMockPage({
      $: vi.fn().mockRejectedValue(new Error('frame detached')),
      $$eval: vi.fn().mockResolvedValue([]),
    });
    const result = await checkAccessibility(page);
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
    expect(result.details[0]).toContain('frame detached');
  });
});

describe('checkImageLoading', () => {
  it('img 없음 → passed: true, score: 100', async () => {
    const page = createMockPage({
      $$eval: vi.fn().mockResolvedValue([]),
    });
    const result = await checkImageLoading(page);
    expect(result.name).toBe('imageLoading');
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.details[0]).toContain('No images');
  });

  it('모든 이미지 로드됨 → passed: true, score: 100', async () => {
    const page = createMockPage({
      $$eval: vi.fn().mockResolvedValue([
        { src: 'https://example.com/a.png', loaded: true },
        { src: 'https://example.com/b.png', loaded: true },
      ]),
    });
    const result = await checkImageLoading(page);
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.details).toHaveLength(0);
  });

  it('일부 이미지 실패 → passed: false, score 비례 감소', async () => {
    const page = createMockPage({
      $$eval: vi.fn().mockResolvedValue([
        { src: 'https://example.com/ok.png', loaded: true },
        { src: 'https://example.com/fail.png', loaded: false },
        { src: 'https://example.com/ok2.png', loaded: true },
        { src: 'https://example.com/fail2.png', loaded: false },
      ]),
    });
    const result = await checkImageLoading(page);
    expect(result.passed).toBe(false);
    expect(result.score).toBe(50); // 2/4 loaded
    expect(result.details).toHaveLength(2);
    expect(result.details[0]).toContain('Failed to load');
  });

  it('모든 이미지 실패 → passed: false, score: 0', async () => {
    const page = createMockPage({
      $$eval: vi.fn().mockResolvedValue([
        { src: 'https://broken.com/a.png', loaded: false },
      ]),
    });
    const result = await checkImageLoading(page);
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
  });

  it('$$eval 오류 → passed: false, score: 0', async () => {
    const page = createMockPage({
      $$eval: vi.fn().mockRejectedValue(new Error('context destroyed')),
    });
    const result = await checkImageLoading(page);
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
    expect(result.details[0]).toContain('context destroyed');
  });
});

describe('checkNoLayoutOverlap', () => {
  it('header/main/footer 모두 없음 → passed: true, skipping overlap check', async () => {
    const page = createMockPage({
      $: vi.fn().mockResolvedValue(null),
    });
    const result = await checkNoLayoutOverlap(page);
    expect(result.name).toBe('noLayoutOverlap');
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.details[0]).toContain('skipping');
  });

  it('header·main·footer 존재하고 겹치지 않음 → passed: true, score: 100', async () => {
    const makeEl = (y: number, height: number) => ({
      boundingBox: vi.fn().mockResolvedValue({ x: 0, y, width: 375, height }),
    });
    const page = createMockPage({
      $: vi.fn().mockImplementation((sel: string) => {
        if (sel === 'header') return Promise.resolve(makeEl(0, 60));
        if (sel === 'main, [role="main"]') return Promise.resolve(makeEl(60, 400));
        if (sel === 'footer') return Promise.resolve(makeEl(460, 80));
        return Promise.resolve(null);
      }),
    });
    const result = await checkNoLayoutOverlap(page);
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
  });

  it('header가 main과 겹침 → passed: false, details에 overlap 메시지', async () => {
    const makeEl = (y: number, height: number) => ({
      boundingBox: vi.fn().mockResolvedValue({ x: 0, y, width: 375, height }),
    });
    const page = createMockPage({
      $: vi.fn().mockImplementation((sel: string) => {
        if (sel === 'header') return Promise.resolve(makeEl(0, 100));
        if (sel === 'main, [role="main"]') return Promise.resolve(makeEl(50, 400)); // overlaps with header (100 > 50+2)
        if (sel === 'footer') return Promise.resolve(makeEl(500, 80));
        return Promise.resolve(null);
      }),
    });
    const result = await checkNoLayoutOverlap(page);
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
    expect(result.details[0]).toContain('overlaps');
  });

  it('page.$ 오류 → passed: false, score: 0', async () => {
    const page = createMockPage({
      $: vi.fn().mockRejectedValue(new Error('page crashed')),
    });
    const result = await checkNoLayoutOverlap(page);
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
    expect(result.details[0]).toContain('page crashed');
  });
});

describe('checkNoRuntimePlaceholder', () => {
  it('플레이스홀더 없음 → passed: true, score: 100', async () => {
    const page = createMockPage({
      evaluate: vi.fn().mockResolvedValue('실제 서비스 내용입니다'),
      $$eval: vi.fn().mockResolvedValue(0),
    });
    const result = await checkNoRuntimePlaceholder(page);
    expect(result.name).toBe('noRuntimePlaceholder');
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
  });

  it('"홍길동" 플레이스홀더 감지 → passed: false', async () => {
    const page = createMockPage({
      evaluate: vi.fn().mockResolvedValue('안녕하세요 홍길동 님'),
      $$eval: vi.fn().mockResolvedValue(0),
    });
    const result = await checkNoRuntimePlaceholder(page);
    expect(result.passed).toBe(false);
    expect(result.details.some(d => d.includes('홍길동'))).toBe(true);
  });

  it('"Lorem ipsum" 감지 → passed: false', async () => {
    const page = createMockPage({
      evaluate: vi.fn().mockResolvedValue('Lorem ipsum dolor sit amet'),
      $$eval: vi.fn().mockResolvedValue(0),
    });
    const result = await checkNoRuntimePlaceholder(page);
    expect(result.passed).toBe(false);
  });

  it('href="#" 링크 감지 → passed: false, details에 링크 수 포함', async () => {
    const page = createMockPage({
      evaluate: vi.fn().mockResolvedValue('정상 텍스트'),
      $$eval: vi.fn().mockResolvedValue(3),
    });
    const result = await checkNoRuntimePlaceholder(page);
    expect(result.passed).toBe(false);
    expect(result.details.some(d => d.includes('href="#"') && d.includes('3'))).toBe(true);
  });

  it('evaluate 오류 → passed: false, score: 0', async () => {
    const page = createMockPage({
      evaluate: vi.fn().mockRejectedValue(new Error('execution context was destroyed')),
      $$eval: vi.fn().mockResolvedValue(0),
    });
    const result = await checkNoRuntimePlaceholder(page);
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
    expect(result.details[0]).toContain('execution context was destroyed');
  });

  it('복수 플레이스홀더 → score 비례 감소', async () => {
    const page = createMockPage({
      evaluate: vi.fn().mockResolvedValue('홍길동 김철수 Loading... TBD'),
      $$eval: vi.fn().mockResolvedValue(0),
    });
    const result = await checkNoRuntimePlaceholder(page);
    expect(result.passed).toBe(false);
    expect(result.score).toBeLessThan(100);
    expect(result.score).toBeGreaterThanOrEqual(0);
  });
});

describe('checkResponsiveBreakpoints', () => {
  it('모든 뷰포트에서 overflow 없음 → passed: true, score: 100', async () => {
    const page = createMockPage({
      setViewportSize: vi.fn().mockResolvedValue(undefined),
      evaluate: vi.fn().mockResolvedValue({ scrollWidth: 375, clientWidth: 375 }),
    });
    const result = await checkResponsiveBreakpoints(page);
    expect(result.name).toBe('responsiveBreakpoints');
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.details).toHaveLength(0);
  });

  it('일부 뷰포트에서 overflow → score 비례 감소', async () => {
    let callCount = 0;
    const page = createMockPage({
      setViewportSize: vi.fn().mockResolvedValue(undefined),
      evaluate: vi.fn().mockImplementation(() => {
        callCount++;
        // 375px: overflow, 768px: ok, 1280px: ok
        if (callCount === 1) return Promise.resolve({ scrollWidth: 400, clientWidth: 375 });
        return Promise.resolve({ scrollWidth: 768, clientWidth: 768 });
      }),
    });
    const result = await checkResponsiveBreakpoints(page);
    expect(result.passed).toBe(false);
    // 2/3 passing → score ≈ 67
    expect(result.score).toBeCloseTo(67, 0);
    expect(result.details[0]).toContain('375px');
  });

  it('모든 뷰포트에서 overflow → passed: false, score: 0', async () => {
    const page = createMockPage({
      setViewportSize: vi.fn().mockResolvedValue(undefined),
      evaluate: vi.fn().mockResolvedValue({ scrollWidth: 2000, clientWidth: 375 }),
    });
    const result = await checkResponsiveBreakpoints(page);
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
    expect(result.details).toHaveLength(3);
  });

  it('evaluate 오류 → passed: false, score: 0', async () => {
    const page = createMockPage({
      setViewportSize: vi.fn().mockResolvedValue(undefined),
      evaluate: vi.fn().mockRejectedValue(new Error('context gone')),
    });
    const result = await checkResponsiveBreakpoints(page);
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
    expect(result.details[0]).toContain('context gone');
  });
});
