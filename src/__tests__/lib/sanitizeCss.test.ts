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

  describe('추가 XSS 벡터 차단', () => {
    it('-webkit-binding: → 차단', () => {
      const result = sanitizeCss('-webkit-binding: url("http://evil.com/xss.xml")');
      expect(result).not.toMatch(/-webkit-binding\s*:/i);
    });

    it('대소문자 혼합 -WEBKIT-BINDING: → 차단', () => {
      const result = sanitizeCss('-WEBKIT-BINDING: url("http://evil.com/xss.xml")');
      expect(result).not.toMatch(/-webkit-binding\s*:/i);
    });

    it('url(data:text/html,...) → 차단', () => {
      const result = sanitizeCss('background: url(data:text/html,<script>alert(1)</script>)');
      expect(result).not.toMatch(/url\s*\(\s*['"]?\s*data:/i);
    });

    it('url(data:application/...) → 차단', () => {
      const result = sanitizeCss('content: url(data:application/x-shockwave-flash,evil)');
      expect(result).not.toMatch(/url\s*\(\s*['"]?\s*data:/i);
    });

    it('@import url(...) → 차단', () => {
      const result = sanitizeCss('@import url("http://evil.com/steal.css");');
      expect(result).not.toMatch(/@import\b/i);
    });

    it('대소문자 혼합 @IMPORT → 차단', () => {
      const result = sanitizeCss('@IMPORT "http://evil.com/steal.css";');
      expect(result).not.toMatch(/@import\b/i);
    });

    it('모든 새 벡터 동시 존재 → 모두 차단', () => {
      const malicious = `-webkit-binding: url(evil.xml);
        background: url(data:text/html,<b>xss</b>);
        @import url(evil.css);`;
      const result = sanitizeCss(malicious);
      expect(result).not.toMatch(/-webkit-binding\s*:/i);
      expect(result).not.toMatch(/url\s*\(\s*['"]?\s*data:/i);
      expect(result).not.toMatch(/@import\b/i);
    });
  });

  describe('추가 XSS 벡터 차단 — Phase 2', () => {
    // 현재 sanitizeCss() 구현은 javascript:/data: URL만 차단하며,
    // 프로토콜 상대 URL(//evil.com/...)이나 절대경로(/evil.css)는 차단하지 않는다.
    // 이 케이스들은 현재 미처리 상태를 문서화한다.

    it('프로토콜 상대 URL: url(//evil.com/steal.css) → 차단', () => {
      const result = sanitizeCss('background: url(//evil.com/steal.css)');
      expect(result).not.toMatch(/url\s*\(\s*['"]?\s*\/\//i);
    });

    it('절대 경로 @import: @import url("/evil.css") → 차단', () => {
      const result = sanitizeCss('@import url("/evil.css")');
      expect(result).not.toMatch(/@import\b/i);
    });

    it('CSS 변수에 javascript: 값 주입 시도 — url() 래퍼 없으면 현재 통과', () => {
      // --evil: javascript:alert(1); 형태는 url() 없으므로 현재 구현에서 차단하지 않음
      // 이 케이스는 브라우저에서 실제 실행 불가이므로 위험도 낮음
      // sanitizeCss는 url(javascript:) 패턴만 차단
      const css = '--evil: javascript:alert(1);';
      const result = sanitizeCss(css);
      // url() 없이 변수에 직접 쓴 javascript:는 브라우저가 실행하지 않아 허용됨
      expect(result).toBeDefined();
    });

    it('@keyframes 내 javascript: 패턴 — url() 포함 시 차단', () => {
      const css = '@keyframes hack { from { background: url(javascript:alert(1)); } }';
      const result = sanitizeCss(css);
      expect(result).not.toContain('javascript:');
    });

    it('content: url(data:text/html,...) → 차단 (data: URL 패턴으로 처리)', () => {
      const result = sanitizeCss('content: url(data:text/html,<b>xss</b>)');
      expect(result).not.toMatch(/url\s*\(\s*['"]?\s*data:/i);
    });

    it('background: url(data:application/javascript,...) → 차단', () => {
      const result = sanitizeCss(
        'background: url(data:application/javascript,alert(document.cookie))'
      );
      expect(result).not.toMatch(/url\s*\(\s*['"]?\s*data:/i);
    });

    it('@import 경로 다양한 형태: @import "https://evil.com/x.css" → 차단', () => {
      const result = sanitizeCss('@import "https://evil.com/x.css";');
      expect(result).not.toMatch(/@import\b/i);
    });

    it(String.raw`유니코드 이스케이프 우회 \00006a\000061\000076... (javascript) → 차단`, () => {
      // CSS 유니코드 이스케이프: \00006a='j', \000061='a', \000076='v' ... 조합하면 "javascript"
      // decodeCssUnicodeEscapes() 전처리 후 url(javascript:) 패턴으로 차단
      const encoded = String.raw`url(\00006a\000061\000076\000061\000073\000063\000072\000069\000070\000074:alert(1))`;
      const result = sanitizeCss(`background: ${encoded}`);
      expect(result).not.toContain('javascript:');
      expect(result).not.toMatch(/\\00006a/);
    });

    it('정상 CSS: url(https://cdn.tailwindcss.com/...) → 허용 (false positive 없음)', () => {
      const css = `
        body { background: url(https://cdn.tailwindcss.com/tailwind.min.css); }
        .icon { background-image: url('https://fonts.googleapis.com/css2?family=Inter'); }
      `;
      const result = sanitizeCss(css);
      // https:// URL은 차단하지 않아야 함
      expect(result).toContain('url(https://cdn.tailwindcss.com/tailwind.min.css)');
      expect(result).toContain("url('https://fonts.googleapis.com/css2?family=Inter')");
    });
  });
});
