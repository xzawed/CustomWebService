import { describe, it, expect } from 'vitest';
import { validateSecurity, validateFunctionality, validateAll } from './codeValidator';

describe('validateSecurity', () => {
  it('eval() 사용 시 에러를 반환한다', () => {
    const result = validateSecurity('eval("malicious")');
    expect(result.passed).toBe(false);
    expect(result.errors.some((e) => e.includes('eval'))).toBe(true);
  });

  it('innerHTML 사용 시 경고를 반환한다', () => {
    const result = validateSecurity('el.innerHTML = userInput');
    expect(result.passed).toBe(true);
    expect(result.warnings.some((w) => w.includes('innerHTML'))).toBe(true);
  });

  it('document.write() 사용 시 경고를 반환한다', () => {
    const result = validateSecurity('document.write("<script>")');
    expect(result.warnings.some((w) => w.includes('document.write'))).toBe(true);
  });

  it('sk- 패턴의 하드코딩된 API 키 감지', () => {
    const result = validateSecurity('const key = "sk-abcdefghijklmnopqrstuvwxyz1234"');
    expect(result.passed).toBe(false);
    expect(result.errors.some((e) => e.includes('API 키'))).toBe(true);
  });

  it('정상 코드는 통과한다', () => {
    const result = validateSecurity('const x = document.querySelector(".btn")');
    expect(result.passed).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

describe('validateFunctionality', () => {
  it('완전한 HTML 구조가 없으면 경고를 반환한다', () => {
    const result = validateFunctionality('<div>content</div>', '', '');
    expect(result.warnings.some((w) => w.includes('구조'))).toBe(true);
  });

  it('viewport 메타 태그가 없으면 경고를 반환한다', () => {
    const html = '<!DOCTYPE html><html><head></head><body></body></html>';
    const result = validateFunctionality(html, '', '');
    expect(result.warnings.some((w) => w.includes('viewport'))).toBe(true);
  });

  it('완전한 HTML은 에러 없이 통과한다', () => {
    const html =
      '<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width"></head><body></body></html>';
    const result = validateFunctionality(html, '', '');
    expect(result.passed).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('완전한 HTML + viewport가 있으면 경고 없이 통과한다', () => {
    const html =
      '<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width"></head><body class="container"></body></html>';
    const result = validateFunctionality(html, '', '');
    expect(result.passed).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

describe('validateAll', () => {
  it('eval과 구조 문제가 동시에 있으면 모두 반환한다', () => {
    const result = validateAll('eval("bad")', '', '');
    expect(result.passed).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('정상적인 코드는 통과한다', () => {
    const html =
      '<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width"></head><body></body></html>';
    const css = 'body { margin: 0; }';
    const js = 'document.querySelector("body").textContent = "Hello"';
    const result = validateAll(html, css, js);
    expect(result.passed).toBe(true);
  });
});
