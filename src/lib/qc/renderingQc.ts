import type { QcReport, QcCheckResult } from '@/types/qc';
import { logger } from '@/lib/utils/logger';
import { QC_THRESHOLDS, QC_TIMEOUTS, QC_VIEWPORTS, QC_WEIGHTS } from '@/lib/config/qc';
import { isQcEnabled, getPage, releasePage } from './browserPool';
import {
  checkConsoleErrors,
  checkHorizontalScroll,
  checkFooterVisible,
  checkNoLayoutOverlap,
  checkImageLoading,
  checkTouchTargets,
  checkResponsiveBreakpoints,
  checkAccessibility,
  checkNoRuntimePlaceholder,
  checkInteractiveBehavior,
  checkNetworkActivity,
  checkLoadingStateDisappears,
} from './qcChecks';
import type { Page } from 'playwright-core';

export { isQcEnabled } from './browserPool';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * 체크 결과 배열에서 가중 평균 점수를 계산한다.
 * QC_WEIGHTS에 없는 체크명은 기본 가중치 1을 사용한다.
 */
function calculateWeightedScore(checks: QcCheckResult[]): number {
  if (checks.length === 0) return 0;
  let weightedSum = 0;
  let totalWeight = 0;
  for (const check of checks) {
    const weight = QC_WEIGHTS[check.name] ?? 1;
    weightedSum += check.score * weight;
    totalWeight += weight;
  }
  return totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;
}

function buildReport(
  checks: QcCheckResult[],
  viewportsTested: number[],
  startTime: number,
  passThreshold: number
): QcReport {
  const overallScore = calculateWeightedScore(checks);
  return {
    overallScore,
    passed: overallScore >= passThreshold,
    checks,
    viewportsTested,
    durationMs: Date.now() - startTime,
    timestamp: new Date().toISOString(),
  };
}

function settledResults(
  results: PromiseSettledResult<QcCheckResult>[],
  names: string[]
): QcCheckResult[] {
  return results.map((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    return {
      name: names[i],
      passed: false,
      score: 0,
      details: [`Check threw: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`],
      durationMs: 0,
    };
  });
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`QC timeout after ${ms}ms`)), ms)
    ),
  ]);
}

