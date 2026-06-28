import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Page } from 'playwright-core';
import {
  checkConsoleErrors,
  checkHorizontalScroll,
  checkFooterVisible,
  checkNoLayoutOverlap,
  checkImageLoading,
  checkTouchTargets,
  checkResponsiveBreakpoints,
  checkNoRuntimePlaceholder,
  checkInteractiveBehavior,
  checkNetworkActivity,
  checkLoadingStateDisappears,
  checkAccessibility,
} from './qcChecks';

// ---------------------------------------------------------------------------
// 모든 deep/fast 체크는 playwright-core `Page`를 받지만, 실제 브라우저 없이
// Page 인터페이스를 목으로 대체해 각 함수의 분기(통과/실패/스킵/에러)와
// 점수 산정 로직을 결정적으로 검증한다. 콜백(evaluate/$$eval 내부 함수)은
// 목에서 실행하지 않고 반환값만 주입한다 — 함수의 주변 로직이 검증 대상이다.
// ---------------------------------------------------------------------------

type MockPage = {
  evaluate: ReturnType<typeof vi.fn>;
  $: ReturnType<typeof vi.fn>;
  $$: ReturnType<typeof vi.fn>;
  $$eval: ReturnType<typeof vi.fn>;
  setViewportSize: ReturnType<typeof vi.fn>;
  waitForTimeout: ReturnType<typeof vi.fn>;
  evaluateHandle: ReturnType<typeof vi.fn>;
};

function makeMockPage(): MockPage {
  return {
    evaluate: vi.fn(),
    $: vi.fn(),
    $$: vi.fn(),
    $$eval: vi.fn(),
    setViewportSize: vi.fn().mockResolvedValue(undefined),
    waitForTimeout: vi.fn().mockResolvedValue(undefined),
    evaluateHandle: vi.fn(),
  };
}

const asPage = (p: MockPage): Page => p as unknown as Page;

