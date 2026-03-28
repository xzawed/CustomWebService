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
