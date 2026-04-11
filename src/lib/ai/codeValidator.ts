export interface ValidationResult {
  passed: boolean;
  errors: string[];
  warnings: string[];
}

// Patterns that indicate definite API key hardcoding (very specific formats)
const DEFINITE_KEY_PATTERNS = [
  /\bsk-[a-zA-Z0-9]{20,}\b/,           // OpenAI / Anthropic style keys
  /\bAIza[a-zA-Z0-9_-]{35}\b/,          // Google API keys
  /\bghp_[a-zA-Z0-9]{36}\b/,            // GitHub personal access tokens
  /\bxoxb-[0-9]+-[a-zA-Z0-9-]+\b/,      // Slack bot tokens
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
  details: string[];
}

/**
 * Evaluate structural quality of generated code.
 * Returns a score (0-100) and individual quality flags.
 * These are informational — they do not block code storage.
 */
export function evaluateQuality(html: string, _css: string, js: string): QualityMetrics {
  const fullCode = `${html}\n${js}`;
  const details: string[] = [];
  let score = 0;
  const maxScore = 14; // number of checks

  // 1. Semantic HTML: <main>, <nav>, <article>, <section>, <footer>
  const semanticTags = ['<main', '<nav', '<footer', '<section', '<article'];
  const semanticCount = semanticTags.filter((tag) => html.includes(tag)).length;
  const hasSemanticHtml = semanticCount >= 2;
  if (hasSemanticHtml) {
    score++;
  } else {
    details.push(`시맨틱 HTML 부족 (${semanticCount}/2 태그)`);
  }

  // 2. Mock data array exists
  const hasMockData = /const\s+\w*(mock|data|items|list|posts|products|cards)\w*\s*=\s*\[/i.test(js);
  if (hasMockData) {
    score++;
  } else {
    details.push('목 데이터 배열이 감지되지 않았습니다');
  }

  // 3. DOMContentLoaded listener
  const hasDomReady = /DOMContentLoaded|addEventListener\s*\(\s*['"]load['"]/i.test(js);
  if (hasDomReady) {
    score++;
  } else {
    details.push('DOMContentLoaded 리스너가 없습니다');
  }

  // 4. Event listeners (interaction)
  const listenerCount = (js.match(/addEventListener\s*\(/g) ?? []).length;
  const hasInteraction = listenerCount >= 2;
  if (hasInteraction) {
    score++;
  } else {
    details.push(`이벤트 리스너 부족 (${listenerCount}개)`);
  }

  // 5. Responsive Tailwind classes
  const hasResponsiveClasses = /\b(sm|md|lg|xl):/i.test(fullCode);
  if (hasResponsiveClasses) {
    score++;
  } else {
    details.push('반응형 클래스(sm:/md:/lg:)가 없습니다');
  }

  // 6. Footer
  const hasFooter = /<footer[\s>]/i.test(html);
  if (hasFooter) {
    score++;
  } else {
    details.push('<footer> 태그가 없습니다');
  }

  // 7. Image alt attributes
  const imgTags = html.match(/<img\s[^>]*>/gi) ?? [];
  const imgsWithAlt = imgTags.filter((tag) => /\balt\s*=/i.test(tag)).length;
  const hasImgAlt = imgTags.length === 0 || imgsWithAlt >= imgTags.length * 0.7;
  if (hasImgAlt) {
    score++;
  } else {
    details.push(`이미지 alt 속성 부족 (${imgsWithAlt}/${imgTags.length})`);
  }

  // 8. Transitions / animations
  const hasTransitions = /transition|animate|animation/i.test(fullCode);
  if (hasTransitions) {
    score++;
  } else {
    details.push('트랜지션/애니메이션이 없습니다');
  }

  // 9. Korean text present
  const hasKorean = /[\uAC00-\uD7AF]/.test(fullCode);
  if (hasKorean) {
    score++;
  } else {
    details.push('한국어 텍스트가 감지되지 않았습니다');
  }

  // 10. Grid or flex layout
  const hasGridOrFlex = /grid-cols|flex\s|flex-|display:\s*flex|display:\s*grid/i.test(fullCode);
  if (hasGridOrFlex) {
    score++;
  } else {
    details.push('그리드/플렉스 레이아웃이 없습니다');
  }

  // 11. Responsive prefix density (not just existence — need adequate usage)
  const responsivePrefixCount = (fullCode.match(/\b(sm|md|lg|xl):/g) ?? []).length;
  const hasAdequateResponsive = responsivePrefixCount >= 8;
  if (hasAdequateResponsive) {
    score++;
  } else {
    details.push(`반응형 클래스 밀도 부족 (${responsivePrefixCount}/8개)`);
  }

  // 12. No dangerous fixed widths that cause overflow
  const hasDangerousWidth = /w-\[\d{4,}px\]|width:\s*[5-9]\d{2,}px|width:\s*1\d{3,}px/i.test(fullCode);
  const noFixedOverflow = !hasDangerousWidth;
  if (noFixedOverflow) {
    score++;
  } else {
    details.push('위험한 고정 너비(500px+)가 감지되었습니다');
  }

  // 13. Image overflow protection
  const allImgs = html.match(/<img\s[^>]*>/gi) ?? [];
  const protectedImgs = allImgs.filter((tag) => /w-full|max-w-full|object-cover|object-contain/i.test(tag));
  const hasImageProtection = allImgs.length === 0 || protectedImgs.length >= allImgs.length * 0.5;
  if (hasImageProtection) {
    score++;
  } else {
    details.push(`이미지 오버플로우 보호 부족 (${protectedImgs.length}/${allImgs.length}개)`);
  }

  // 14. Mobile navigation pattern (hamburger / responsive hide)
  const hasMobileNav = /hidden\s+(?:[\w-]+\s+)*(?:md|lg):(?:flex|block|inline-flex)/i.test(fullCode) ||
    /(?:md|lg):hidden/i.test(fullCode);
  if (hasMobileNav) {
    score++;
  } else {
    details.push('모바일 네비게이션 패턴(hidden md:flex)이 없습니다');
  }

  const structuralScore = Math.round((score / maxScore) * 100);
  const mobileChecks = [hasResponsiveClasses, hasAdequateResponsive, noFixedOverflow, hasImageProtection, hasMobileNav];
  const mobileScore = Math.round((mobileChecks.filter(Boolean).length / mobileChecks.length) * 100);

  return {
    structuralScore,
    mobileScore,
    hasSemanticHtml,
    hasMockData,
    hasInteraction,
    hasResponsiveClasses,
    hasAdequateResponsive,
    noFixedOverflow,
    hasImageProtection,
    hasMobileNav,
    hasFooter,
    hasImgAlt,
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
