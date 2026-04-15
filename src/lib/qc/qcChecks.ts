import type { Page } from 'playwright-core';
import type { QcCheckResult } from '@/types/qc';

// ---------------------------------------------------------------------------
// Fast checks
// ---------------------------------------------------------------------------

export function checkConsoleErrors(errors: string[]): QcCheckResult {
  const start = Date.now();
  const passed = errors.length === 0;
  return {
    name: 'consoleErrors',
    passed,
    score: passed ? 100 : 0,
    details: errors,
    durationMs: Date.now() - start,
  };
}

export async function checkHorizontalScroll(
  page: Page,
  viewportWidth: number
): Promise<QcCheckResult> {
  const start = Date.now();
  try {
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    const passed = scrollWidth <= clientWidth;
    const details: string[] = passed
      ? []
      : [`Overflow: scrollWidth=${scrollWidth}px exceeds clientWidth=${clientWidth}px by ${scrollWidth - clientWidth}px at viewport ${viewportWidth}px`];
    return {
      name: 'horizontalScroll',
      passed,
      score: passed ? 100 : 0,
      details,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      name: 'horizontalScroll',
      passed: false,
      score: 0,
      details: [`Evaluation error: ${err instanceof Error ? err.message : String(err)}`],
      durationMs: Date.now() - start,
    };
  }
}

export async function checkFooterVisible(page: Page): Promise<QcCheckResult> {
  const start = Date.now();
  try {
    const footer = await page.$('footer');
    if (!footer) {
      return {
        name: 'footerVisible',
        passed: false,
        score: 0,
        details: ['No <footer> element found'],
        durationMs: Date.now() - start,
      };
    }
    const visible = await footer.isVisible();
    return {
      name: 'footerVisible',
      passed: visible,
      score: visible ? 100 : 50,
      details: visible ? [] : ['<footer> element exists but is not visible'],
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      name: 'footerVisible',
      passed: false,
      score: 0,
      details: [`Evaluation error: ${err instanceof Error ? err.message : String(err)}`],
      durationMs: Date.now() - start,
    };
  }
}

export async function checkNoLayoutOverlap(page: Page): Promise<QcCheckResult> {
  const start = Date.now();
  try {
    const header = await page.$('header');
    const main = await page.$('main, [role="main"]');
    const footer = await page.$('footer');

    const headerBox = header ? await header.boundingBox() : null;
    const mainBox = main ? await main.boundingBox() : null;
    const footerBox = footer ? await footer.boundingBox() : null;

    const TOLERANCE = 2;
    const details: string[] = [];

    if (!headerBox && !mainBox && !footerBox) {
      return {
        name: 'noLayoutOverlap',
        passed: true,
        score: 100,
        details: ['No header/main/footer elements found — skipping overlap check'],
        durationMs: Date.now() - start,
      };
    }

    if (headerBox && mainBox) {
      const headerBottom = headerBox.y + headerBox.height;
      if (headerBottom > mainBox.y + TOLERANCE) {
        details.push(
          `header bottom (${headerBottom.toFixed(1)}px) overlaps main top (${mainBox.y.toFixed(1)}px)`
        );
      }
    }

    if (mainBox && footerBox) {
      const mainBottom = mainBox.y + mainBox.height;
      if (mainBottom > footerBox.y + TOLERANCE) {
        details.push(
          `main bottom (${mainBottom.toFixed(1)}px) overlaps footer top (${footerBox.y.toFixed(1)}px)`
        );
      }
    }

    const passed = details.length === 0;
    return {
      name: 'noLayoutOverlap',
      passed,
      score: passed ? 100 : 0,
      details,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      name: 'noLayoutOverlap',
      passed: false,
      score: 0,
      details: [`Evaluation error: ${err instanceof Error ? err.message : String(err)}`],
      durationMs: Date.now() - start,
    };
  }
}

// ---------------------------------------------------------------------------
// Deep checks
// ---------------------------------------------------------------------------

export async function checkImageLoading(page: Page): Promise<QcCheckResult> {
  const start = Date.now();
  try {
    const images = await page.$$eval('img', (imgs) =>
      imgs.map((img) => ({
        src: (img as HTMLImageElement).src,
        loaded: (img as HTMLImageElement).naturalWidth > 0 && (img as HTMLImageElement).complete,
      }))
    );

    if (images.length === 0) {
      return {
        name: 'imageLoading',
        passed: true,
        score: 100,
        details: ['No images found'],
        durationMs: Date.now() - start,
      };
    }

    const failed = images.filter((img) => !img.loaded);
    const score = Math.round(((images.length - failed.length) / images.length) * 100);
    return {
      name: 'imageLoading',
      passed: failed.length === 0,
      score,
      details: failed.map((img) => `Failed to load: ${img.src}`),
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      name: 'imageLoading',
      passed: false,
      score: 0,
      details: [`Evaluation error: ${err instanceof Error ? err.message : String(err)}`],
      durationMs: Date.now() - start,
    };
  }
}

