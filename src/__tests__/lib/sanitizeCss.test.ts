import { describe, it, expect } from 'vitest';
import { sanitizeCss } from '@/lib/ai/codeParser';

describe('sanitizeCss()', () => {
  it('정상 CSS는 수정하지 않는다', () => {
    const css = 'body { color: red; font-size: 16px; } .card { border-radius: 8px; }';
    expect(sanitizeCss(css)).toBe(css);
  });

  describe('IE CSS expression 주입 차단', () => {
    it('expression( → /* removed */(', () => {
      const result = sanitizeCss('width: expression(document.body.clientWidth)');
      expect(result).not.toContain('expression(');
      expect(result).toContain('/* removed */(');
    });

    it('공백 포함 expression   ( → 차단', () => {
      // sanitizeCss는 "expression(" 호출 패턴을 제거 (인자는 보존됨)
      const result = sanitizeCss('width: expression   (alert(1))');
      expect(result).not.toMatch(/\bexpression\s*\(/i);
    });

    it('대소문자 혼합 EXPRESSION( → 차단', () => {
      const result = sanitizeCss('EXPRESSION(document.cookie)');
      expect(result).not.toContain('EXPRESSION(');
    });
  });

  describe('CSS url(javascript:) XSS 차단', () => {
    it('url(javascript:...) → url(#)', () => {
      const result = sanitizeCss("background: url(javascript:alert('xss'))");
      expect(result).not.toContain('javascript:');
      expect(result).toContain('url(');
    });

    it('url("javascript:...) 따옴표 포함 → 차단', () => {
      const result = sanitizeCss('background: url("javascript:alert(1)")');
      expect(result).not.toContain('javascript:');
    });

    it("url('javascript:...) 작은따옴표 → 차단", () => {
      const result = sanitizeCss("background: url('javascript:void(0)')");
      expect(result).not.toContain('javascript:');
    });

    it('대소문자 혼합 JAVASCRIPT: → 차단', () => {
      const result = sanitizeCss('background: url(JAVASCRIPT:alert(1))');
      expect(result).not.toContain('JAVASCRIPT:');
    });
  });

  describe('IE behavior 속성 차단', () => {
    it('behavior: → /* removed */:', () => {
      const result = sanitizeCss('behavior: url(evil.htc)');
      expect(result).not.toContain('behavior:');
      expect(result).toContain('/* removed */:');
    });

    it('대소문자 혼합 BEHAVIOR: → 차단', () => {
      const result = sanitizeCss('BEHAVIOR: url(evil.htc)');
      expect(result).not.toContain('BEHAVIOR:');
    });
  });

  describe('Firefox -moz-binding XSS 차단', () => {
    it('-moz-binding: → /* removed */:', () => {
      const result = sanitizeCss('-moz-binding: url("http://evil.com/xss.xml#xss")');
      expect(result).not.toContain('-moz-binding:');
      expect(result).toContain('/* removed */:');
    });

    it('대소문자 혼합 -MOZ-BINDING: → 차단', () => {
      const result = sanitizeCss('-MOZ-BINDING: url(evil.xml)');
      expect(result).not.toContain('-MOZ-BINDING:');
    });
  });

  it('복수 패턴이 동시에 존재해도 모두 제거한다', () => {
    const malicious = `
      body { background: url(javascript:alert(1)); }
      div { width: expression(alert(1)); behavior: url(evil.htc); }
      span { -moz-binding: url(evil.xml); }
    `;
    const result = sanitizeCss(malicious);
    expect(result).not.toContain('javascript:');
    expect(result).not.toMatch(/\bexpression\s*\(/i);
    expect(result).not.toMatch(/\bbehavior\s*:/i);
    expect(result).not.toMatch(/-moz-binding\s*:/i);
  });

  it('정상 CSS 속성(transition, animation 등)은 보존한다', () => {
    const css = `
      .card { transition: all 0.3s ease; animation: fadeIn 0.5s; }
      .btn { border-radius: 4px; background-color: #3b82f6; }
    `;
    const result = sanitizeCss(css);
    expect(result).toContain('transition');
    expect(result).toContain('animation');
    expect(result).toContain('border-radius');
    expect(result).toContain('background-color');
  });
});
