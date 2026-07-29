import { createPlaceholderRegex } from '@/lib/ai/placeholderPatterns';

export interface ValidationResult {
  passed: boolean;
  errors: string[];
  warnings: string[];
}

// Patterns that indicate definite API key hardcoding (very specific formats)
const DEFINITE_KEY_PATTERNS = [
  /\bsk-[a-zA-Z0-9]{20,}\b/,            // OpenAI / Anthropic style keys
  /\bsk_live_[a-zA-Z0-9]{24,}\b/,       // Stripe live secret keys
  /\bAIza[a-zA-Z0-9_-]{35}\b/,          // Google API keys
  /\bghp_[a-zA-Z0-9]{36}\b/,            // GitHub personal access tokens
  /\bxoxb-[0-9]+-[a-zA-Z0-9-]+\b/,      // Slack bot tokens
  /\bAKIA[0-9A-Z]{16}\b/,               // AWS access key IDs
];

// Patterns that suggest possible API key usage (warn, don't block)
const SUSPICIOUS_KEY_PATTERNS = [
  /api[_-]?key\s*[:=]\s*['"][^'"{\s]{16,}['"]/i,
  /secret[_-]?key\s*[:=]\s*['"][^'"{\s]{16,}['"]/i,
  /access[_-]?token\s*[:=]\s*['"][^'"{\s]{16,}['"]/i,
];

