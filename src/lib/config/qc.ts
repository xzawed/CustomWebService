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
  /** Deep QC overallScore 통과 기준 */
  DEEP_PASS: envInt('QC_DEEP_PASS_THRESHOLD', 50),
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