function makeBox(y: number, height: number) {
  return { x: 0, y, width: 1000, height };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// checkConsoleErrors (순수 동기)
// ---------------------------------------------------------------------------
describe('checkConsoleErrors()', () => {
  it('에러가 없으면 통과(score 100, details 비어있음)', () => {
    const result = checkConsoleErrors([]);
    expect(result).toMatchObject({ name: 'consoleErrors', passed: true, score: 100, details: [] });
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('에러가 있으면 실패(score 0, details에 원본 에러 포함)', () => {
    const errors = ['ReferenceError: x', 'TypeError: y'];
    const result = checkConsoleErrors(errors);
    expect(result).toMatchObject({ name: 'consoleErrors', passed: false, score: 0, details: errors });
  });
});

// ---------------------------------------------------------------------------
// checkHorizontalScroll
// ---------------------------------------------------------------------------
describe('checkHorizontalScroll()', () => {
  it('scrollWidth <= clientWidth 이면 통과', async () => {
    const page = makeMockPage();
    page.evaluate.mockResolvedValue({ scrollWidth: 375, clientWidth: 375 });
    const result = await checkHorizontalScroll(asPage(page), 375);
    expect(result).toMatchObject({ name: 'horizontalScroll', passed: true, score: 100, details: [] });
  });

  it('overflow가 있으면 실패하고 details에 초과량을 보고한다', async () => {
    const page = makeMockPage();
    page.evaluate.mockResolvedValue({ scrollWidth: 500, clientWidth: 375 });
    const result = await checkHorizontalScroll(asPage(page), 375);
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
    expect(result.details[0]).toContain('scrollWidth=500');
    expect(result.details[0]).toContain('375');
  });

  it('evaluate가 reject하면 catch 분기로 에러 결과를 반환한다', async () => {
    const page = makeMockPage();
    page.evaluate.mockRejectedValue(new Error('boom'));
    const result = await checkHorizontalScroll(asPage(page), 375);
    expect(result).toMatchObject({ name: 'horizontalScroll', passed: false, score: 0 });
    expect(result.details[0]).toContain('Evaluation error: boom');
  });
});

// ---------------------------------------------------------------------------
// checkFooterVisible
// ---------------------------------------------------------------------------
describe('checkFooterVisible()', () => {
  it('footer 요소가 없으면 실패(score 0)', async () => {
    const page = makeMockPage();
    page.$.mockResolvedValue(null);
    const result = await checkFooterVisible(asPage(page));
    expect(result).toMatchObject({ name: 'footerVisible', passed: false, score: 0 });
    expect(result.details[0]).toContain('No <footer>');
  });

  it('footer가 보이면 통과(score 100)', async () => {
    const page = makeMockPage();
    page.$.mockResolvedValue({ isVisible: vi.fn().mockResolvedValue(true) });
    const result = await checkFooterVisible(asPage(page));
    expect(result).toMatchObject({ passed: true, score: 100, details: [] });
  });

  it('footer는 존재하나 보이지 않으면 score 50으로 실패', async () => {
    const page = makeMockPage();
    page.$.mockResolvedValue({ isVisible: vi.fn().mockResolvedValue(false) });
    const result = await checkFooterVisible(asPage(page));
    expect(result).toMatchObject({ passed: false, score: 50 });
    expect(result.details[0]).toContain('not visible');
  });

  it('$ 가 throw하면 catch 분기', async () => {
    const page = makeMockPage();
    page.$.mockRejectedValue(new Error('sel fail'));
    const result = await checkFooterVisible(asPage(page));
    expect(result).toMatchObject({ passed: false, score: 0 });
    expect(result.details[0]).toContain('Evaluation error: sel fail');
  });
});

// ---------------------------------------------------------------------------
// checkNoLayoutOverlap
// ---------------------------------------------------------------------------
describe('checkNoLayoutOverlap()', () => {
  it('header/main/footer가 모두 없으면 스킵 통과(score 100)', async () => {
    const page = makeMockPage();
    page.$.mockResolvedValue(null);
    const result = await checkNoLayoutOverlap(asPage(page));
    expect(result).toMatchObject({ name: 'noLayoutOverlap', passed: true, score: 100 });
    expect(result.details[0]).toContain('skipping overlap check');
  });

  it('겹침이 없으면 통과', async () => {
    const page = makeMockPage();
    const header = { boundingBox: vi.fn().mockResolvedValue(makeBox(0, 40)) };
    const main = { boundingBox: vi.fn().mockResolvedValue(makeBox(50, 100)) };
    const footer = { boundingBox: vi.fn().mockResolvedValue(makeBox(200, 50)) };
    page.$.mockResolvedValueOnce(header).mockResolvedValueOnce(main).mockResolvedValueOnce(footer);
    const result = await checkNoLayoutOverlap(asPage(page));
    expect(result).toMatchObject({ passed: true, score: 100, details: [] });
  });

  it('header 하단이 main 상단을 침범하면 실패', async () => {
    const page = makeMockPage();
    const header = { boundingBox: vi.fn().mockResolvedValue(makeBox(0, 100)) }; // bottom=100
    const main = { boundingBox: vi.fn().mockResolvedValue(makeBox(50, 500)) }; // top=50
    page.$.mockResolvedValueOnce(header).mockResolvedValueOnce(main).mockResolvedValueOnce(null);
    const result = await checkNoLayoutOverlap(asPage(page));
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
    expect(result.details[0]).toContain('header bottom');
  });

  it('main 하단이 footer 상단을 침범하면 실패', async () => {
    const page = makeMockPage();
    const main = { boundingBox: vi.fn().mockResolvedValue(makeBox(0, 300)) }; // bottom=300
    const footer = { boundingBox: vi.fn().mockResolvedValue(makeBox(100, 50)) }; // top=100
    page.$.mockResolvedValueOnce(null).mockResolvedValueOnce(main).mockResolvedValueOnce(footer);
    const result = await checkNoLayoutOverlap(asPage(page));
    expect(result.passed).toBe(false);
    expect(result.details[0]).toContain('main bottom');
  });

  it('$ 가 throw하면 catch 분기', async () => {
    const page = makeMockPage();
    page.$.mockRejectedValue(new Error('overlap fail'));
    const result = await checkNoLayoutOverlap(asPage(page));
    expect(result).toMatchObject({ passed: false, score: 0 });
    expect(result.details[0]).toContain('Evaluation error: overlap fail');
  });
});

// ---------------------------------------------------------------------------
// checkImageLoading
// ---------------------------------------------------------------------------
describe('checkImageLoading()', () => {
  it('이미지가 없으면 통과(score 100)', async () => {
    const page = makeMockPage();
    page.$$eval.mockResolvedValue([]);
    const result = await checkImageLoading(asPage(page));
    expect(result).toMatchObject({ name: 'imageLoading', passed: true, score: 100 });
    expect(result.details[0]).toContain('No images');
  });

  it('모든 이미지가 로드되면 통과', async () => {
    const page = makeMockPage();
    page.$$eval.mockResolvedValue([
      { src: 'a.png', loaded: true },
      { src: 'b.png', loaded: true },
    ]);
    const result = await checkImageLoading(asPage(page));
    expect(result).toMatchObject({ passed: true, score: 100, details: [] });
  });

  it('일부 이미지가 로드 실패하면 비율 점수와 실패 목록을 반환', async () => {
    const page = makeMockPage();
    page.$$eval.mockResolvedValue([
      { src: 'ok.png', loaded: true },
      { src: 'broken.png', loaded: false },
    ]);
    const result = await checkImageLoading(asPage(page));
    expect(result.passed).toBe(false);
    expect(result.score).toBe(50);
    expect(result.details[0]).toContain('broken.png');
  });

  it('$$eval이 throw하면 catch 분기', async () => {
    const page = makeMockPage();
    page.$$eval.mockRejectedValue(new Error('img fail'));
    const result = await checkImageLoading(asPage(page));
    expect(result).toMatchObject({ passed: false, score: 0 });
    expect(result.details[0]).toContain('Evaluation error: img fail');
  });
});

// ---------------------------------------------------------------------------
// checkTouchTargets
// ---------------------------------------------------------------------------
describe('checkTouchTargets()', () => {
  it('상호작용 요소가 없으면 통과', async () => {
    const page = makeMockPage();
    page.$$eval.mockResolvedValue([]);
    const result = await checkTouchTargets(asPage(page));
    expect(result).toMatchObject({ name: 'touchTargets', passed: true, score: 100 });
  });

  it('버튼/링크는 가로·세로 모두 44px 이상이면 통과', async () => {
    const page = makeMockPage();
    page.$$eval.mockResolvedValue([{ tag: 'button', text: 'ok', width: 44, height: 44 }]);
    const result = await checkTouchTargets(asPage(page));
    expect(result).toMatchObject({ passed: true, score: 100 });
  });

  it('버튼이 최소 크기 미만이면 실패', async () => {
    const page = makeMockPage();
    page.$$eval.mockResolvedValue([{ tag: 'button', text: 'x', width: 30, height: 30 }]);
    const result = await checkTouchTargets(asPage(page));
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
    expect(result.details[0]).toContain('30x30');
  });

  it('폼 요소(input)는 가로폭만 충분하면 통과(세로는 무관)', async () => {
    const page = makeMockPage();
    page.$$eval.mockResolvedValue([{ tag: 'input', text: '', width: 100, height: 10 }]);
    const result = await checkTouchTargets(asPage(page));
    expect(result).toMatchObject({ passed: true, score: 100 });
  });

  it('폼 요소(input)도 가로폭이 부족하면 실패', async () => {
    const page = makeMockPage();
    page.$$eval.mockResolvedValue([{ tag: 'input', text: '', width: 30, height: 10 }]);
    const result = await checkTouchTargets(asPage(page));
    expect(result.passed).toBe(false);
  });

  it('일부만 실패하면 비율 점수를 반환', async () => {
    const page = makeMockPage();
    page.$$eval.mockResolvedValue([
      { tag: 'button', text: 'big', width: 44, height: 44 },
      { tag: 'button', text: 'small', width: 20, height: 20 },
    ]);
    const result = await checkTouchTargets(asPage(page));
    expect(result.score).toBe(50);
    expect(result.passed).toBe(false);
  });

  it('$$eval이 throw하면 catch 분기', async () => {
    const page = makeMockPage();
    page.$$eval.mockRejectedValue(new Error('touch fail'));
    const result = await checkTouchTargets(asPage(page));
    expect(result.details[0]).toContain('Evaluation error: touch fail');
  });
});

// ---------------------------------------------------------------------------
// checkResponsiveBreakpoints
// ---------------------------------------------------------------------------
describe('checkResponsiveBreakpoints()', () => {
  it('모든 뷰포트에서 overflow가 없으면 통과(score 100)', async () => {
    const page = makeMockPage();
    page.evaluate.mockResolvedValue({ scrollWidth: 100, clientWidth: 100 });
    const result = await checkResponsiveBreakpoints(asPage(page));
    expect(result).toMatchObject({ name: 'responsiveBreakpoints', passed: true, score: 100 });
    expect(page.setViewportSize).toHaveBeenCalledTimes(3);
  });

  it('특정 뷰포트에서 overflow가 있으면 해당 뷰포트를 보고하고 비율 점수를 반환', async () => {
    const page = makeMockPage();
    page.evaluate
      .mockResolvedValueOnce({ scrollWidth: 500, clientWidth: 375 }) // 375px overflow
      .mockResolvedValue({ scrollWidth: 800, clientWidth: 800 });
    const result = await checkResponsiveBreakpoints(asPage(page));
    expect(result.passed).toBe(false);
    expect(result.score).toBe(67);
    expect(result.details[0]).toContain('375px');
  });

  it('evaluate가 throw하면 catch 분기', async () => {
    const page = makeMockPage();
    page.evaluate.mockRejectedValue(new Error('vp fail'));
    const result = await checkResponsiveBreakpoints(asPage(page));
    expect(result).toMatchObject({ passed: false, score: 0 });
    expect(result.details[0]).toContain('Evaluation error: vp fail');
  });
});

// ---------------------------------------------------------------------------
// checkNoRuntimePlaceholder
// ---------------------------------------------------------------------------
describe('checkNoRuntimePlaceholder()', () => {
  it('placeholder 문자열도 href="#"도 없으면 통과(score 100)', async () => {
    const page = makeMockPage();
    page.evaluate.mockResolvedValue('실제 데이터가 렌더링된 본문');
    page.$$eval.mockResolvedValue(0);
    const result = await checkNoRuntimePlaceholder(asPage(page));
    expect(result).toMatchObject({ name: 'noRuntimePlaceholder', passed: true, score: 100 });
  });

  it('placeholder 문자열이 감지되면 실패하고 점수가 차감된다', async () => {
    const page = makeMockPage();
    page.evaluate.mockResolvedValue('환영합니다 Coming soon');
    page.$$eval.mockResolvedValue(0);
    const result = await checkNoRuntimePlaceholder(asPage(page));
    expect(result.passed).toBe(false);
    expect(result.score).toBe(75); // 100 - 1*25
    expect(result.details[0]).toContain('Coming soon');
  });

  it('href="#" 링크가 있으면 실패 사유로 보고한다', async () => {
    const page = makeMockPage();
    page.evaluate.mockResolvedValue('깨끗한 본문');
    page.$$eval.mockResolvedValue(3);
    const result = await checkNoRuntimePlaceholder(asPage(page));
    expect(result.passed).toBe(false);
    expect(result.details.some((d) => d.includes('href="#"'))).toBe(true);
  });

  it('evaluate가 throw하면 catch 분기', async () => {
    const page = makeMockPage();
    page.evaluate.mockRejectedValue(new Error('ph fail'));
    const result = await checkNoRuntimePlaceholder(asPage(page));
    expect(result).toMatchObject({ passed: false, score: 0 });
    expect(result.details[0]).toContain('Evaluation error: ph fail');
  });
});

// ---------------------------------------------------------------------------
// checkNetworkActivity (순수 동기)
// ---------------------------------------------------------------------------
describe('checkNetworkActivity()', () => {
  it('비 CDN API 요청이 있으면 통과(score 100)', () => {
    const result = checkNetworkActivity(['https://api.example.com/v1/data']);
    expect(result).toMatchObject({ name: 'networkActivity', passed: true, score: 100 });
    expect(result.details[0]).toContain('Request:');
  });

  it('CDN/data URL만 있으면 실패(score 20)', () => {
    const result = checkNetworkActivity([
      'data:image/png;base64,abc',
      'https://cdn.tailwindcss.com/x',
      'https://cdn.jsdelivr.net/y',
      'https://unpkg.com/z',
      'https://cdnjs.cloudflare.com/w',
    ]);
    expect(result).toMatchObject({ passed: false, score: 20 });
    expect(result.details[0]).toContain('API 요청이 없습니다');
  });

  it('요청이 전혀 없으면 실패(score 20)', () => {
    const result = checkNetworkActivity([]);
    expect(result).toMatchObject({ passed: false, score: 20 });
  });
});

// ---------------------------------------------------------------------------
// checkLoadingStateDisappears
// ---------------------------------------------------------------------------
describe('checkLoadingStateDisappears()', () => {
  it('로딩 스켈레톤 요소가 처음부터 없으면 통과(score 100)', async () => {
    const page = makeMockPage();
    page.$$eval.mockResolvedValue(0);
    const result = await checkLoadingStateDisappears(asPage(page));
    expect(result).toMatchObject({ name: 'loadingStateDisappears', passed: true, score: 100 });
    expect(result.details[0]).toContain('No loading skeleton');
    expect(page.waitForTimeout).not.toHaveBeenCalled();
  });

  it('초기 로딩 요소가 3초 후 사라지면 통과', async () => {
    const page = makeMockPage();
    page.$$eval.mockResolvedValueOnce(1).mockResolvedValue(0); // 초기 1개 → 대기 후 0
    const result = await checkLoadingStateDisappears(asPage(page));
    expect(result).toMatchObject({ passed: true, score: 100, details: [] });
    expect(page.waitForTimeout).toHaveBeenCalledWith(3000);
  });

  it('3초 후에도 로딩 요소가 남아있으면 실패(score 40)', async () => {
    const page = makeMockPage();
    page.$$eval.mockResolvedValue(1); // 항상 1개 존재
    const result = await checkLoadingStateDisappears(asPage(page));
    expect(result).toMatchObject({ passed: false, score: 40 });
    expect(result.details[0]).toContain('로딩 스켈레톤이 남아있습니다');
  });

  it('$$eval이 throw하면 catch 분기', async () => {
    const page = makeMockPage();
    page.$$eval.mockRejectedValue(new Error('load fail'));
    const result = await checkLoadingStateDisappears(asPage(page));
    expect(result).toMatchObject({ passed: false, score: 0 });
    expect(result.details[0]).toContain('Evaluation error: load fail');
  });
});

// ---------------------------------------------------------------------------
// checkAccessibility
// ---------------------------------------------------------------------------
describe('checkAccessibility()', () => {
  it('h1·main 존재 + 헤딩 순서 정상이면 통과(score 100)', async () => {
    const page = makeMockPage();
    page.$.mockResolvedValueOnce({}).mockResolvedValueOnce({}); // h1, main 모두 존재
    page.$$eval.mockResolvedValue([1, 2, 3]);
    const result = await checkAccessibility(asPage(page));
    expect(result).toMatchObject({ name: 'accessibility', passed: true, score: 100, details: [] });
  });

  it('h1이 없으면 실패하고 점수가 차감된다', async () => {
    const page = makeMockPage();
    page.$.mockResolvedValueOnce(null).mockResolvedValueOnce({}); // h1 없음, main 존재
    page.$$eval.mockResolvedValue([2, 3]);
    const result = await checkAccessibility(asPage(page));
    expect(result.passed).toBe(false);
    expect(result.score).toBe(67); // 2/3
    expect(result.details.some((d) => d.includes('Missing <h1>'))).toBe(true);
  });

  it('헤딩 레벨이 건너뛰면 passed는 유지되나 score가 차감된다', async () => {
    const page = makeMockPage();
    page.$.mockResolvedValueOnce({}).mockResolvedValueOnce({}); // h1, main 존재
    page.$$eval.mockResolvedValue([1, 3]); // h1 → h3 건너뜀
    const result = await checkAccessibility(asPage(page));
    expect(result.passed).toBe(true); // passed = hasH1 && hasMain
    expect(result.score).toBe(67);
    expect(result.details.some((d) => d.includes('Heading levels skip'))).toBe(true);
  });

  it('main이 없으면 실패', async () => {
    const page = makeMockPage();
    page.$.mockResolvedValueOnce({}).mockResolvedValueOnce(null); // h1 존재, main 없음
    page.$$eval.mockResolvedValue([1, 2]);
    const result = await checkAccessibility(asPage(page));
    expect(result.passed).toBe(false);
    expect(result.details.some((d) => d.includes('Missing <main>'))).toBe(true);
  });

  it('$ 가 throw하면 catch 분기', async () => {
    const page = makeMockPage();
    page.$.mockRejectedValue(new Error('a11y fail'));
    const result = await checkAccessibility(asPage(page));
    expect(result).toMatchObject({ passed: false, score: 0 });
    expect(result.details[0]).toContain('Evaluation error: a11y fail');
  });
});

// ---------------------------------------------------------------------------
// checkInteractiveBehavior (서브체크 조합 점수 매트릭스)
// ---------------------------------------------------------------------------
describe('checkInteractiveBehavior()', () => {
  it('입력 필드도 필터/탭도 없는 표시 전용 페이지는 중립 통과(score 70)', async () => {
    const page = makeMockPage();
    page.$$.mockResolvedValue([]); // 입력 없음 + 탭 후보 없음
    page.evaluateHandle.mockResolvedValue({ asElement: () => null }); // 버튼 그룹 없음
    const result = await checkInteractiveBehavior(asPage(page));
    expect(result).toMatchObject({ name: 'interactiveBehavior', passed: true, score: 70 });
  });

  it('입력+버튼 플로우가 DOM 변화를 일으키고 필터/탭은 없으면 score 80', async () => {
    const page = makeMockPage();
    const input = {
      isVisible: vi.fn().mockResolvedValue(true),
      fill: vi.fn().mockResolvedValue(undefined),
    };
    const button = {
      isVisible: vi.fn().mockResolvedValue(true),
      click: vi.fn().mockResolvedValue(undefined),
    };
    page.$$
      .mockResolvedValueOnce([input]) // subCheckInputAction: inputs
      .mockResolvedValueOnce([]); // subCheckFilterTab: tab 후보 없음
    page.$.mockResolvedValueOnce(button); // 버튼 조회
    page.evaluate
      .mockResolvedValueOnce('before') // beforeText
      .mockResolvedValueOnce(10) // beforeCount
      .mockResolvedValueOnce('after') // afterText
      .mockResolvedValueOnce(15); // afterCount → DOM 변화(diff 5)
    page.evaluateHandle.mockResolvedValue({ asElement: () => null });
    const result = await checkInteractiveBehavior(asPage(page));
    expect(result).toMatchObject({ passed: true, score: 80 });
  });

  it('입력 플로우가 DOM 변화를 못 만들고 필터/탭은 없으면 score 40', async () => {
    const page = makeMockPage();
    const input = {
      isVisible: vi.fn().mockResolvedValue(true),
      fill: vi.fn().mockResolvedValue(undefined),
    };
    const button = {
      isVisible: vi.fn().mockResolvedValue(true),
      click: vi.fn().mockResolvedValue(undefined),
    };
    page.$$.mockResolvedValueOnce([input]).mockResolvedValueOnce([]);
    page.$.mockResolvedValueOnce(button);
    page.evaluate
      .mockResolvedValueOnce('same') // beforeText
      .mockResolvedValueOnce(10) // beforeCount
      .mockResolvedValueOnce('same') // afterText (변화 없음)
      .mockResolvedValueOnce(10); // afterCount (변화 없음)
    page.evaluateHandle.mockResolvedValue({ asElement: () => null });
    const result = await checkInteractiveBehavior(asPage(page));
    expect(result).toMatchObject({ passed: false, score: 40 });
  });

  it('입력 플로우와 필터/탭이 모두 동작하면 score 100', async () => {
    const page = makeMockPage();
    const input = { isVisible: vi.fn().mockResolvedValue(true), fill: vi.fn().mockResolvedValue(undefined) };
    const button = { isVisible: vi.fn().mockResolvedValue(true), click: vi.fn().mockResolvedValue(undefined) };
    const tabA = { isVisible: vi.fn().mockResolvedValue(true), click: vi.fn().mockResolvedValue(undefined) };
    const tabB = { isVisible: vi.fn().mockResolvedValue(true), click: vi.fn().mockResolvedValue(undefined) };
    page.$$.mockResolvedValueOnce([input]).mockResolvedValueOnce([tabA, tabB]);
    page.$.mockResolvedValueOnce(button);
    page.evaluate
      .mockResolvedValueOnce('before').mockResolvedValueOnce(10) // sub1 before (text, count)
      .mockResolvedValueOnce('after').mockResolvedValueOnce(15) // sub1 after → DOM 변화
      .mockResolvedValueOnce(5).mockResolvedValueOnce('a') // sub2 before (list, active)
      .mockResolvedValueOnce(6).mockResolvedValueOnce('a'); // sub2 after → list 변화
    const result = await checkInteractiveBehavior(asPage(page));
    expect(result).toMatchObject({ passed: true, score: 100 });
  });

  it('두 서브체크 모두 발견되나 하나만 통과하면 score 40', async () => {
    const page = makeMockPage();
    const input = { isVisible: vi.fn().mockResolvedValue(true), fill: vi.fn().mockResolvedValue(undefined) };
    const button = { isVisible: vi.fn().mockResolvedValue(true), click: vi.fn().mockResolvedValue(undefined) };
    const tabA = { isVisible: vi.fn().mockResolvedValue(true), click: vi.fn().mockResolvedValue(undefined) };
    const tabB = { isVisible: vi.fn().mockResolvedValue(true), click: vi.fn().mockResolvedValue(undefined) };
    page.$$.mockResolvedValueOnce([input]).mockResolvedValueOnce([tabA, tabB]);
    page.$.mockResolvedValueOnce(button);
    page.evaluate
      .mockResolvedValueOnce('before').mockResolvedValueOnce(10) // sub1 before
      .mockResolvedValueOnce('after').mockResolvedValueOnce(15) // sub1 after → 통과
      .mockResolvedValueOnce(5).mockResolvedValueOnce('a') // sub2 before
      .mockResolvedValueOnce(5).mockResolvedValueOnce('a'); // sub2 after → 변화 없음(실패)
    const result = await checkInteractiveBehavior(asPage(page));
    expect(result).toMatchObject({ passed: false, score: 40 });
  });

  it('두 서브체크 모두 발견되고 둘 다 실패하면 score 0', async () => {
    const page = makeMockPage();
    const input = { isVisible: vi.fn().mockResolvedValue(true), fill: vi.fn().mockResolvedValue(undefined) };
    const button = { isVisible: vi.fn().mockResolvedValue(true), click: vi.fn().mockResolvedValue(undefined) };
    const tabA = { isVisible: vi.fn().mockResolvedValue(true), click: vi.fn().mockResolvedValue(undefined) };
    const tabB = { isVisible: vi.fn().mockResolvedValue(true), click: vi.fn().mockResolvedValue(undefined) };
    page.$$.mockResolvedValueOnce([input]).mockResolvedValueOnce([tabA, tabB]);
    page.$.mockResolvedValueOnce(button);
    page.evaluate
      .mockResolvedValueOnce('same').mockResolvedValueOnce(10) // sub1 before
      .mockResolvedValueOnce('same').mockResolvedValueOnce(10) // sub1 after → 변화 없음(실패)
      .mockResolvedValueOnce(5).mockResolvedValueOnce('a') // sub2 before
      .mockResolvedValueOnce(5).mockResolvedValueOnce('a'); // sub2 after → 변화 없음(실패)
    const result = await checkInteractiveBehavior(asPage(page));
    expect(result).toMatchObject({ passed: false, score: 0 });
  });

  it('page.$$가 throw하면 catch 분기(score 0)', async () => {
    const page = makeMockPage();
    page.$$.mockRejectedValue(new Error('interact fail'));
    const result = await checkInteractiveBehavior(asPage(page));
    expect(result).toMatchObject({ passed: false, score: 0 });
    expect(result.details[0]).toContain('Evaluation error: interact fail');
  });
});
