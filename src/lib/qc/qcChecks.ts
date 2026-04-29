import type { Page, ElementHandle } from 'playwright-core';
import type { QcCheckResult } from '@/types/qc';
import { PLACEHOLDER_STRINGS } from '@/lib/ai/placeholderPatterns';

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

  try {
    const bodyText = await page.evaluate(() => document.body.innerText);
    const found = PLACEHOLDER_STRINGS.filter(p => bodyText.includes(p));

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

// ---------------------------------------------------------------------------
// interactiveBehavior sub-check helpers
// ---------------------------------------------------------------------------

interface SubCheckResult {
  found: boolean;
  passed: boolean;
  detail: string;
}

/**
 * Sub-check 1: Fill a text input and click a nearby button, then verify DOM changed.
 */
async function subCheckInputAction(page: Page): Promise<SubCheckResult> {
  // Find first visible text input
  const inputs = await page.$$('input[type="text"], input:not([type]), textarea');
  let foundInput = false;
  for (const input of inputs.slice(0, 5)) {
    try {
      const visible = await input.isVisible();
      if (!visible) continue;
      foundInput = true;

      // Fill with test value
      await input.fill('Seoul');

      // Look for a nearby button: submit button, search button, or first button
      const button = await page.$('button[type="submit"], button[type="search"], input[type="submit"]') ??
        await page.$('button');
      if (!button) {
        return { found: true, passed: false, detail: '입력 필드 있음 — 클릭 가능한 버튼 없음' };
      }

      const btnVisible = await button.isVisible();
      if (!btnVisible) {
        return { found: true, passed: false, detail: '입력 필드 있음 — 버튼이 보이지 않음' };
      }

      // Capture state before click
      const beforeText = await page.evaluate(() => document.body.innerText);
      const beforeCount = await page.evaluate(() => document.body.querySelectorAll('*').length);

      await button.click({ timeout: 2000 });
      await page.waitForTimeout(1500);

      const afterText = await page.evaluate(() => document.body.innerText);
      const afterCount = await page.evaluate(() => document.body.querySelectorAll('*').length);

      const textChanged = Math.abs(afterText.length - beforeText.length) > 20;
      const domChanged = Math.abs(afterCount - beforeCount) > 0;

      if (textChanged || domChanged) {
        return { found: true, passed: true, detail: '입력+버튼 플로우: DOM 변화 확인됨' };
      } else {
        return { found: true, passed: false, detail: '입력+버튼 클릭 후 DOM 변화 없음 — 인터랙션이 동작하지 않을 수 있음' };
      }
    } catch {
      // try next input
    }
  }

  if (!foundInput) {
    return { found: false, passed: false, detail: '텍스트 입력 필드 없음' };
  }
  return { found: true, passed: false, detail: '텍스트 입력 필드 처리 중 오류' };
}

/**
 * Sub-check 2: Click a filter/tab button in a group of 3+ and verify something changed.
 */
async function subCheckFilterTab(page: Page): Promise<SubCheckResult> {
  // Look for tab/filter button groups: role="tab", or buttons with @click, or sibling button groups
  const candidates = await page.$$('[role="tab"], [x-on\\:click], [\\@click]');

  // If no explicit tab/filter found, look for groups of 3+ sibling buttons
  let targetButton = candidates.length >= 2 ? candidates[1] : null;

  if (!targetButton) {
    // Heuristic: find a parent element with 3+ direct button children
    const groupParent = await page.evaluateHandle(() => {
      const allButtons = Array.from(document.querySelectorAll('button'));
      const parents = new Map<Element, Element[]>();
      for (const btn of allButtons) {
        const parent = btn.parentElement;
        if (!parent) continue;
        if (!parents.has(parent)) parents.set(parent, []);
        parents.get(parent)!.push(btn);
      }
      for (const [, btns] of parents) {
        if (btns.length >= 3) {
          // Return the second button (index 1) to avoid first = submit/action
          return btns[1] ?? null;
        }
      }
      return null;
    });

    // Check if the handle is a real element
    const asElement = groupParent.asElement() as ElementHandle<HTMLElement | SVGElement> | null;
    if (asElement) {
      targetButton = asElement;
    }
  }

  if (!targetButton) {
    return { found: false, passed: false, detail: '필터/탭 버튼 그룹 없음' };
  }

  try {
    const visible = await targetButton.isVisible();
    if (!visible) {
      return { found: true, passed: false, detail: '필터/탭 버튼이 보이지 않음' };
    }

    const beforeListCount = await page.evaluate(() =>
      document.querySelectorAll('li, .card, article, [class*="item"], [class*="card"]').length
    );
    const beforeActiveClass = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[class*="active"], [aria-selected="true"]'))
        .map(el => el.className).join(',')
    );

    await targetButton.click({ timeout: 2000 });
    await page.waitForTimeout(800);

    const afterListCount = await page.evaluate(() =>
      document.querySelectorAll('li, .card, article, [class*="item"], [class*="card"]').length
    );
    const afterActiveClass = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[class*="active"], [aria-selected="true"]'))
        .map(el => el.className).join(',')
    );

    const listChanged = afterListCount !== beforeListCount;
    const activeChanged = afterActiveClass !== beforeActiveClass;

    if (listChanged || activeChanged) {
      return { found: true, passed: true, detail: '필터/탭 클릭 후 변화 확인됨' };
    } else {
      return { found: true, passed: false, detail: '필터/탭 클릭 후 변화 없음 — 필터/탭이 동작하지 않을 수 있음' };
    }
  } catch {
    return { found: true, passed: false, detail: '필터/탭 클릭 중 오류 발생' };
  }
}

/**
 * Deep check: Tests real interactive behavior via two sub-checks:
 *   1. Input + action flow (fill text input → click button → verify DOM change)
 *   2. Filter/tab interaction (click 2nd+ button in a group → verify change)
 *
 * Scoring:
 *   - Both pass:                           100
 *   - Sub-check 1 passes, 2 not found:     80
 *   - Sub-check 1 not found, 2 passes:     80
 *   - Neither found (display-only page):   70
 *   - One found and fails:                 40
 *   - Both found and both fail:            0
 */
export async function checkInteractiveBehavior(page: Page): Promise<QcCheckResult> {
  const start = Date.now();
  try {
    const [sub1, sub2] = await Promise.all([
      subCheckInputAction(page),
      subCheckFilterTab(page),
    ]);

    const details: string[] = [];
    if (sub1.detail) details.push(`[입력플로우] ${sub1.detail}`);
    if (sub2.detail) details.push(`[필터/탭] ${sub2.detail}`);

    let score: number;
    let passed: boolean;

    if (sub1.found && sub2.found) {
      if (sub1.passed && sub2.passed) {
        score = 100;
        passed = true;
      } else if (sub1.passed || sub2.passed) {
        score = 40;
        passed = false;
      } else {
        score = 0;
        passed = false;
      }
    } else if (!sub1.found && !sub2.found) {
      // Display-only page — neutral
      score = 70;
      passed = true;
    } else if (sub1.found && !sub2.found) {
      score = sub1.passed ? 80 : 40;
      passed = sub1.passed;
    } else {
      // !sub1.found && sub2.found
      score = sub2.passed ? 80 : 40;
      passed = sub2.passed;
    }

    return {
      name: 'interactiveBehavior',
      passed,
      score,
      details,
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