async function withCheckTimeout<T>(fn: () => Promise<T>, name: string, timeoutMs = QC_TIMEOUTS.CHECK_MS): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Check timeout: ${name}`)), timeoutMs)
    ),
  ]);
}

// ---------------------------------------------------------------------------
// Fast QC
// ---------------------------------------------------------------------------

async function runFastQcInternal(html: string): Promise<QcReport> {
  const startTime = Date.now();
  const page: Page | null = await getPage();
  if (!page) {
    logger.warn('[QC] Fast QC: could not acquire page from pool');
    return buildReport([], QC_VIEWPORTS.FAST, startTime, QC_THRESHOLDS.FAST_PASS);
  }

  try {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.setViewportSize({ width: 375, height: 812 });
    page.setDefaultTimeout(QC_TIMEOUTS.PAGE_DEFAULT_MS);
    await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: QC_TIMEOUTS.FAST_CONTENT_MS });

    const [scrollResult, footerResult, overlapResult, placeholderResult] = settledResults(
      await Promise.allSettled([
        withCheckTimeout(() => checkHorizontalScroll(page, 375), 'horizontalScroll'),
        withCheckTimeout(() => checkFooterVisible(page), 'footerVisible'),
        withCheckTimeout(() => checkNoLayoutOverlap(page), 'noLayoutOverlap'),
        withCheckTimeout(() => checkNoRuntimePlaceholder(page), 'noRuntimePlaceholder'),
      ]),
      ['horizontalScroll', 'footerVisible', 'noLayoutOverlap', 'noRuntimePlaceholder']
    );

    const consoleResult = checkConsoleErrors(errors);

    const checks = [consoleResult, scrollResult, footerResult, overlapResult, placeholderResult];
    return buildReport(checks, QC_VIEWPORTS.FAST, startTime, QC_THRESHOLDS.FAST_PASS);
  } finally {
    await releasePage(page);
  }
}

export async function runFastQc(html: string): Promise<QcReport | null> {
  if (!isQcEnabled()) return null;

  try {
    return await withTimeout(runFastQcInternal(html), QC_TIMEOUTS.FAST_MS);
  } catch (err) {
    logger.error('[QC] Fast QC failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

// ---------------------------------------------------------------------------
// Deep QC
// ---------------------------------------------------------------------------

async function runDeepQcInternal(html: string): Promise<QcReport> {
  const startTime = Date.now();
  const page: Page | null = await getPage();
  if (!page) {
    logger.warn('[QC] Deep QC: could not acquire page from pool');
    return buildReport([], QC_VIEWPORTS.DEEP, startTime, QC_THRESHOLDS.DEEP_PASS);
  }

  try {
    const errors: string[] = [];
    const networkRequests: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('request', (req) => networkRequests.push(req.url()));

    await page.setViewportSize({ width: 375, height: 812 });
    page.setDefaultTimeout(QC_TIMEOUTS.PAGE_DEFAULT_MS);
    await page.setContent(html, { waitUntil: 'networkidle', timeout: QC_TIMEOUTS.DEEP_CONTENT_MS });

    // Step 1: Run all viewport-fixed checks in parallel (viewport stays at 375px)
    const [
      scrollResult,
      footerResult,
      overlapResult,
      imageResult,
      touchResult,
      a11yResult,
      placeholderResult,
    ] = settledResults(
      await Promise.allSettled([
        withCheckTimeout(() => checkHorizontalScroll(page, 375), 'horizontalScroll'),
        withCheckTimeout(() => checkFooterVisible(page), 'footerVisible'),
        withCheckTimeout(() => checkNoLayoutOverlap(page), 'noLayoutOverlap'),
        withCheckTimeout(() => checkImageLoading(page), 'imageLoading'),
        withCheckTimeout(() => checkTouchTargets(page), 'touchTargets'),
        withCheckTimeout(() => checkAccessibility(page), 'accessibility'),
        withCheckTimeout(() => checkNoRuntimePlaceholder(page), 'noRuntimePlaceholder'),
      ]),
      [
        'horizontalScroll',
        'footerVisible',
        'noLayoutOverlap',
        'imageLoading',
        'touchTargets',
        'accessibility',
        'noRuntimePlaceholder',
      ]
    );

    // Step 2: Run viewport-changing check alone after the above complete
    const [breakpointResult] = settledResults(
      await Promise.allSettled([
        withCheckTimeout(() => checkResponsiveBreakpoints(page), 'responsiveBreakpoints'),
      ]),
      ['responsiveBreakpoints']
    );

    const consoleResult = checkConsoleErrors(errors);
    const networkResult = checkNetworkActivity(networkRequests);

    const [interactResult, loadingResult] = settledResults(
      await Promise.allSettled([
        withCheckTimeout(() => checkInteractiveBehavior(page), 'interactiveBehavior'),
        withCheckTimeout(() => checkLoadingStateDisappears(page), 'loadingStateDisappears'),
      ]),
      ['interactiveBehavior', 'loadingStateDisappears']
    );

    const checks = [
      consoleResult,
      scrollResult,
      footerResult,
      overlapResult,
      imageResult,
      touchResult,
      breakpointResult,
      a11yResult,
      networkResult,
      interactResult,
      loadingResult,
      placeholderResult,
    ];
    return buildReport(checks, QC_VIEWPORTS.DEEP, startTime, QC_THRESHOLDS.DEEP_PASS);
  } finally {
    await releasePage(page);
  }
}

export async function runDeepQc(html: string): Promise<QcReport | null> {
  if (!isQcEnabled()) return null;

  try {
    return await withTimeout(runDeepQcInternal(html), QC_TIMEOUTS.DEEP_MS);
  } catch (err) {
    logger.error('[QC] Deep QC failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