export async function checkTouchTargets(page: Page): Promise<QcCheckResult> {
  const start = Date.now();
  try {
    const elements = await page.$$eval(
      'a, button, [role="button"], input, select, textarea',
      (els) =>
        els.map((el) => {
          const rect = el.getBoundingClientRect();
          return {
            tag: el.tagName.toLowerCase(),
            text: el.textContent?.slice(0, 30) ?? '',
            width: rect.width,
            height: rect.height,
          };
        }).filter((el) => el.width > 0 && el.height > 0)
    );

    if (elements.length === 0) {
      return {
        name: 'touchTargets',
        passed: true,
        score: 100,
        details: ['No interactive elements found'],
        durationMs: Date.now() - start,
      };
    }

    const FORM_TAGS = new Set(['input', 'select', 'textarea']);
    const MIN_SIZE = 44;

    const failing: typeof elements = [];
    for (const el of elements) {
      if (FORM_TAGS.has(el.tag)) {
        // Form elements: pass if width is adequate (height can be shorter)
        if (el.width < MIN_SIZE) {
          failing.push(el);
        }
      } else {
        // Buttons/links: both dimensions must be >= 44
        if (el.width < MIN_SIZE || el.height < MIN_SIZE) {
          failing.push(el);
        }
      }
    }

    const score = Math.round(((elements.length - failing.length) / elements.length) * 100);
    return {
      name: 'touchTargets',
      passed: failing.length === 0,
      score,
      details: failing.map(
        (el) => `<${el.tag}> "${el.text}" is ${el.width.toFixed(0)}x${el.height.toFixed(0)}px (min ${MIN_SIZE}px)`
      ),
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      name: 'touchTargets',
      passed: false,
      score: 0,
      details: [`Evaluation error: ${err instanceof Error ? err.message : String(err)}`],
      durationMs: Date.now() - start,
    };
  }
}

export async function checkResponsiveBreakpoints(page: Page): Promise<QcCheckResult> {
  const start = Date.now();
  const viewports = [375, 768, 1280];
  const failingViewports: number[] = [];

  try {
    for (const vp of viewports) {
      await page.setViewportSize({ width: vp, height: 800 });
      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      if (scrollWidth > clientWidth) {
        failingViewports.push(vp);
      }
    }

    const passing = viewports.length - failingViewports.length;
    const score = Math.round((passing / viewports.length) * 100);
    return {
      name: 'responsiveBreakpoints',
      passed: failingViewports.length === 0,
      score,
      details: failingViewports.map((vp) => `Horizontal overflow at ${vp}px viewport`),
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      name: 'responsiveBreakpoints',
      passed: false,
      score: 0,
      details: [`Evaluation error: ${err instanceof Error ? err.message : String(err)}`],
      durationMs: Date.now() - start,
    };
  }
}

// ---------------------------------------------------------------------------
// New checks: real data binding quality
// ---------------------------------------------------------------------------

/**
 * Fast check: Scans rendered DOM text for placeholder strings.
 */
export async function checkNoRuntimePlaceholder(page: Page): Promise<QcCheckResult> {
  const start = Date.now();
  const PLACEHOLDERS = [
    '홍길동', '김철수', '이영희',
    'test@example.com', 'Loading...', '준비 중', '구현 예정', '곧 출시', '추후 업데이트',
    'Sample Data', 'Lorem ipsum', 'Lorem',
    'Coming soon', 'John Doe', 'Jane Smith', 'TBD', 'Placeholder', 'dummy',
  ];

  try {
    const bodyText = await page.evaluate(() => document.body.innerText);
    const found = PLACEHOLDERS.filter(p => bodyText.includes(p));

    // href="#" 링크 탐지
    const hrefHashCount = await page.$$eval('a[href="#"]', (els) => els.length).catch(() => 0);

    const allIssues = [
      ...found.map(p => `Placeholder 감지: "${p}"`),
      ...(hrefHashCount > 0 ? [`href="#" 링크 ${hrefHashCount}개 감지 — 실제 URL로 교체 필요`] : []),
    ];
    const passed = allIssues.length === 0;
    return {
      name: 'noRuntimePlaceholder',
      passed,
      score: passed ? 100 : Math.max(0, 100 - allIssues.length * 25),
      details: allIssues,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      name: 'noRuntimePlaceholder',
      passed: false,
      score: 0,
      details: [`Evaluation error: ${err instanceof Error ? err.message : String(err)}`],
      durationMs: Date.now() - start,
    };
  }
}

/**
 * Deep check: Clicks the first interactive button and checks if DOM changes.
 */
