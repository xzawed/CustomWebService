export interface ValidationResult {
  passed: boolean;
  errors: string[];
  warnings: string[];
}

export function validateSecurity(code: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check for eval usage
  if (/\beval\s*\(/.test(code)) {
    errors.push('eval() 사용이 감지되었습니다. 보안상 허용되지 않습니다.');
  }

  // Check for innerHTML with user input
  if (/\.innerHTML\s*=/.test(code)) {
    warnings.push('innerHTML 사용이 감지되었습니다. XSS 위험이 있을 수 있습니다.');
  }

  // Check for hardcoded API keys (common patterns)
  const apiKeyPatterns = [
    /['"][A-Za-z0-9]{32,}['"]/,
    /api[_-]?key\s*[:=]\s*['"][^'"{]+['"]/i,
    /sk-[a-zA-Z0-9]{20,}/,
    /AIza[a-zA-Z0-9_-]{35}/,
  ];

  for (const pattern of apiKeyPatterns) {
    if (pattern.test(code)) {
      errors.push('하드코딩된 API 키가 감지되었습니다.');
      break;
    }
  }

  // Check for document.write
  if (/document\.write\s*\(/.test(code)) {
    warnings.push('document.write() 사용이 감지되었습니다.');
  }

  return {
    passed: errors.length === 0,
    errors,
    warnings,
  };
}

export function validateFunctionality(html: string, css: string, js: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check HTML has basic structure
  if (!html.includes('<!DOCTYPE') && !html.includes('<html')) {
    warnings.push('HTML 문서 구조가 불완전합니다.');
  }

  // Check for viewport meta tag (responsive)
  if (!html.includes('viewport')) {
    warnings.push('viewport 메타 태그가 없습니다. 반응형 디자인이 적용되지 않을 수 있습니다.');
  }

  // Check JS has no obvious syntax errors (basic check)
  if (js) {
    try {
      // Simple bracket matching
      const opens = (js.match(/\{/g) || []).length;
      const closes = (js.match(/\}/g) || []).length;
      if (opens !== closes) {
        warnings.push('JavaScript 코드의 중괄호가 일치하지 않습니다.');
      }
    } catch {
      // ignore
    }
  }

  // Check CSS is not empty if HTML uses classes
  if (html.includes('class=') && !css) {
    warnings.push('HTML에 클래스가 사용되었지만 CSS가 비어있습니다.');
  }

  return {
    passed: errors.length === 0,
    errors,
    warnings,
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
