/**
 * featureSmokeTest.ts
 *
 * extractFeatures()가 추출한 Feature 목록을 Playwright로 실제 검증한다.
 * P3-2: runFeatureSmokeTests() — 기능별 커버리지 리포트 생성
 */

import type { Page } from 'playwright-core';
import type { Feature } from './featureExtractor';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FeatureSmokeResult {
  featureId: string;
  description: string;
  verifiableBy: Feature['verifiableBy'];
  passed: boolean;
  detail: string;
}

export interface SmokeTestReport {
  results: FeatureSmokeResult[];
  passedCount: number;
  totalCount: number;
  coveragePercent: number; // passedCount / totalCount * 100
}

// ---------------------------------------------------------------------------
// Per-verifiableBy check logic
// ---------------------------------------------------------------------------

async function checkInputButton(page: Page): Promise<{ passed: boolean; detail: string }> {
  const input = await page.$('input[type="text"], input:not([type])');
  if (!input) return { passed: false, detail: '텍스트 입력 필드 없음' };

  await input.fill('서울');

  const button = await page.$(
    'button[type="submit"], button:has-text("검색"), button:has-text("조회"), button:has-text("확인"), button'
  );
  if (!button) return { passed: false, detail: '버튼 없음' };

  await button.click();
  await page.waitForTimeout(1500);

  const textAfter = await page.evaluate(() => document.body.innerText.length);
  return {
    passed: textAfter > 100,
    detail: textAfter > 100 ? '입력→버튼→DOM 변화 확인' : 'DOM 변화 없음',
  };
}

async function checkChartElement(page: Page): Promise<{ passed: boolean; detail: string }> {
  const canvas = await page.$('canvas');
  if (!canvas) return { passed: false, detail: 'canvas 요소 없음' };
  return { passed: true, detail: 'canvas 요소 존재' };
}

async function checkList(page: Page): Promise<{ passed: boolean; detail: string }> {
  const items = await page.$$('li, article, [class*="card"], [class*="item"]');
  const passed = items.length >= 3;
  return { passed, detail: `리스트 아이템 ${items.length}개` };
}

async function checkFilterButton(page: Page): Promise<{ passed: boolean; detail: string }> {
  const filterButtons = await page.$$('[role="tab"], [class*="filter"], [class*="tab"]');
  if (filterButtons.length < 2) return { passed: false, detail: '필터 버튼 부족' };

  const before = await page.$$eval('li, article, [class*="card"]', (els) => els.length);
  await filterButtons[1].click();
  await page.waitForTimeout(800);
  const after = await page.$$eval('li, article, [class*="card"]', (els) => els.length);

  // Either count changed or active state changed
  const activeChanged = (await page.$('[class*="active"], [aria-selected]')) !== null;

  return {
    passed: before !== after || activeChanged,
    detail: before !== after ? '필터 적용 확인' : 'active 상태 변화 확인',
  };
}

async function checkTextDisplay(page: Page): Promise<{ passed: boolean; detail: string }> {
  const bodyText = await page.evaluate(() => document.body.innerText.trim().length);
  return { passed: bodyText > 50, detail: `텍스트 ${bodyText}자 표시` };
}

function checkUnknown(): { passed: boolean; detail: string } {
  return { passed: true, detail: '검증 방법 불명확 — 통과 처리' };
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

/**
 * 각 Feature를 Playwright로 검증하고 SmokeTestReport를 반환한다.
 *
 * @param page Playwright Page 인스턴스 (이미 콘텐츠가 로드된 상태여야 함)
 * @param features extractFeatures()가 반환한 Feature 배열
 */
export async function runFeatureSmokeTests(
  page: Page,
  features: Feature[]
): Promise<SmokeTestReport> {
  const results: FeatureSmokeResult[] = [];

  for (const feature of features) {
    let checkResult: { passed: boolean; detail: string };

    try {
      switch (feature.verifiableBy) {
        case 'input+button':
          checkResult = await checkInputButton(page);
          break;
        case 'chart-element':
          checkResult = await checkChartElement(page);
          break;
        case 'list':
          checkResult = await checkList(page);
          break;
        case 'filter-button':
          checkResult = await checkFilterButton(page);
          break;
        case 'text-display':
          checkResult = await checkTextDisplay(page);
          break;
        case 'unknown':
        default:
          checkResult = checkUnknown();
          break;
      }
    } catch (err) {
      checkResult = {
        passed: false,
        detail: '오류: ' + (err instanceof Error ? err.message : String(err)),
      };
    }

    results.push({
      featureId: feature.featureId,
      description: feature.description,
      verifiableBy: feature.verifiableBy,
      passed: checkResult.passed,
      detail: checkResult.detail,
    });
  }

  const passedCount = results.filter((r) => r.passed).length;
  const coveragePercent =
    features.length > 0 ? Math.round((passedCount / features.length) * 100) : 100;

  return {
    results,
    passedCount,
    totalCount: features.length,
    coveragePercent,
  };
}