export async function checkInteractiveBehavior(page: Page): Promise<QcCheckResult> {
  const start = Date.now();
  try {
    const before = await page.evaluate(() => document.body.innerHTML.length);

    const buttons = await page.$$('button, [role="tab"]');
    let clicked = false;
    for (const btn of buttons.slice(0, 5)) {
      try {
        const visible = await btn.isVisible();
        if (visible) {
          await btn.click({ timeout: 2000 });
          clicked = true;
          break;
        }
      } catch {
        // try next
      }
    }

    if (!clicked) {
      return {
        name: 'interactiveBehavior',
        passed: true,
        score: 100,
        details: ['No clickable buttons found — skipping'],
        durationMs: Date.now() - start,
      };
    }

    await page.waitForTimeout(500);
    const after = await page.evaluate(() => document.body.innerHTML.length);
    const changed = Math.abs(after - before) > 10;

    return {
      name: 'interactiveBehavior',
      passed: changed,
      score: changed ? 100 : 30,
      details: changed ? [] : ['버튼 클릭 후 DOM 변화 없음 — 인터랙션이 동작하지 않을 수 있음'],
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      name: 'interactiveBehavior',
      passed: false,
      score: 0,
      details: [`Evaluation error: ${err instanceof Error ? err.message : String(err)}`],
      durationMs: Date.now() - start,
    };
  }
}

/**
 * Deep check: Checks whether any non-CDN network requests were made.
 * Call with request URLs collected via page.on('request').
 */
export function checkNetworkActivity(requests: string[]): QcCheckResult {
  const start = Date.now();
  const apiRequests = requests.filter(url =>
    !url.startsWith('data:') &&
    !url.includes('cdn.tailwindcss.com') &&
    !url.includes('cdn.jsdelivr.net') &&
    !url.includes('unpkg.com') &&
    !url.includes('cdnjs.cloudflare.com')
  );

  const passed = apiRequests.length > 0;
  return {
    name: 'networkActivity',
    passed,
    score: passed ? 100 : 20,
    details: passed
      ? apiRequests.slice(0, 3).map(u => `Request: ${u.slice(0, 80)}`)
      : ['페이지 로드 후 API 요청이 없습니다 — 실제 데이터 로딩이 없을 수 있음'],
    durationMs: Date.now() - start,
  };
}

/**
 * Deep check: Waits 3s after page load and checks if loading skeletons disappear.
 */
export async function checkLoadingStateDisappears(page: Page): Promise<QcCheckResult> {
  const start = Date.now();
  try {
    const LOADING_SELECTORS = ['.animate-pulse', '.skeleton', '[class*="loading"]', '[class*="skeleton"]'];
    let hadLoadingElements = false;

    for (const sel of LOADING_SELECTORS) {
      const count = await page.$$eval(sel, els => els.length);
      if (count > 0) { hadLoadingElements = true; break; }
    }

    if (!hadLoadingElements) {
      return {
        name: 'loadingStateDisappears',
        passed: true,
        score: 100,
        details: ['No loading skeleton elements found'],
        durationMs: Date.now() - start,
      };
    }

    await page.waitForTimeout(3000);

    let stillLoading = false;
    for (const sel of LOADING_SELECTORS) {
      const count = await page.$$eval(sel, els => els.length);
      if (count > 0) { stillLoading = true; break; }
    }

    const passed = !stillLoading;
    return {
      name: 'loadingStateDisappears',
      passed,
      score: passed ? 100 : 40,
      details: passed ? [] : ['3초 후에도 로딩 스켈레톤이 남아있습니다 — API 호출이 완료되지 않을 수 있음'],
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      name: 'loadingStateDisappears',
      passed: false,
      score: 0,
      details: [`Evaluation error: ${err instanceof Error ? err.message : String(err)}`],
      durationMs: Date.now() - start,
    };
  }
}

// ---------------------------------------------------------------------------
// Deep checks (original)
// ---------------------------------------------------------------------------

export async function checkAccessibility(page: Page): Promise<QcCheckResult> {
  const start = Date.now();
  try {
    const subChecks = {
      hasH1: false,
      noHeadingSkip: true,
      hasMain: false,
    };

    // Check h1 exists
    subChecks.hasH1 = (await page.$('h1')) !== null;

    // Check heading order — no skipping levels
    const headingLevels = await page.$$eval('h1,h2,h3,h4,h5,h6', (hs) =>
      hs.map((h) => parseInt(h.tagName[1], 10))
    );

    for (let i = 1; i < headingLevels.length; i++) {
      const prev = headingLevels[i - 1];
      const curr = headingLevels[i];
      if (curr > prev + 1) {
        subChecks.noHeadingSkip = false;
        break;
      }
    }

    // Check main exists
    subChecks.hasMain = (await page.$('main')) !== null;

    const passed = subChecks.hasH1 && subChecks.hasMain;
    const passedCount = Object.values(subChecks).filter(Boolean).length;
    const score = Math.round((passedCount / Object.keys(subChecks).length) * 100);

    const details: string[] = [];
    if (!subChecks.hasH1) details.push('Missing <h1> element');
    if (!subChecks.noHeadingSkip) details.push('Heading levels skip (e.g. h1 → h3)');
    if (!subChecks.hasMain) details.push('Missing <main> element');

    return {
      name: 'accessibility',
      passed,
      score,
      details,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      name: 'accessibility',
      passed: false,
      score: 0,
      details: [`Evaluation error: ${err instanceof Error ? err.message : String(err)}`],
      durationMs: Date.now() - start,
    };
  }
}
