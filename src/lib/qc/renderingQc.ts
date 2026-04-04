import type { QcReport, QcCheckResult } from '@/types/qc';
import { logger } from '@/lib/utils/logger';
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
} from './qcChecks';
import type { Page } from 'playwright-core';

export { isQcEnabled } from './browserPool';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildReport(
  checks: QcCheckResult[],
  viewportsTested: number[],
  startTime: number,
  passThreshold: number
): QcReport {
  const overallScore =
    checks.length > 0
      ? Math.round(checks.reduce((sum, c) => sum + c.score, 0) / checks.length)
      : 0;
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

// ---------------------------------------------------------------------------
// Fast QC
// ---------------------------------------------------------------------------

async function runFastQcInternal(html: string): Promise<QcReport> {
  const startTime = Date.now();
  const page: Page | null = await getPage();
  if (!page) {
    logger.warn('[QC] Fast QC: could not acquire page from pool');
    return buildReport([], [375], startTime, 60);
  }

  try {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.setViewportSize({ width: 375, height: 812 });
    await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 3000 });

    const [scrollResult, footerResult, overlapResult] = settledResults(
      await Promise.allSettled([
        checkHorizontalScroll(page, 375),
        checkFooterVisible(page),
        checkNoLayoutOverlap(page),
      ]),
      ['horizontalScroll', 'footerVisible', 'noLayoutOverlap']
    );

    const consoleResult = checkConsoleErrors(errors);

    const checks = [consoleResult, scrollResult, footerResult, overlapResult];
    return buildReport(checks, [375], startTime, 60);
  } finally {
    await releasePage(page);
  }
}

export async function runFastQc(html: string): Promise<QcReport | null> {
  if (!isQcEnabled()) return null;

  try {
    return await withTimeout(runFastQcInternal(html), 3000);
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
    return buildReport([], [375, 768, 1280], startTime, 50);
  }

  try {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.setViewportSize({ width: 375, height: 812 });
    await page.setContent(html, { waitUntil: 'networkidle', timeout: 8000 });

    const [
      scrollResult,
      footerResult,
      overlapResult,
      imageResult,
      touchResult,
      breakpointResult,
      a11yResult,
    ] = settledResults(
      await Promise.allSettled([
        checkHorizontalScroll(page, 375),
        checkFooterVisible(page),
        checkNoLayoutOverlap(page),
        checkImageLoading(page),
        checkTouchTargets(page),
        checkResponsiveBreakpoints(page),
        checkAccessibility(page),
      ]),
      [
        'horizontalScroll',
        'footerVisible',
        'noLayoutOverlap',
        'imageLoading',
        'touchTargets',
        'responsiveBreakpoints',
        'accessibility',
      ]
    );

    const consoleResult = checkConsoleErrors(errors);

    const checks = [
      consoleResult,
      scrollResult,
      footerResult,
      overlapResult,
      imageResult,
      touchResult,
      breakpointResult,
      a11yResult,
    ];
    return buildReport(checks, [375, 768, 1280], startTime, 50);
  } finally {
    await releasePage(page);
  }
}

export async function runDeepQc(html: string): Promise<QcReport | null> {
  if (!isQcEnabled()) return null;

  try {
    return await withTimeout(runDeepQcInternal(html), 10000);
  } catch (err) {
    logger.error('[QC] Deep QC failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
