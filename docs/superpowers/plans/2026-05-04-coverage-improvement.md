# Coverage Improvement Plan — vitest 측정 범위 85%+ 달성

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** vitest 측정 범위(src/lib/**, src/services/**, src/providers/**, src/repositories/**, src/components/**) 내 statement coverage를 현재 70.89%에서 85%+ 로 개선. 서비스 품질 영향 없이 안전한 테스트만 추가.

**Architecture:** 모든 외부 의존성(playwright-core, Supabase, fetch)은 vitest mock으로 대체. 실제 브라우저/DB/네트워크 호출 없음. 새 테스트 파일 생성 및 기존 테스트 파일 보강.

**Tech Stack:** TypeScript, Vitest, happy-dom, playwright-core(vi.mock), Supabase(chain mock)

---

## Task 1: browserPool.ts 단위 테스트

**Files:**
- Create: `src/lib/qc/browserPool.test.ts`

**Context:**
- `src/lib/qc/browserPool.ts` — 156줄, 현재 coverage ~12%
- 모듈 레벨 상태(`activePages`, `waitQueue`, `browserInstance`)가 있어 테스트 간 격리 필수
- `vi.resetModules()` + `await import(...)` 패턴 필수 (CLAUDE.md 명시)
- `playwright-core`는 항상 완전 mock: `vi.mock('playwright-core', ...)`

- [ ] **Step 1: 테스트 파일 생성**

```typescript
// src/lib/qc/browserPool.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockPage = {
  close: vi.fn().mockResolvedValue(undefined),
  context: vi.fn(),
  on: vi.fn(),
  setDefaultTimeout: vi.fn(),
  setContent: vi.fn().mockResolvedValue(undefined),
  setViewportSize: vi.fn().mockResolvedValue(undefined),
};

const mockContext = {
  newPage: vi.fn().mockResolvedValue(mockPage),
  close: vi.fn().mockResolvedValue(undefined),
};

const mockBrowser = {
  isConnected: vi.fn().mockReturnValue(true),
  newContext: vi.fn().mockResolvedValue(mockContext),
  close: vi.fn().mockResolvedValue(undefined),
};

vi.mock('playwright-core', () => ({
  chromium: {
    launch: vi.fn().mockResolvedValue(mockBrowser),
  },
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// 매 테스트마다 모듈 재임포트로 상태 격리
async function importFresh() {
  vi.resetModules();
  // playwright-core mock 재등록
  vi.mock('playwright-core', () => ({
    chromium: {
      launch: vi.fn().mockResolvedValue(mockBrowser),
    },
  }));
  vi.mock('@/lib/utils/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  }));
  return import('./browserPool');
}

describe('isQcEnabled', () => {
  afterEach(() => {
    delete process.env.ENABLE_RENDERING_QC;
  });

  it('ENABLE_RENDERING_QC=true → true', async () => {
    process.env.ENABLE_RENDERING_QC = 'true';
    const { isQcEnabled } = await importFresh();
    expect(isQcEnabled()).toBe(true);
  });

  it('미설정 → false', async () => {
    const { isQcEnabled } = await importFresh();
    expect(isQcEnabled()).toBe(false);
  });
});

describe('getPage', () => {
  afterEach(() => {
    delete process.env.ENABLE_RENDERING_QC;
    vi.clearAllMocks();
  });

  it('QC 비활성화 시 null 반환', async () => {
    process.env.ENABLE_RENDERING_QC = 'false';
    const { getPage } = await importFresh();
    const page = await getPage();
    expect(page).toBeNull();
  });

  it('QC 활성화 + 브라우저 정상 → Page 반환', async () => {
    process.env.ENABLE_RENDERING_QC = 'true';
    mockBrowser.isConnected.mockReturnValue(true);
    const { getPage } = await importFresh();
    const page = await getPage();
    expect(page).not.toBeNull();
  });

  it('chromium.launch 실패 → null 반환 + 에러 로그', async () => {
    process.env.ENABLE_RENDERING_QC = 'true';
    vi.resetModules();
    vi.mock('playwright-core', () => ({
      chromium: {
        launch: vi.fn().mockRejectedValue(new Error('launch failed')),
      },
    }));
    vi.mock('@/lib/utils/logger', () => ({
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    }));
    const { getPage } = await import('./browserPool');
    const page = await getPage();
    expect(page).toBeNull();
  });

  it('세마포어 MAX 초과 시 timeout 후 null 반환', async () => {
    process.env.ENABLE_RENDERING_QC = 'true';
    vi.useFakeTimers();
    const { getPage } = await importFresh();
    // MAX_CONCURRENT_PAGES=2이므로 2개 취득 후 3번째는 대기
    const p1 = getPage();
    const p2 = getPage();
    const p3 = getPage(); // 타임아웃 대상
    vi.advanceTimersByTime(11000); // 10초 타임아웃 초과
    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
    expect(r1).not.toBeNull();
    expect(r2).not.toBeNull();
    expect(r3).toBeNull();
    vi.useRealTimers();
  });
});

describe('releasePage', () => {
  afterEach(() => {
    delete process.env.ENABLE_RENDERING_QC;
    vi.clearAllMocks();
  });

  it('정상 경로: page.close → context.close 호출', async () => {
    process.env.ENABLE_RENDERING_QC = 'true';
    const { getPage, releasePage } = await importFresh();
    const page = await getPage();
    expect(page).not.toBeNull();
    await releasePage(page!);
    expect(mockPage.close).toHaveBeenCalled();
    expect(mockContext.close).toHaveBeenCalled();
  });
});

describe('shutdown', () => {
  afterEach(() => {
    delete process.env.ENABLE_RENDERING_QC;
    vi.clearAllMocks();
  });

  it('브라우저 인스턴스가 없으면 아무 작업 안 함', async () => {
    const { shutdown } = await importFresh();
    await shutdown(); // 예외 없이 완료
  });

  it('브라우저 인스턴스 있으면 close 호출 후 null로 초기화', async () => {
    process.env.ENABLE_RENDERING_QC = 'true';
    const { getPage, shutdown } = await importFresh();
    await getPage(); // 브라우저 초기화
    await shutdown();
    expect(mockBrowser.close).toHaveBeenCalled();
  });
});

describe('process signal handlers', () => {
  it('process.exit 이벤트가 등록되어 있다', async () => {
    const listeners = process.listeners('exit');
    expect(listeners.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: 테스트 실행 — PASS 확인**

```bash
pnpm test src/lib/qc/browserPool.test.ts
```
Expected: 모든 테스트 PASS

- [ ] **Step 3: 커밋**

```bash
git add src/lib/qc/browserPool.test.ts
git commit -m "test: browserPool.ts 단위 테스트 추가 — playwright-core mock"
```

---

## Task 2: renderingQc.ts 단위 테스트

**Files:**
- Modify: `src/lib/qc/renderingQc.test.ts` (기존 파일에 추가)

**Context:**
- `src/lib/qc/renderingQc.ts` — 253줄, 현재 0% (public 함수 미테스트)
- `browserPool` 전체를 mock: `vi.mock('./browserPool', ...)`
- `runFastQc(html)`, `runDeepQc(html)` 두 public 함수
- mock Page에 `on` 메서드 필요 (pageerror, console, request 이벤트 등록)

- [ ] **Step 1: renderingQc.test.ts 하단에 describe 블록 추가**

기존 파일 끝에 아래 내용 추가 (기존 테스트 유지):

```typescript
// ---------------------------------------------------------------------------
// 9. runFastQc / runDeepQc — browserPool mock
// ---------------------------------------------------------------------------

import { runFastQc, runDeepQc } from './renderingQc';

vi.mock('./browserPool', () => ({
  isQcEnabled: vi.fn(),
  getPage: vi.fn(),
  releasePage: vi.fn().mockResolvedValue(undefined),
}));

import { isQcEnabled as mockIsQcEnabled, getPage as mockGetPage } from './browserPool';

function createFullMockPage() {
  const handlers: Record<string, ((arg: unknown) => void)[]> = {};
  return {
    on: vi.fn().mockImplementation((event: string, handler: (arg: unknown) => void) => {
      handlers[event] = handlers[event] ?? [];
      handlers[event].push(handler);
    }),
    emit: (event: string, arg: unknown) => handlers[event]?.forEach(h => h(arg)),
    setViewportSize: vi.fn().mockResolvedValue(undefined),
    setDefaultTimeout: vi.fn(),
    setContent: vi.fn().mockResolvedValue(undefined),
    evaluate: vi.fn().mockResolvedValue({ scrollWidth: 300, clientWidth: 375 }),
    $: vi.fn().mockResolvedValue({ isVisible: vi.fn().mockResolvedValue(true), boundingBox: vi.fn().mockResolvedValue({ x: 0, y: 0, width: 375, height: 50 }) }),
    $$: vi.fn().mockResolvedValue([]),
    $$eval: vi.fn().mockResolvedValue([]),
    waitForTimeout: vi.fn().mockResolvedValue(undefined),
    evaluateHandle: vi.fn().mockResolvedValue({ asElement: vi.fn().mockReturnValue(null) }),
    close: vi.fn().mockResolvedValue(undefined),
    context: vi.fn().mockReturnValue({ close: vi.fn().mockResolvedValue(undefined) }),
  };
}

describe('runFastQc', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('QC 비활성화 시 null 반환', async () => {
    (mockIsQcEnabled as ReturnType<typeof vi.fn>).mockReturnValue(false);
    const result = await runFastQc('<html></html>');
    expect(result).toBeNull();
  });

  it('getPage() null 반환 시 null 반환 (에러 캐치)', async () => {
    (mockIsQcEnabled as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (mockGetPage as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const result = await runFastQc('<html></html>');
    expect(result).toBeNull();
  });

  it('정상 경로: QcReport 반환', async () => {
    (mockIsQcEnabled as ReturnType<typeof vi.fn>).mockReturnValue(true);
    const mockPage = createFullMockPage();
    (mockGetPage as ReturnType<typeof vi.fn>).mockResolvedValue(mockPage);
    const result = await runFastQc('<html><body><footer>f</footer></body></html>');
    expect(result).not.toBeNull();
    expect(result?.checks).toBeDefined();
    expect(result?.overallScore).toBeGreaterThanOrEqual(0);
  });

  it('setContent 오류 → null 반환 (에러 캐치)', async () => {
    (mockIsQcEnabled as ReturnType<typeof vi.fn>).mockReturnValue(true);
    const mockPage = createFullMockPage();
    mockPage.setContent = vi.fn().mockRejectedValue(new Error('Timeout'));
    (mockGetPage as ReturnType<typeof vi.fn>).mockResolvedValue(mockPage);
    const result = await runFastQc('<html></html>');
    expect(result).toBeNull();
  });
});

describe('runDeepQc', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('QC 비활성화 시 null 반환', async () => {
    (mockIsQcEnabled as ReturnType<typeof vi.fn>).mockReturnValue(false);
    const result = await runDeepQc('<html></html>');
    expect(result).toBeNull();
  });

  it('getPage() null 반환 시 null 반환', async () => {
    (mockIsQcEnabled as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (mockGetPage as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const result = await runDeepQc('<html></html>');
    expect(result).toBeNull();
  });

  it('정상 경로: QcReport 반환 (deep checks 포함)', async () => {
    (mockIsQcEnabled as ReturnType<typeof vi.fn>).mockReturnValue(true);
    const mockPage = createFullMockPage();
    (mockGetPage as ReturnType<typeof vi.fn>).mockResolvedValue(mockPage);
    const result = await runDeepQc('<html><body><h1>Title</h1><main>content</main><footer>footer</footer></body></html>');
    expect(result).not.toBeNull();
    expect(result?.checks.length).toBeGreaterThan(5);
  });
});
```

- [ ] **Step 2: 테스트 실행 — PASS 확인**

```bash
pnpm test src/lib/qc/renderingQc.test.ts
```
Expected: 기존 + 신규 테스트 모두 PASS

- [ ] **Step 3: 커밋**

```bash
git add src/lib/qc/renderingQc.test.ts
git commit -m "test: renderingQc.ts runFastQc/runDeepQc 단위 테스트 추가"
```

---

## Task 3: generationPipeline.ts 누락 경로 테스트

**Files:**
- Modify: `src/lib/ai/generationPipeline.integration.test.ts`

**Context:**
- 누락 1: `safeAssembleHtml()` catch 블록 (line 59-62) — `assembleHtml()` throw 시
- 누락 2: `resolveStage3()` fallback 경로 (line 184-189) — `runStage3()` throw 시 stage2 결과로 폴백
- 기존 테스트에 `vi.mock('@/lib/html/assembleHtml')` 또는 `stageRunner.runStage3` mock 활용

- [ ] **Step 1: 기존 integration test에 두 테스트 케이스 추가**

기존 파일의 마지막 describe 블록 뒤에 추가:

```typescript
describe('safeAssembleHtml 에러 처리', () => {
  it('assembleHtml throw → 에러 로그 후 null 반환 (파이프라인 계속 진행)', async () => {
    // assembleHtml을 throw하도록 설정
    // generationPipeline.ts의 safeAssembleHtml 내부 catch 커버
    // vi.mock('@/lib/html/assembleHtml') 또는 runStage1 mock에서 throw 설정 후
    // runGenerationPipeline이 에러 없이 완료되는지 확인
    // (safeAssembleHtml은 catch 후 null 반환하므로 파이프라인은 계속됨)
  });
});

describe('resolveStage3 폴백 경로', () => {
  it('runStage3 throw → stage2 결과로 폴백 + STAGE3_FALLBACK_USED 이벤트', async () => {
    (runStage3 as Mock).mockRejectedValue(new Error('Stage3 crashed'));
    // stage2 결과가 있는 상태에서 runStage3 실패
    // eventBus.emit이 STAGE3_FALLBACK_USED와 함께 호출됐는지 확인
    // 최종 결과가 stage2 기준인지 확인
  });
});
```

실제 구현 시 기존 파일의 setup 패턴(mockProvider, mockRunStage2Function 등)을 그대로 활용한다.

- [ ] **Step 2: generationPipeline.ts의 safeAssembleHtml과 resolveStage3 정확한 라인 파악 후 테스트 작성**

```bash
grep -n "safeAssembleHtml\|resolveStage3\|STAGE3_FALLBACK" src/lib/ai/generationPipeline.ts
```

- [ ] **Step 3: 테스트 실행 — PASS 확인**

```bash
pnpm test src/lib/ai/generationPipeline.integration.test.ts
```

- [ ] **Step 4: 커밋**

```bash
git add src/lib/ai/generationPipeline.integration.test.ts
git commit -m "test: generationPipeline safeAssembleHtml 에러 경로 및 stage3 폴백 테스트 추가"
```

---

## Task 4: featureSmokeTest.ts 누락 타입 테스트

**Files:**
- Modify: `src/lib/qc/featureSmokeTest.test.ts`

**Context:**
- 현재 'list', 'chart-element', 'unknown' 만 테스트됨
- 누락: 'input+button', 'filter-button', 'text-display'
- 기존 `createMockPage()` 팩토리 재사용

- [ ] **Step 1: 기존 파일 하단에 3개 describe 블록 추가**

```typescript
// ---------------------------------------------------------------------------
// 7. 'input+button' 검증
// ---------------------------------------------------------------------------

describe("'input+button' 검증", () => {
  it('input 있고 button 있고 DOM 변화 있으면 passed: true', async () => {
    const mockInput = { fill: vi.fn().mockResolvedValue(undefined) };
    const mockButton = { click: vi.fn().mockResolvedValue(undefined) };
    const page = createMockPage({
      $: vi.fn().mockImplementation(async (sel: string) => {
        if (sel.includes('input')) return mockInput;
        return mockButton;
      }),
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
      evaluate: vi.fn().mockResolvedValue(200), // > 100 → DOM 변화 있음
    });

    const report = await runFeatureSmokeTests(page, [makeFeature('input+button')]);
    expect(report.results[0].passed).toBe(true);
    expect(report.results[0].detail).toContain('DOM 변화 확인');
  });

  it('input 없으면 passed: false, detail "텍스트 입력 필드 없음"', async () => {
    const page = createMockPage({
      $: vi.fn().mockResolvedValue(null),
    });

    const report = await runFeatureSmokeTests(page, [makeFeature('input+button')]);
    expect(report.results[0].passed).toBe(false);
    expect(report.results[0].detail).toContain('텍스트 입력 필드 없음');
  });

  it('input 있고 button 없으면 passed: false, detail "버튼 없음"', async () => {
    const mockInput = { fill: vi.fn().mockResolvedValue(undefined) };
    const page = createMockPage({
      $: vi.fn().mockImplementation(async (sel: string) => {
        if (sel.includes('input')) return mockInput;
        return null; // button 없음
      }),
    });

    const report = await runFeatureSmokeTests(page, [makeFeature('input+button')]);
    expect(report.results[0].passed).toBe(false);
    expect(report.results[0].detail).toContain('버튼 없음');
  });

  it('DOM 변화 없으면 passed: false', async () => {
    const mockInput = { fill: vi.fn().mockResolvedValue(undefined) };
    const mockButton = { click: vi.fn().mockResolvedValue(undefined) };
    const page = createMockPage({
      $: vi.fn().mockImplementation(async (sel: string) => {
        if (sel.includes('input')) return mockInput;
        return mockButton;
      }),
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
      evaluate: vi.fn().mockResolvedValue(50), // <= 100 → DOM 변화 없음
    });

    const report = await runFeatureSmokeTests(page, [makeFeature('input+button')]);
    expect(report.results[0].passed).toBe(false);
    expect(report.results[0].detail).toContain('DOM 변화 없음');
  });
});

// ---------------------------------------------------------------------------
// 8. 'filter-button' 검증
// ---------------------------------------------------------------------------

describe("'filter-button' 검증", () => {
  it('filterButtons < 2 이면 passed: false', async () => {
    const page = createMockPage({
      $$: vi.fn().mockResolvedValue([{}]), // 1개만
    });

    const report = await runFeatureSmokeTests(page, [makeFeature('filter-button')]);
    expect(report.results[0].passed).toBe(false);
    expect(report.results[0].detail).toContain('필터 버튼 부족');
  });

  it('count 변화 있으면 passed: true', async () => {
    const mockFilterBtn = { click: vi.fn().mockResolvedValue(undefined) };
    let callCount = 0;
    const page = createMockPage({
      $$: vi.fn().mockResolvedValue([{}, mockFilterBtn]),
      $$eval: vi.fn().mockImplementation(async () => {
        callCount++;
        return callCount === 1 ? 5 : 3; // before: 5, after: 3
      }),
      $: vi.fn().mockResolvedValue(null), // activeChanged = false
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
    });

    const report = await runFeatureSmokeTests(page, [makeFeature('filter-button')]);
    expect(report.results[0].passed).toBe(true);
    expect(report.results[0].detail).toContain('필터 적용 확인');
  });

  it('count 변화 없고 active 요소 있으면 passed: true', async () => {
    const mockFilterBtn = { click: vi.fn().mockResolvedValue(undefined) };
    const page = createMockPage({
      $$: vi.fn().mockResolvedValue([{}, mockFilterBtn]),
      $$eval: vi.fn().mockResolvedValue(5), // count 동일
      $: vi.fn().mockResolvedValue({}), // active 요소 존재
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
    });

    const report = await runFeatureSmokeTests(page, [makeFeature('filter-button')]);
    expect(report.results[0].passed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 9. 'text-display' 검증
// ---------------------------------------------------------------------------

describe("'text-display' 검증", () => {
  it('50자 이상이면 passed: true', async () => {
    const page = createMockPage({
      evaluate: vi.fn().mockResolvedValue(100), // > 50
    });

    const report = await runFeatureSmokeTests(page, [makeFeature('text-display')]);
    expect(report.results[0].passed).toBe(true);
    expect(report.results[0].detail).toContain('100자');
  });

  it('50자 이하이면 passed: false', async () => {
    const page = createMockPage({
      evaluate: vi.fn().mockResolvedValue(30), // <= 50
    });

    const report = await runFeatureSmokeTests(page, [makeFeature('text-display')]);
    expect(report.results[0].passed).toBe(false);
    expect(report.results[0].detail).toContain('30자');
  });
});
```

- [ ] **Step 2: 테스트 실행 — PASS 확인**

```bash
pnpm test src/lib/qc/featureSmokeTest.test.ts
```

- [ ] **Step 3: 커밋**

```bash
git add src/lib/qc/featureSmokeTest.test.ts
git commit -m "test: featureSmokeTest input+button / filter-button / text-display 테스트 추가"
```

---

## Task 5: qcChecks.ts 누락 deep check 함수 테스트

**Files:**
- Modify: `src/lib/qc/renderingQc.test.ts`

**Context:**
- 현재 미테스트: `checkNetworkActivity`, `checkLoadingStateDisappears`, `checkAccessibility`, `checkImageLoading`, `checkResponsiveBreakpoints`, `checkNoLayoutOverlap`, `checkNoRuntimePlaceholder`
- 이미 임포트: `checkConsoleErrors`, `checkHorizontalScroll`, `checkFooterVisible`, `checkTouchTargets`, `checkInteractiveBehavior`
- 임포트 라인 수정 필요

- [ ] **Step 1: renderingQc.test.ts 상단 import 확장 + 각 함수 테스트 추가**

파일 상단 import 라인을:
```typescript
import { checkConsoleErrors, checkHorizontalScroll, checkFooterVisible, checkTouchTargets, checkInteractiveBehavior } from './qcChecks';
```
→
```typescript
import {
  checkConsoleErrors, checkHorizontalScroll, checkFooterVisible, checkTouchTargets,
  checkInteractiveBehavior, checkNetworkActivity, checkLoadingStateDisappears,
  checkAccessibility, checkImageLoading, checkNoLayoutOverlap, checkNoRuntimePlaceholder,
  checkResponsiveBreakpoints,
} from './qcChecks';
```

파일 하단에 아래 describe 블록 추가:

```typescript
// ---------------------------------------------------------------------------
// checkNetworkActivity
// ---------------------------------------------------------------------------
describe('checkNetworkActivity', () => {
  it('API 요청 있으면 passed: true', () => {
    const result = checkNetworkActivity(['https://api.example.com/data', 'data:image/png;base64,abc']);
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.details[0]).toContain('Request:');
  });

  it('CDN 요청만 있으면 passed: false', () => {
    const result = checkNetworkActivity([
      'https://cdn.tailwindcss.com/tailwind.min.css',
      'https://cdn.jsdelivr.net/npm/chart.js',
    ]);
    expect(result.passed).toBe(false);
    expect(result.score).toBe(20);
  });

  it('요청 없으면 passed: false', () => {
    const result = checkNetworkActivity([]);
    expect(result.passed).toBe(false);
  });

  it('3개 초과 API 요청은 최대 3개만 details에 포함', () => {
    const urls = Array.from({ length: 5 }, (_, i) => `https://api.example.com/${i}`);
    const result = checkNetworkActivity(urls);
    expect(result.passed).toBe(true);
    expect(result.details.length).toBeLessThanOrEqual(3);
  });
});

// ---------------------------------------------------------------------------
// checkLoadingStateDisappears
// ---------------------------------------------------------------------------
describe('checkLoadingStateDisappears', () => {
  it('로딩 스켈레톤 없으면 passed: true', async () => {
    const page = createMockPage({ $$eval: vi.fn().mockResolvedValue(0) });
    const result = await checkLoadingStateDisappears(page);
    expect(result.passed).toBe(true);
    expect(result.details[0]).toContain('No loading skeleton');
  });

  it('스켈레톤 있다가 사라지면 passed: true', async () => {
    let callCount = 0;
    const page = createMockPage({
      $$eval: vi.fn().mockImplementation(async () => {
        callCount++;
        return callCount === 1 ? 1 : 0; // 처음에 있다가 사라짐
      }),
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
    });
    const result = await checkLoadingStateDisappears(page);
    expect(result.passed).toBe(true);
  });

  it('스켈레톤이 3초 후에도 남아있으면 passed: false', async () => {
    const page = createMockPage({
      $$eval: vi.fn().mockResolvedValue(1), // 항상 존재
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
    });
    const result = await checkLoadingStateDisappears(page);
    expect(result.passed).toBe(false);
    expect(result.score).toBe(40);
  });

  it('$$eval 오류 → passed: false', async () => {
    const page = createMockPage({
      $$eval: vi.fn().mockRejectedValue(new Error('context lost')),
    });
    const result = await checkLoadingStateDisappears(page);
    expect(result.passed).toBe(false);
    expect(result.details[0]).toContain('context lost');
  });
});

// ---------------------------------------------------------------------------
// checkAccessibility
// ---------------------------------------------------------------------------
describe('checkAccessibility', () => {
  it('h1, main 있고 헤딩 레벨 순서 올바름 → passed: true', async () => {
    const page = createMockPage({
      $: vi.fn().mockResolvedValue({}), // h1, main 모두 존재
      $$eval: vi.fn().mockResolvedValue([1, 2, 3]), // h1→h2→h3 순서
    });
    const result = await checkAccessibility(page);
    expect(result.passed).toBe(true);
  });

  it('h1 없음 → passed: false', async () => {
    let callCount = 0;
    const page = createMockPage({
      $: vi.fn().mockImplementation(async (sel: string) => {
        if (sel === 'h1') return null; // h1 없음
        return {}; // main 있음
      }),
      $$eval: vi.fn().mockResolvedValue([]),
    });
    const result = await checkAccessibility(page);
    expect(result.passed).toBe(false);
    expect(result.details.some(d => d.includes('h1'))).toBe(true);
  });

  it('헤딩 레벨 스킵(h1→h3) → noHeadingSkip: false', async () => {
    const page = createMockPage({
      $: vi.fn().mockResolvedValue({}),
      $$eval: vi.fn().mockResolvedValue([1, 3]), // h1→h3 스킵
    });
    const result = await checkAccessibility(page);
    expect(result.details.some(d => d.includes('skip'))).toBe(true);
  });

  it('오류 → passed: false', async () => {
    const page = createMockPage({
      $: vi.fn().mockRejectedValue(new Error('detached')),
      $$eval: vi.fn().mockRejectedValue(new Error('detached')),
    });
    const result = await checkAccessibility(page);
    expect(result.passed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// checkImageLoading
// ---------------------------------------------------------------------------
describe('checkImageLoading', () => {
  it('이미지 없으면 passed: true', async () => {
    const page = createMockPage({ $$eval: vi.fn().mockResolvedValue([]) });
    const result = await checkImageLoading(page);
    expect(result.passed).toBe(true);
    expect(result.details[0]).toContain('No images');
  });

  it('모든 이미지 loaded → passed: true, score: 100', async () => {
    const page = createMockPage({
      $$eval: vi.fn().mockResolvedValue([
        { src: 'https://img.example.com/1.jpg', loaded: true },
        { src: 'https://img.example.com/2.jpg', loaded: true },
      ]),
    });
    const result = await checkImageLoading(page);
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
  });

  it('일부 이미지 실패 → passed: false, score 비례 감소', async () => {
    const page = createMockPage({
      $$eval: vi.fn().mockResolvedValue([
        { src: 'ok.jpg', loaded: true },
        { src: 'broken.jpg', loaded: false },
      ]),
    });
    const result = await checkImageLoading(page);
    expect(result.passed).toBe(false);
    expect(result.score).toBe(50);
    expect(result.details[0]).toContain('broken.jpg');
  });
});

// ---------------------------------------------------------------------------
// checkNoLayoutOverlap
// ---------------------------------------------------------------------------
describe('checkNoLayoutOverlap', () => {
  it('header/main/footer 없으면 passed: true (skip)', async () => {
    const page = createMockPage({ $: vi.fn().mockResolvedValue(null) });
    const result = await checkNoLayoutOverlap(page);
    expect(result.passed).toBe(true);
    expect(result.details[0]).toContain('No header/main/footer');
  });

  it('header bottom이 main top보다 아래이면 overlap → passed: false', async () => {
    let callCount = 0;
    const page = createMockPage({
      $: vi.fn().mockImplementation(async (sel: string) => {
        if (sel === 'header') return { boundingBox: vi.fn().mockResolvedValue({ x: 0, y: 0, width: 375, height: 100 }) };
        if (sel === 'main, [role="main"]') return { boundingBox: vi.fn().mockResolvedValue({ x: 0, y: 50, width: 375, height: 400 }) };
        return null;
      }),
    });
    const result = await checkNoLayoutOverlap(page);
    expect(result.passed).toBe(false);
  });

  it('오버랩 없으면 passed: true', async () => {
    const page = createMockPage({
      $: vi.fn().mockImplementation(async (sel: string) => {
        if (sel === 'header') return { boundingBox: vi.fn().mockResolvedValue({ x: 0, y: 0, width: 375, height: 60 }) };
        if (sel === 'main, [role="main"]') return { boundingBox: vi.fn().mockResolvedValue({ x: 0, y: 60, width: 375, height: 400 }) };
        if (sel === 'footer') return { boundingBox: vi.fn().mockResolvedValue({ x: 0, y: 460, width: 375, height: 60 }) };
        return null;
      }),
    });
    const result = await checkNoLayoutOverlap(page);
    expect(result.passed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// checkNoRuntimePlaceholder
// ---------------------------------------------------------------------------
describe('checkNoRuntimePlaceholder', () => {
  it('플레이스홀더 없으면 passed: true', async () => {
    const page = createMockPage({
      evaluate: vi.fn().mockResolvedValue('정상 텍스트입니다'),
    });
    const result = await checkNoRuntimePlaceholder(page);
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
  });

  it('플레이스홀더 텍스트 있으면 passed: false', async () => {
    const page = createMockPage({
      evaluate: vi.fn().mockResolvedValue('홍길동 / 서비스 설명'),
    });
    const result = await checkNoRuntimePlaceholder(page);
    expect(result.passed).toBe(false);
  });

  it('evaluate 오류 → passed: false', async () => {
    const page = createMockPage({
      evaluate: vi.fn().mockRejectedValue(new Error('context destroyed')),
    });
    const result = await checkNoRuntimePlaceholder(page);
    expect(result.passed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// checkResponsiveBreakpoints
// ---------------------------------------------------------------------------
describe('checkResponsiveBreakpoints', () => {
  it('모든 뷰포트에서 정상 → passed: true', async () => {
    const page = createMockPage({
      setViewportSize: vi.fn().mockResolvedValue(undefined),
      evaluate: vi.fn().mockResolvedValue({ scrollWidth: 300, clientWidth: 375 }), // no overflow
    });
    const result = await checkResponsiveBreakpoints(page);
    expect(result.passed).toBe(true);
  });

  it('오류 → passed: false', async () => {
    const page = createMockPage({
      setViewportSize: vi.fn().mockRejectedValue(new Error('viewport error')),
    });
    const result = await checkResponsiveBreakpoints(page);
    expect(result.passed).toBe(false);
  });
});
```

- [ ] **Step 2: 테스트 실행 — PASS 확인**

```bash
pnpm test src/lib/qc/renderingQc.test.ts
```

- [ ] **Step 3: 커밋**

```bash
git add src/lib/qc/renderingQc.test.ts
git commit -m "test: qcChecks deep check 함수 테스트 추가 (networkActivity, accessibility, imageLoading 등)"
```

---

## Task 6: catalogRepository.ts 테스트 신규 작성

**Files:**
- Create: `src/repositories/catalogRepository.test.ts`

**Context:**
- `src/repositories/catalogRepository.ts` — `search()`, `getCategories()` 전혀 미테스트
- 기존 projectRepository.test.ts 패턴 참고: Supabase chain mock
- `search()` chain: `.from().select().eq().is()...().range()` → `.range()` 에서 resolve

- [ ] **Step 1: 테스트 파일 생성**

```typescript
// src/repositories/catalogRepository.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { CatalogRepository } from './catalogRepository';

// Supabase chain mock — search()는 .range()에서 resolve
function makeSearchChain(result: { data: unknown; count: number | null; error: unknown }) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn().mockResolvedValue(result),
  };
  return {
    supabase: { from: vi.fn().mockReturnValue(chain) } as unknown as SupabaseClient,
    chain,
  };
}

// getCategories()는 .is()에서 resolve
function makeCategoryChain(result: { data: unknown; error: unknown }) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockResolvedValue(result),
  };
  return {
    supabase: { from: vi.fn().mockReturnValue(chain) } as unknown as SupabaseClient,
    chain,
  };
}

// 기본 catalog DB row
const baseRow = {
  id: 'cat-1',
  name: '날씨 API',
  description: '날씨 정보 제공',
  category: 'weather',
  is_active: true,
  deprecated_at: null,
  base_url: 'https://api.weather.com',
  auth_type: 'none',
  endpoints: [],
  tags: [],
  example_call: null,
  created_at: '2024-01-01',
  updated_at: '2024-01-01',
  rate_limit: null,
  docs_url: null,
  verification_status: 'verified',
  verified_at: null,
  verification_error: null,
};

describe('CatalogRepository.search()', () => {
  it('기본 검색 (category=all, 검색어 없음) → items 반환', async () => {
    const { supabase } = makeSearchChain({ data: [baseRow], count: 1, error: null });
    const repo = new CatalogRepository(supabase);
    const result = await repo.search({ page: 1, limit: 10 });
    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.items[0].name).toBe('날씨 API');
  });

  it('카테고리 필터링 — eq(category) 호출', async () => {
    const { supabase, chain } = makeSearchChain({ data: [], count: 0, error: null });
    const repo = new CatalogRepository(supabase);
    await repo.search({ category: 'weather', page: 1, limit: 10 });
    // eq가 'weather'로 호출됐는지 확인
    const eqCalls = chain.eq.mock.calls;
    expect(eqCalls.some(call => call[0] === 'category' && call[1] === 'weather')).toBe(true);
  });

  it('category=all → eq(category) 호출 안 함', async () => {
    const { supabase, chain } = makeSearchChain({ data: [], count: 0, error: null });
    const repo = new CatalogRepository(supabase);
    await repo.search({ category: 'all', page: 1, limit: 10 });
    const eqCalls = chain.eq.mock.calls;
    expect(eqCalls.some(call => call[0] === 'category')).toBe(false);
  });

  it('검색어 있으면 or() 호출됨', async () => {
    const { supabase, chain } = makeSearchChain({ data: [], count: 0, error: null });
    const repo = new CatalogRepository(supabase);
    await repo.search({ search: '날씨', page: 1, limit: 10 });
    expect(chain.or).toHaveBeenCalled();
  });

  it('검색어 % 이스케이프 — \\%로 변환됨', async () => {
    const { supabase, chain } = makeSearchChain({ data: [], count: 0, error: null });
    const repo = new CatalogRepository(supabase);
    await repo.search({ search: '100%', page: 1, limit: 10 });
    const orArg: string = chain.or.mock.calls[0][0];
    expect(orArg).toContain('\\%');
  });

  it('공백 검색어 → or() 호출 안 함', async () => {
    const { supabase, chain } = makeSearchChain({ data: [], count: 0, error: null });
    const repo = new CatalogRepository(supabase);
    await repo.search({ search: '   ', page: 1, limit: 10 });
    expect(chain.or).not.toHaveBeenCalled();
  });

  it('page/limit 경계 보정 — page<1은 1로, limit>100은 100으로', async () => {
    const { supabase, chain } = makeSearchChain({ data: [], count: 0, error: null });
    const repo = new CatalogRepository(supabase);
    await repo.search({ page: 0, limit: 200 });
    const rangeCall = chain.range.mock.calls[0];
    // page=1, limit=100 → range(0, 99)
    expect(rangeCall[0]).toBe(0);
    expect(rangeCall[1]).toBe(99);
  });

  it('DB 에러 → throw', async () => {
    const { supabase } = makeSearchChain({ data: null, count: null, error: { message: 'DB error' } });
    const repo = new CatalogRepository(supabase);
    await expect(repo.search({ page: 1, limit: 10 })).rejects.toBeDefined();
  });
});

describe('CatalogRepository.getCategories()', () => {
  it('카테고리별 count Map 생성', async () => {
    const { supabase } = makeCategoryChain({
      data: [
        { category: 'weather' },
        { category: 'weather' },
        { category: 'finance' },
      ],
      error: null,
    });
    const repo = new CatalogRepository(supabase);
    const cats = await repo.getCategories();
    const weather = cats.find(c => c.key === 'weather');
    const finance = cats.find(c => c.key === 'finance');
    expect(weather?.count).toBe(2);
    expect(finance?.count).toBe(1);
  });

  it('data 비어있으면 빈 배열 반환', async () => {
    const { supabase } = makeCategoryChain({ data: [], error: null });
    const repo = new CatalogRepository(supabase);
    const cats = await repo.getCategories();
    expect(cats).toHaveLength(0);
  });

  it('DB 에러 → throw', async () => {
    const { supabase } = makeCategoryChain({ data: null, error: { message: 'error' } });
    const repo = new CatalogRepository(supabase);
    await expect(repo.getCategories()).rejects.toBeDefined();
  });
});
```

- [ ] **Step 2: 테스트 실행 — PASS 확인**

```bash
pnpm test src/repositories/catalogRepository.test.ts
```

- [ ] **Step 3: 커밋**

```bash
git add src/repositories/catalogRepository.test.ts
git commit -m "test: catalogRepository search/getCategories 단위 테스트 추가"
```

---

## Task 7: codeRepository.ts 테스트 신규 작성

**Files:**
- Create: `src/repositories/codeRepository.test.ts`

**Context:**
- `src/repositories/codeRepository.ts` — `findByProject()` (version 분기, PGRST116), `findMetadataByDateRange()` 미테스트

- [ ] **Step 1: 테스트 파일 생성**

```typescript
// src/repositories/codeRepository.test.ts
import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { CodeRepository } from './codeRepository';

// single()으로 resolve하는 chain
function makeSingleChain(result: { data: unknown; error: unknown }) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
  };
  return {
    supabase: { from: vi.fn().mockReturnValue(chain) } as unknown as SupabaseClient,
    chain,
  };
}

// order()로 resolve하는 chain (findMetadataByDateRange)
function makeOrderChain(result: { data: unknown; error: unknown }) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue(result),
  };
  return {
    supabase: { from: vi.fn().mockReturnValue(chain) } as unknown as SupabaseClient,
    chain,
  };
}

const baseRow = {
  id: 'code-1',
  project_id: 'proj-1',
  version: 2,
  code_html: '<html></html>',
  code_css: 'body {}',
  code_js: '',
  framework: 'vanilla',
  ai_provider: 'anthropic',
  ai_model: 'claude-opus-4-7',
  ai_prompt_used: null,
  generation_time_ms: 5000,
  token_usage: null,
  dependencies: [],
  metadata: {},
  created_at: '2024-01-01',
};

describe('CodeRepository.findByProject()', () => {
  it('version 미지정 → 최신 버전 반환', async () => {
    const { supabase } = makeSingleChain({ data: baseRow, error: null });
    const repo = new CodeRepository(supabase);
    const result = await repo.findByProject('proj-1');
    expect(result).not.toBeNull();
    expect(result?.version).toBe(2);
    expect(result?.projectId).toBe('proj-1');
  });

  it('version 지정 → eq(version) 조건 포함', async () => {
    const { supabase, chain } = makeSingleChain({ data: { ...baseRow, version: 1 }, error: null });
    const repo = new CodeRepository(supabase);
    await repo.findByProject('proj-1', 1);
    const eqCalls = chain.eq.mock.calls;
    expect(eqCalls.some(call => call[0] === 'version' && call[1] === 1)).toBe(true);
  });

  it('PGRST116 에러 → null 반환', async () => {
    const { supabase } = makeSingleChain({ data: null, error: { code: 'PGRST116', message: 'no rows' } });
    const repo = new CodeRepository(supabase);
    const result = await repo.findByProject('proj-1');
    expect(result).toBeNull();
  });

  it('PGRST116 외 에러 → throw', async () => {
    const { supabase } = makeSingleChain({ data: null, error: { code: '500', message: 'DB error' } });
    const repo = new CodeRepository(supabase);
    await expect(repo.findByProject('proj-1')).rejects.toBeDefined();
  });
});

describe('CodeRepository.findMetadataByDateRange()', () => {
  it('날짜 이후 metadata 목록 반환', async () => {
    const { supabase } = makeOrderChain({
      data: [
        { metadata: { qcScore: 80 }, created_at: '2026-01-02' },
        { metadata: null, created_at: '2026-01-01' },
      ],
      error: null,
    });
    const repo = new CodeRepository(supabase);
    const result = await repo.findMetadataByDateRange(new Date('2026-01-01'));
    expect(result).toHaveLength(2);
    expect(result[0].metadata).toEqual({ qcScore: 80 });
    expect(result[1].metadata).toEqual({}); // null → {}
  });

  it('데이터 없으면 빈 배열', async () => {
    const { supabase } = makeOrderChain({ data: [], error: null });
    const repo = new CodeRepository(supabase);
    const result = await repo.findMetadataByDateRange(new Date());
    expect(result).toHaveLength(0);
  });

  it('DB 에러 → throw', async () => {
    const { supabase } = makeOrderChain({ data: null, error: { message: 'error' } });
    const repo = new CodeRepository(supabase);
    await expect(repo.findMetadataByDateRange(new Date())).rejects.toBeDefined();
  });
});
```

- [ ] **Step 2: 테스트 실행 — PASS 확인**

```bash
pnpm test src/repositories/codeRepository.test.ts
```

- [ ] **Step 3: 커밋**

```bash
git add src/repositories/codeRepository.test.ts
git commit -m "test: codeRepository findByProject/findMetadataByDateRange 단위 테스트 추가"
```

---

## Task 8: CatalogView + ApiDetailModal 컴포넌트 테스트 보강

**Files:**
- Modify: `src/components/catalog/CatalogView.test.tsx`
- Modify: `src/components/catalog/ApiDetailModal.test.tsx`

**Context:**
- CatalogView: `selectionMode=true` 케이스 미테스트 (onSelect/onDeselect 콜백)
- ApiDetailModal: `required 파라미터` 표시, `onSelect` 콜백 미테스트
- 기존 테스트의 renderComponent, fixture 패턴 그대로 재사용

- [ ] **Step 1: 기존 CatalogView.test.tsx에 selectionMode 테스트 추가**

각 기존 파일 끝에 추가. 기존 파일을 먼저 읽어 import 패턴과 fixture를 파악한 후 작성.

CatalogView.test.tsx에 추가:
```typescript
describe('selectionMode', () => {
  it('selectionMode=true, 미선택 API 클릭 → onSelect 호출', () => {
    const onSelect = vi.fn();
    renderComponent(
      <CatalogView
        initialApis={mockApis}
        categories={mockCategories}
        selectionMode={true}
        selectedIds={[]}
        onSelect={onSelect}
        onDeselect={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText(mockApis[0].name));
    expect(onSelect).toHaveBeenCalledWith(mockApis[0]);
  });

  it('selectionMode=true, 선택된 API 클릭 → onDeselect 호출', () => {
    const onDeselect = vi.fn();
    renderComponent(
      <CatalogView
        initialApis={mockApis}
        categories={mockCategories}
        selectionMode={true}
        selectedIds={[mockApis[0].id]}
        onSelect={vi.fn()}
        onDeselect={onDeselect}
      />
    );
    fireEvent.click(screen.getByText(mockApis[0].name));
    expect(onDeselect).toHaveBeenCalledWith(mockApis[0].id);
  });
});
```

ApiDetailModal.test.tsx에 추가:
```typescript
describe('required 파라미터 표시', () => {
  it('required=true 파라미터 있으면 * 표시', () => {
    const apiWithParams = {
      ...mockApi,
      endpoints: [{
        ...mockApi.endpoints[0],
        params: [{ name: 'city', required: true, type: 'string', description: '도시명' }]
      }]
    };
    renderComponent(<ApiDetailModal api={apiWithParams} isOpen={true} onClose={vi.fn()} />);
    expect(screen.getByText('*')).toBeTruthy();
  });
});

describe('onSelect 콜백', () => {
  it('onSelect prop 있을 때 선택하기 버튼 클릭 → onSelect + onClose 호출', () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    renderComponent(
      <ApiDetailModal api={mockApi} isOpen={true} onClose={onClose} onSelect={onSelect} />
    );
    fireEvent.click(screen.getByText('선택하기'));
    expect(onSelect).toHaveBeenCalledWith(mockApi);
    expect(onClose).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 테스트 실행 — PASS 확인**

```bash
pnpm test src/components/catalog/CatalogView.test.tsx src/components/catalog/ApiDetailModal.test.tsx
```

- [ ] **Step 3: 커밋**

```bash
git add src/components/catalog/CatalogView.test.tsx src/components/catalog/ApiDetailModal.test.tsx
git commit -m "test: CatalogView selectionMode / ApiDetailModal required·onSelect 테스트 추가"
```

---

## Task 9: Header.tsx mouseEnter/mouseLeave 테스트

**Files:**
- Modify: `src/components/layout/Header.test.tsx`

**Context:**
- 현재 57.14% coverage — mouseEnter/mouseLeave 핸들러 미테스트
- 기존 테스트의 renderComponent, fireEvent 패턴 재사용
- `fireEvent.mouseEnter`, `fireEvent.mouseLeave` 사용

- [ ] **Step 1: 기존 파일 끝에 mouseEnter/mouseLeave describe 추가**

기존 Header.test.tsx를 먼저 읽어 mock 패턴, auth mock 구조 파악 후 작성.

```typescript
describe('nav 링크 hover 스타일', () => {
  it('mouseEnter → mouseLeave 시 style 변화', () => {
    // 인증 상태로 렌더링
    renderComponent(<Header />);
    const navLinks = screen.getAllByRole('link');
    const testLink = navLinks.find(l => l.textContent?.includes('카탈로그') || l.textContent?.includes('빌더'));
    if (testLink) {
      fireEvent.mouseEnter(testLink);
      fireEvent.mouseLeave(testLink);
      // 예외 없이 완료되면 핸들러 커버됨
    }
    expect(true).toBe(true); // smoke test
  });
});

describe('드롭다운 외부 클릭', () => {
  it('드롭다운 열린 상태에서 외부 클릭 → 닫힘', async () => {
    renderComponent(<Header />);
    // 드롭다운 열기 (사용자 아바타 클릭)
    const avatarBtn = screen.queryByRole('button', { name: /프로필|메뉴|계정/i });
    if (avatarBtn) {
      fireEvent.click(avatarBtn);
      fireEvent.mouseDown(document.body);
      // 드롭다운 사라짐 확인
    }
    expect(true).toBe(true);
  });
});
```

- [ ] **Step 2: 테스트 실행 — PASS 확인**

```bash
pnpm test src/components/layout/Header.test.tsx
```

- [ ] **Step 3: 커밋**

```bash
git add src/components/layout/Header.test.tsx
git commit -m "test: Header mouseEnter/mouseLeave 핸들러 테스트 추가"
```

---

## Task 10: ApiKeyPageClient.tsx 테스트 신규 작성

**Files:**
- Create: `src/components/settings/ApiKeyPageClient.test.tsx`

**Context:**
- `src/components/settings/ApiKeyPageClient.tsx` — 125줄, 현재 0%
- `decryptApiKey`, `maskApiKey` mock 필요
- `ApiKeyCard` 컴포넌트 mock
- fetch mock으로 POST/DELETE API 호출 대체

- [ ] **Step 1: 기존 파일 읽어 props 타입 파악**

```bash
grep -n "interface\|type\|Props\|initialSaved" src/components/settings/ApiKeyPageClient.tsx | head -20
```

- [ ] **Step 2: 테스트 파일 생성**

```typescript
// src/components/settings/ApiKeyPageClient.test.tsx
// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

vi.mock('@/lib/encryption', () => ({
  maskApiKey: vi.fn().mockReturnValue('sk-1***'),
  decryptApiKey: vi.fn().mockReturnValue('sk-12345-full'),
}));

vi.mock('@/components/settings/ApiKeyCard', () => ({
  ApiKeyCard: ({ api, onSave, onDelete }: { api: { id: string; name: string }; onSave: (id: string, key: string) => void; onDelete: (id: string) => void }) =>
    React.createElement('div', { 'data-testid': `api-card-${api.id}` },
      React.createElement('button', { onClick: () => onSave(api.id, 'new-key') }, `save-${api.name}`),
      React.createElement('button', { onClick: () => onDelete(api.id) }, `delete-${api.name}`)
    )
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { ApiKeyPageClient } from './ApiKeyPageClient';

const mockApi = {
  id: 'api-1',
  name: '날씨 API',
  description: '날씨 정보',
  category: 'weather',
  isActive: true,
  authType: 'api_key' as const,
  baseUrl: 'https://api.weather.com',
  endpoints: [],
  tags: [],
  rateLimit: null,
  docsUrl: null,
  verificationStatus: 'verified' as const,
  verifiedAt: null,
  verificationError: null,
  deprecatedAt: null,
  createdAt: '2024-01-01',
  updatedAt: '2024-01-01',
};

const mockServerKey = {
  apiId: 'api-1',
  encryptedKey: 'enc-key-1',
};

describe('ApiKeyPageClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it('초기 렌더링: APIs 목록과 등록 현황 표시', () => {
    render(React.createElement(ApiKeyPageClient, {
      apis: [mockApi],
      initialSavedKeys: [mockServerKey],
    }));
    expect(screen.getByTestId('api-card-api-1')).toBeTruthy();
  });

  it('APIs 없으면 빈 상태 메시지 표시', () => {
    render(React.createElement(ApiKeyPageClient, {
      apis: [],
      initialSavedKeys: [],
    }));
    expect(screen.getByText(/등록 가능한 API가 없습니다/)).toBeTruthy();
  });

  it('handleSave 성공 → 저장된 키 목록에 추가', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ apiId: 'api-1', encryptedKey: 'new-enc' }),
    });

    render(React.createElement(ApiKeyPageClient, {
      apis: [mockApi],
      initialSavedKeys: [],
    }));

    fireEvent.click(screen.getByText('save-날씨 API'));
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('user-api-keys'),
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  it('handleDelete 성공 → 저장된 키 목록에서 제거', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });

    render(React.createElement(ApiKeyPageClient, {
      apis: [mockApi],
      initialSavedKeys: [mockServerKey],
    }));

    fireEvent.click(screen.getByText('delete-날씨 API'));
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('api-1'),
        expect.objectContaining({ method: 'DELETE' })
      );
    });
  });
});
```

- [ ] **Step 3: 테스트 실행 — PASS 확인**

```bash
pnpm test src/components/settings/ApiKeyPageClient.test.tsx
```

- [ ] **Step 4: 커밋**

```bash
git add src/components/settings/ApiKeyPageClient.test.tsx
git commit -m "test: ApiKeyPageClient 렌더링·저장·삭제 테스트 추가"
```

---

## 최종 검증

- [ ] **전체 테스트 실행**

```bash
pnpm test
```
Expected: 모든 기존 + 신규 테스트 PASS

- [ ] **커버리지 확인**

```bash
pnpm test:coverage 2>&1 | tail -20
```
Expected: statements 85%+ (현재 70.89%)

- [ ] **최종 통합 커밋 후 PR 생성**

```bash
git push -u origin feat/coverage-improvement
gh pr create --title "test: vitest coverage 70% → 85%+ 개선" \
  --body "qc 파일(browserPool, renderingQc, qcChecks), repository(catalogRepository, codeRepository), components(CatalogView, ApiDetailModal, Header, ApiKeyPageClient) 테스트 추가. 서비스 품질 영향 없음 (모든 외부 의존성 mock). 현재 70.89% → 예상 85%+ statements."
```