export function validateSecurity(code: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Block: eval() usage
  if (/\beval\s*\(/.test(code)) {
    errors.push('eval() 사용이 감지되었습니다. 보안상 허용되지 않습니다.');
  }

  // Warn: inline script tags (assembleHtml strips them anyway; warn instead of block)
  if (/<script(?!\s[^>]*\bsrc\s*=)[^>]*>/i.test(code)) {
    warnings.push('AI 생성 코드에 인라인 스크립트가 감지되었습니다. 렌더링 시 자동으로 제거됩니다.');
  }

  // Block: definite hardcoded key formats
  for (const pattern of DEFINITE_KEY_PATTERNS) {
    if (pattern.test(code)) {
      errors.push('하드코딩된 API 키 형식이 감지되었습니다.');
      break;
    }
  }

  // Warn: innerHTML assignment
  if (/\.innerHTML\s*=/.test(code)) {
    warnings.push('innerHTML 사용이 감지되었습니다. XSS 위험이 있을 수 있습니다.');
  }

  // Warn: suspicious key assignment patterns
  for (const pattern of SUSPICIOUS_KEY_PATTERNS) {
    if (pattern.test(code)) {
      warnings.push('API 키를 직접 코드에 작성하는 패턴이 감지되었습니다.');
      break;
    }
  }

  // Warn: document.write
  if (/document\.write\s*\(/.test(code)) {
    warnings.push('document.write() 사용이 감지되었습니다.');
  }

  return {
    passed: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * 따옴표 안의 `>`(예: x-init="$nextTick(() => init())")를 보존하며 여는 태그를 순회한다.
 * 단순 `[^>]*` 스캔은 화살표 함수의 `>`에서 태그가 잘려 오탐·미탐이 난다.
 *
 * 정식 HTML 파서가 아니다 — `<script>` 본문의 `a<b` 같은 표현을 태그 시작으로 오인할 수
 * 있다. 그 경우에도 잘라낸 조각에 `x-data`와 `x-init`이 동시에 들어 있어야 경고가 나므로
 * 실질 오탐 가능성은 낮고, 결과는 경고(비차단)라 영향이 제한적이다. 정확도가 더 필요해지면
 * 파서로 교체할 것.
 */
function forEachHtmlOpenTag(html: string, onTag: (tag: string) => void): void {
  const len = html.length;
  let i = 0;
  while (i < len) {
    if (html[i] === '<' && i + 1 < len && /[a-zA-Z]/i.test(html[i + 1]!)) {
      const start = i;
      i += 2;
      let quote: '"' | "'" | null = null;
      while (i < len) {
        const c = html[i]!;
        if (quote !== null) {
          if (c === quote) {
            quote = null;
          }
        } else if (c === '"' || c === "'") {
          quote = c;
        } else if (c === '>') {
          onTag(html.slice(start, i + 1));
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }
    i += 1;
  }
}

/**
 * Alpine.js 이중 init() 호출 패턴을 정적 검출한다.
 *
 * Alpine은 x-data 컴포넌트 마운트 시 데이터 객체의 init()을 자동 호출한다.
 * 같은 요소에 x-init="init()"을 쓰면 init()이 두 번 실행되어 API 중복 요청·레이트리밋
 * 오류 등이 발생할 수 있다. 데이터 객체에 init이 없으면 ReferenceError가 난다.
 * 어느 쪽이든 버그이므로 JS 본문 검사 없이 HTML 속성만으로 판정한다.
 *
 * @returns 위반 요소당 한국어 경고 메시지 1개 (없으면 빈 배열)
 */
export function detectAlpineDoubleInit(html: string): string[] {
  if (!html) {
    return [];
  }

  const warnings: string[] = [];
  // 메서드명이 정확히 init 인 호출만 — initialize/initChart/myInit 등은 제외
  const initCallRegex = /\binit\s*\(/;

  forEachHtmlOpenTag(html, (tag) => {
    // x-data 존재 여부. **값이 없는 `x-data`도 포함한다** — Alpine은 이를 빈 객체로 취급하므로
    // x-init의 init() 호출이 ReferenceError로 죽는다(값 있는 경우의 이중 실행과 마찬가지로 버그).
    if (!/\bx-data\b/i.test(tag)) {
      return;
    }

    // x-init 값 추출 (쌍/홑따옴표)
    const xInitMatch = /\bx-init\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tag);
    if (!xInitMatch) {
      return;
    }

    const expression = xInitMatch[1] ?? xInitMatch[2] ?? '';
    if (initCallRegex.test(expression)) {
      // 위반이 여러 개일 때 메시지가 전부 같으면 어느 요소를 고쳐야 할지 알 수 없다 —
      // 문제의 식을 그대로 실어 지목 가능하게 한다.
      warnings.push(
        `Alpine.js 컴포넌트에 x-init="${expression}" 이 감지되었습니다. ` +
          'Alpine은 마운트 시 데이터 객체의 init()을 자동 호출하므로 x-init에서 다시 부르면 이중 실행됩니다 ' +
          '(API 중복 요청·레이트리밋 오류 등). x-init에서 init() 호출을 제거하고 본문만 데이터 객체에 두세요.',
      );
    }
  });

  return warnings;
}

export function validateFunctionality(html: string, _css: string, js: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!html.includes('<!DOCTYPE') && !html.includes('<html')) {
    warnings.push('HTML 문서 구조가 불완전합니다.');
  }

  if (!html.includes('viewport')) {
    warnings.push('viewport 메타 태그가 없습니다. 반응형 디자인이 적용되지 않을 수 있습니다.');
  }

  if (js) {
    const opens = (js.match(/\{/g) ?? []).length;
    const closes = (js.match(/\}/g) ?? []).length;
    if (Math.abs(opens - closes) > 3) {
      warnings.push('JavaScript 코드의 중괄호 수가 불일치합니다.');
    }
  }

  // Alpine 이중 init — 품질 신호(경고)만; 게시를 막지 않음
  warnings.push(...detectAlpineDoubleInit(html));

  return {
    passed: errors.length === 0,
    errors,
    warnings,
  };
}

export interface QualityMetrics {
  structuralScore: number;
  mobileScore: number;
  hasSemanticHtml: boolean;
  hasMockData: boolean;
  hasInteraction: boolean;
  hasResponsiveClasses: boolean;
  hasAdequateResponsive: boolean;
  noFixedOverflow: boolean;
  hasImageProtection: boolean;
  hasMobileNav: boolean;
  hasFooter: boolean;
  hasImgAlt: boolean;
  // New real-data binding fields (after hasImgAlt)
  fetchCallCount: number;
  hasProxyCall: boolean;
  hasJsonParse: boolean;
  placeholderCount: number;
  hardcodedArrayCount: number;
  // Informational: did the AI include Tailwind CDN in the raw HTML?
  // assembleHtml() always re-injects it regardless, so this does not affect scoring.
  hasTailwindCdn: boolean;
  details: string[];
}

interface DataBindingResult {
  fetchCallCount: number;
  hasProxyCall: boolean;
  hasJsonParse: boolean;
  placeholderCount: number;
  hardcodedArrayCount: number;
  score: number;
  details: string[];
}

export function evaluateDataBinding(js: string, combinedCode: string, _fullCode?: string): DataBindingResult {
  const fetchCallCount = (js.match(/\bfetch\s*\(/g) ?? []).length;
  const hasProxyCall = /\/api\/v1\/proxy/.test(js);
  const hasJsonParse = /\.json\(\)|JSON\.parse\s*\(/.test(js);
  const hrefPlaceholderCount = [...combinedCode.matchAll(/href\s*=\s*["']#["']/g)].length;
  const placeholderCount = [...combinedCode.matchAll(createPlaceholderRegex())].length + hrefPlaceholderCount;
  const hardcodedArrayCount = (combinedCode.match(
    /const\s+[A-Z]?\w+\s*=\s*\[\s*\{[\s\S]*?\}\s*(,\s*\{[\s\S]*?\}\s*)?\]/gm
  ) ?? []).length;

  let score = 0;
  const details: string[] = [];
  if (fetchCallCount > 0) score++; else details.push('fetch() 호출이 없습니다 — 실제 API 호출 필수');
  if (hasJsonParse) score++; else details.push('.json() 또는 JSON.parse() 없음 — API 응답 파싱 필요');
  if (placeholderCount === 0) score++;
  else details.push(`Placeholder 문자열 감지 (${placeholderCount}개): 홍길동, 준비 중, href="#" 등 제거 필요`);
  return { fetchCallCount, hasProxyCall, hasJsonParse, placeholderCount, hardcodedArrayCount, score, details };
}

interface StructureResult {
  hasSemanticHtml: boolean;
  hasFooter: boolean;
  hasImgAlt: boolean;
  score: number;
  details: string[];
}

export function evaluateStructure(html: string, combinedCode: string): StructureResult {
  const semanticTags = ['<main', '<nav', '<footer', '<section', '<article'];
  const semanticCount = semanticTags.filter((tag) => html.includes(tag)).length;
  const hasSemanticHtml = semanticCount >= 2;
  const hasFooter = /<footer[\s>]/i.test(html);
  const imgTags = html.match(/<img\s[^>]*>/gi) ?? [];
  const imgsWithAlt = imgTags.filter((tag) => /\balt\s*=/i.test(tag)).length;
  const hasImgAlt = imgTags.length === 0 || imgsWithAlt >= imgTags.length * 0.7;
  const hasTransitions = /transition|animate|animation/i.test(combinedCode);
  const hasKorean = /[가-힯]/.test(combinedCode);
  const hasGridOrFlex = /grid-cols|flex\s|flex-|display:\s*flex|display:\s*grid/i.test(combinedCode);

  let score = 0;
  const details: string[] = [];
  if (hasSemanticHtml) score++; else details.push(`시맨틱 HTML 부족 (${semanticCount}/2 태그)`);
  if (hasFooter) score++; else details.push('<footer> 태그가 없습니다');
  if (hasImgAlt) score++; else details.push(`이미지 alt 속성 부족 (${imgsWithAlt}/${imgTags.length})`);
  if (hasTransitions) score++; else details.push('트랜지션/애니메이션이 없습니다');
  if (hasKorean) score++; else details.push('한국어 텍스트가 감지되지 않았습니다');
  if (hasGridOrFlex) score++; else details.push('그리드/플렉스 레이아웃이 없습니다');
  return { hasSemanticHtml, hasFooter, hasImgAlt, score, details };
}

interface InteractivityResult {
  hasInteraction: boolean;
  score: number;
  details: string[];
}

export function evaluateInteractivity(js: string): InteractivityResult {
  const hasDomReady = /DOMContentLoaded|addEventListener\s*\(\s*['"]load['"]/i.test(js);
  const listenerCount = (js.match(/addEventListener\s*\(/g) ?? []).length;
  const hasInteraction = listenerCount >= 2;

  let score = 0;
  const details: string[] = [];
  if (hasDomReady) score++; else details.push('DOMContentLoaded 리스너가 없습니다');
  if (hasInteraction) score++; else details.push(`이벤트 리스너 부족 (${listenerCount}개)`);
  return { hasInteraction, score, details };
}

interface MobileResult {
  hasResponsiveClasses: boolean;
  hasAdequateResponsive: boolean;
  noFixedOverflow: boolean;
  hasImageProtection: boolean;
  hasMobileNav: boolean;
  score: number;
  details: string[];
}

export function evaluateMobileResponsiveness(html: string, fullCode: string): MobileResult {
  const hasResponsiveClasses = /\b(sm|md|lg|xl):/i.test(fullCode);
  const responsivePrefixCount = (fullCode.match(/\b(sm|md|lg|xl):/g) ?? []).length;
  const hasAdequateResponsive = responsivePrefixCount >= 8;
  const noFixedOverflow = !/w-\[\d{4,}px\]|width:\s*[5-9]\d{2,}px|width:\s*1\d{3,}px/i.test(fullCode);
  const allImgs = html.match(/<img\s[^>]*>/gi) ?? [];
  const protectedImgs = allImgs.filter((tag) => /w-full|max-w-full|object-cover|object-contain/i.test(tag));
  const hasImageProtection = allImgs.length === 0 || protectedImgs.length >= allImgs.length * 0.5;
  const hasMobileNav =
    /hidden\s+(?:[\w-]+\s+)*(?:md|lg):(?:flex|block|inline-flex)/i.test(fullCode) ||
    /(?:md|lg):hidden/i.test(fullCode);

  let score = 0;
  const details: string[] = [];
  if (hasResponsiveClasses) score++; else details.push('반응형 클래스(sm:/md:/lg:)가 없습니다');
  if (hasAdequateResponsive) score++; else details.push(`반응형 클래스 밀도 부족 (${responsivePrefixCount}/8개)`);
  if (noFixedOverflow) score++; else details.push('위험한 고정 너비(500px+)가 감지되었습니다');
  if (hasImageProtection) score++; else details.push(`이미지 오버플로우 보호 부족 (${protectedImgs.length}/${allImgs.length}개)`);
  if (hasMobileNav) score++; else details.push('모바일 네비게이션 패턴(hidden md:flex)이 없습니다');
  return { hasResponsiveClasses, hasAdequateResponsive, noFixedOverflow, hasImageProtection, hasMobileNav, score, details };
}

/**
 * Evaluate structural quality of generated code.
 * Returns a score (0-100) and individual quality flags.
 * These are informational — they do not block code storage.
 */
export function evaluateQuality(html: string, _css: string, js: string): QualityMetrics {
  const combinedCode = `${html}\n${js}`;

  const data = evaluateDataBinding(js, combinedCode);
  const structure = evaluateStructure(html, combinedCode);
  const interactivity = evaluateInteractivity(js);
  const mobile = evaluateMobileResponsiveness(html, combinedCode);

  const score = data.score + structure.score + interactivity.score + mobile.score;
  const details = [...data.details, ...structure.details, ...interactivity.details, ...mobile.details];
  const structuralScore = Math.round((score / 16) * 100);
  const mobileScore = Math.round(
    [mobile.hasResponsiveClasses, mobile.hasAdequateResponsive, mobile.noFixedOverflow,
     mobile.hasImageProtection, mobile.hasMobileNav].filter(Boolean).length / 5 * 100,
  );
  const hasTailwindCdn = /cdn\.tailwindcss\.com/.test(html);

  return {
    structuralScore,
    mobileScore,
    hasSemanticHtml: structure.hasSemanticHtml,
    hasMockData: data.hardcodedArrayCount > 0,
    hasInteraction: interactivity.hasInteraction,
    hasResponsiveClasses: mobile.hasResponsiveClasses,
    hasAdequateResponsive: mobile.hasAdequateResponsive,
    noFixedOverflow: mobile.noFixedOverflow,
    hasImageProtection: mobile.hasImageProtection,
    hasMobileNav: mobile.hasMobileNav,
    hasFooter: structure.hasFooter,
    hasImgAlt: structure.hasImgAlt,
    fetchCallCount: data.fetchCallCount,
    hasProxyCall: data.hasProxyCall,
    hasJsonParse: data.hasJsonParse,
    placeholderCount: data.placeholderCount,
    hardcodedArrayCount: data.hardcodedArrayCount,
    hasTailwindCdn,
    details,
  };
}

export function validateAll(html: string, css: string, js: string): ValidationResult {
  const fullCode = `${html}\n${css}\n${js}`;
  const securityResult = validateSecurity(fullCode);
  const functionalResult = validateFunctionality(html, css, js);

  return {
    passed: securityResult.passed && functionalResult.passed,
    errors: [...securityResult.errors, ...functionalResult.errors],
    warnings: [...securityResult.warnings, ...functionalResult.warnings],
  };
}
