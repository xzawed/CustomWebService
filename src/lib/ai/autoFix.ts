/**
 * Deterministic rules applied before quality-loop LLM retries.
 * When these fixes resolve all shouldRetryGeneration issues, the LLM call is skipped entirely.
 * Rules: (1) CDN http→https, (2) TODO comment removal, (3) placeholder replacement.
 */

// Known-safe CDN hostnames for http→https upgrade (allowlist, not broad http replacement)
const CDN_HOST_PATTERN =
  /http:\/\/(cdn\.tailwindcss\.com|unpkg\.com|cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|fonts\.googleapis\.com|fonts\.gstatic\.com|ajax\.googleapis\.com|code\.jquery\.com)/g;

const NAME_REPLACEMENTS: ReadonlyArray<readonly [string, string]> = [
  ['홍길동', '사용자'],
  ['김철수', '사용자'],
  ['이영희', '사용자'],
  ['John Doe', 'User'],
  ['Jane Smith', 'User'],
] as const;

const REMOVABLE_PLACEHOLDERS: ReadonlyArray<string> = [
  'test@example.com',
  'user@test.com',
  'Sample Data',
  'Lorem ipsum',
  'Lorem',
  'TBD',
  'Placeholder',
  'dummy',
  'Coming soon',
];

export interface AutoFixResult {
  html: string;
  css: string;
  js: string;
  /** Human-readable summary of each rule that changed something, e.g. ["CDN http→https (2건)", "TODO 주석 제거 (1건)"] */
  fixesApplied: string[];
}

function upgradeCdnHttps(code: string): { code: string; count: number } {
  let count = 0;
  const upgraded = code.replace(CDN_HOST_PATTERN, (_match, host: string) => {
    count++;
    return `https://${host}`;
  });
  return { code: upgraded, count };
}

function removeTodoComments(code: string): { code: string; count: number } {
  let count = 0;
  // Remove single-line JS // TODO comments
  const noJsTodo = code.replace(/\/\/\s*TODO[^\n]*/g, () => {
    count++;
    return '';
  });
  // Remove HTML <!-- TODO ... --> comments (multiline)
  const noHtmlTodo = noJsTodo.replace(/<!--\s*TODO[\s\S]*?-->/g, () => {
    count++;
    return '';
  });
  return { code: noHtmlTodo, count };
}

function fixPlaceholders(
  html: string,
  js: string,
): { html: string; js: string; count: number } {
  let count = 0;
  let fixedHtml = html;
  let fixedJs = js;

  for (const [pattern, replacement] of NAME_REPLACEMENTS) {
    const regex = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    fixedHtml = fixedHtml.replace(regex, () => {
      count++;
      return replacement;
    });
    fixedJs = fixedJs.replace(regex, () => {
      count++;
      return replacement;
    });
  }

  for (const pattern of REMOVABLE_PLACEHOLDERS) {
    const regex = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    fixedHtml = fixedHtml.replace(regex, () => {
      count++;
      return '';
    });
    fixedJs = fixedJs.replace(regex, () => {
      count++;
      return '';
    });
  }

  return { html: fixedHtml, js: fixedJs, count };
}

export function applyAutoFix(parsed: {
  html: string;
  css: string;
  js: string;
}): AutoFixResult {
  const fixesApplied: string[] = [];
  let { html, css, js } = parsed;

  // Rule 1: CDN http → https
  const { code: html1, count: httpsHtmlCount } = upgradeCdnHttps(html);
  const { code: js1, count: httpsJsCount } = upgradeCdnHttps(js);
  html = html1;
  js = js1;
  const httpsTotal = httpsHtmlCount + httpsJsCount;
  if (httpsTotal > 0) fixesApplied.push(`CDN http→https (${httpsTotal}건)`);

  // Rule 2: TODO comment removal
  const { code: html2, count: todoHtmlCount } = removeTodoComments(html);
  const { code: js2, count: todoJsCount } = removeTodoComments(js);
  html = html2;
  js = js2;
  const todoTotal = todoHtmlCount + todoJsCount;
  if (todoTotal > 0) fixesApplied.push(`TODO 주석 제거 (${todoTotal}건)`);

  // Rule 3: Placeholder replacement/removal
  const { html: html3, js: js3, count: placeholderTotal } = fixPlaceholders(html, js);
  html = html3;
  js = js3;
  if (placeholderTotal > 0) fixesApplied.push(`Placeholder 제거 (${placeholderTotal}건)`);

  // css intentionally excluded: CDN/placeholder issues occur in html and js only
  return { html, css, js, fixesApplied };
}
