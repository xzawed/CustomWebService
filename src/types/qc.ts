export interface QcCheckResult {
  name: string;
  passed: boolean;
  score: number;
  details: string[];
  durationMs: number;
}

export interface QcReport {
  overallScore: number;
  passed: boolean;
  checks: QcCheckResult[];
  viewportsTested: number[];
  durationMs: number;
  timestamp: string;
}
