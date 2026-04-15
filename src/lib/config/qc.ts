function envInt(key: string, defaultValue: number): number {
  const val = process.env[key];
  if (!val) return defaultValue;
  const parsed = parseInt(val, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

export const QC_THRESHOLDS = {
  /** structuralScore 미달 시 재생성 트리거 */
  QUALITY: envInt('QC_QUALITY_THRESHOLD', 60),
  /** mobileScore 미달 시 재생성 트리거 */
  MOBILE: envInt('QC_MOBILE_THRESHOLD', 60),
  /** Fast QC overallScore 통과 기준 */
  FAST_PASS: envInt('QC_FAST_PASS_THRESHOLD', 60),
  /** Deep QC overallScore 통과 기준 (50 → 70으로 상향) */
  DEEP_PASS: envInt('QC_DEEP_PASS_THRESHOLD', 70),
} as const;

/**
 * Deep QC 체크별 가중치.
 * - 3: 치명적 (이 체크 실패 = 페이지 사용 불가)
 * - 2: 중요 (이 체크 실패 = 심각한 품질 문제)
 * - 1: 표준 (기본 가중치)
 *
 * 키는 QcCheckResult.name 과 정확히 일치해야 함.
 */
export const QC_WEIGHTS: Record<string, number> = {
  // Critical checks (weight 3) — 페이지 사용 불가 수준
  consoleErrors: 3,
  noRuntimePlaceholder: 3,
  networkActivity: 3,

  // Important checks (weight 2) — 심각한 품질 문제
  horizontalScroll: 2,
  footerVisible: 2,
  interactiveBehavior: 2,
  loadingStateDisappears: 2,

  // Standard checks (weight 1) — 기본
  noLayoutOverlap: 1,
  imageLoading: 1,
  touchTargets: 1,
  responsiveBreakpoints: 1,
  accessibility: 1,
} as const;

export const QC_TIMEOUTS = {
  /** Fast QC 전체 타임아웃 (ms) */
  FAST_MS: envInt('QC_FAST_TIMEOUT_MS', 3000),
  /** Deep QC 전체 타임아웃 (ms) */
  DEEP_MS: envInt('QC_DEEP_TIMEOUT_MS', 10000),
  /** 개별 체크 타임아웃 (ms) */
  CHECK_MS: envInt('QC_CHECK_TIMEOUT_MS', 1500),
  /** 페이지 setDefaultTimeout (ms) */
  PAGE_DEFAULT_MS: envInt('QC_PAGE_DEFAULT_TIMEOUT_MS', 5000),
  /** page.setContent waitUntil timeout for Fast QC (ms) */
  FAST_CONTENT_MS: envInt('QC_FAST_CONTENT_TIMEOUT_MS', 3000),
  /** page.setContent waitUntil timeout for Deep QC (ms) */
  DEEP_CONTENT_MS: envInt('QC_DEEP_CONTENT_TIMEOUT_MS', 8000),
} as const;

export const QC_VIEWPORTS = {
  /** Fast QC 뷰포트 */
  FAST: [375] as number[],
  /** Deep QC 뷰포트 (반응형 3단계) */
  DEEP: [375, 768, 1280] as number[],
} as const;
