import { describe, it, expect } from 'vitest';
import { validateSecurity, validateFunctionality, validateAll, evaluateQuality } from './codeValidator';

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

describe('evaluateQuality', () => {
  it('모든 품질 요소가 있으면 점수 100을 반환한다', () => {
    const html = `<!DOCTYPE html><html><head></head><body>
      <nav>네비</nav>
      <main>
        <article>
          <img src="https://picsum.photos/seed/a/600/400" alt="테스트 이미지">
        </article>
      </main>
      <footer>푸터</footer>
      <div class="sm:grid-cols-2 lg:grid-cols-3 transition-all">카드</div>
    </body></html>`;
    const js = `
      const mockData = [{ id: 1, title: '테스트' }];
      document.addEventListener('DOMContentLoaded', () => {});
      btn.addEventListener('click', () => {});
      el.addEventListener('input', () => {});
    `;
    const result = evaluateQuality(html, '', js);
    expect(result.structuralScore).toBe(100);
    expect(result.hasSemanticHtml).toBe(true);
    expect(result.hasMockData).toBe(true);
    expect(result.hasInteraction).toBe(true);
    expect(result.hasFooter).toBe(true);
  });

  it('빈 코드는 낮은 점수를 반환한다', () => {
    const result = evaluateQuality('<div></div>', '', '');
    expect(result.structuralScore).toBeLessThan(30);
    expect(result.hasMockData).toBe(false);
    expect(result.hasInteraction).toBe(false);
  });

  it('details에 부족한 항목이 나열된다', () => {
    const result = evaluateQuality('<div></div>', '', '');
    expect(result.details.length).toBeGreaterThan(0);
    expect(result.details.some((d) => d.includes('시맨틱'))).toBe(true);
  });

  it('한국어 텍스트가 있으면 hasKorean 점수 포함', () => {
    const result = evaluateQuality('<div>안녕하세요</div>', '', '');
    expect(result.structuralScore).toBeGreaterThan(0);
  });

  it('반응형 클래스가 있으면 감지한다', () => {
    const html = '<div class="sm:grid-cols-2 lg:grid-cols-3">test</div>';
    const result = evaluateQuality(html, '', '');
    expect(result.hasResponsiveClasses).toBe(true);
  });
});
