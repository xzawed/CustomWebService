/**
 * Shared placeholder detection patterns used across code validation and runtime QC checks.
 * Ensures codeValidator.ts (static) and qcChecks.ts (Playwright DOM) use identical lists.
 */

export const PLACEHOLDER_STRINGS: string[] = [
  '홍길동', '김철수', '이영희',
  'test@example.com', 'user@test.com',
  'Loading...', '준비 중', '구현 예정', '곧 출시', '추후 업데이트',
  'Sample Data', 'Lorem ipsum', 'Lorem',
  'Coming soon', 'John Doe', 'Jane Smith', 'TBD', 'Placeholder', 'dummy',
];

const EXTRA_PATTERNS = [
  '\\$99\\.99',
  '\\b0[1-9]\\/0[1-9]\\/20\\d{2}\\b',
];

/**
 * Returns a fresh RegExp each call (global flag — avoids lastIndex side-effects).
 */
export function createPlaceholderRegex(): RegExp {
  const escaped = PLACEHOLDER_STRINGS.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp([...escaped, ...EXTRA_PATTERNS].join('|'), 'g');
}
