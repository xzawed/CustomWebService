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

  it('인라인 script 태그가 있으면 경고를 반환하고 패스한다', () => {
    const result = validateSecurity('<script>alert(1)</script>');
    expect(result.passed).toBe(true);
    expect(result.errors.some((e) => e.includes('인라인 스크립트'))).toBe(false);
    expect(result.warnings.some((w) => w.includes('인라인 스크립트'))).toBe(true);
  });

  it('script type="module" 태그는 경고만 발생하고 패스한다', () => {
    const result = validateSecurity('<script type="module">import { x } from "./x.js"</script>');
    expect(result.passed).toBe(true);
    expect(result.errors.some((e) => e.includes('인라인 스크립트'))).toBe(false);
    expect(result.warnings.some((w) => w.includes('인라인 스크립트'))).toBe(true);
  });

  it('src 속성이 있는 script 태그는 차단하지 않는다', () => {
    const result = validateSecurity('<script src="https://cdn.example.com/lib.js"></script>');
    expect(result.errors.some((e) => e.includes('인라인 스크립트'))).toBe(false);
  });

  it('script 없는 정상 HTML은 인라인 스크립트 에러 없음', () => {
    const result = validateSecurity('<div class="app"><h1>Hello</h1></div>');
    expect(result.errors.some((e) => e.includes('인라인 스크립트'))).toBe(false);
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
  <nav class="hidden md:flex">데스크톱 메뉴</nav>
  <button class="md:hidden">햄버거</button>
  <main>
    <article class="sm:px-6 lg:px-8">
      <img src="https://picsum.photos/seed/a/600/400" alt="테스트 이미지" class="w-full max-w-full object-cover">
    </article>
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">카드</div>
  </main>
  <footer class="sm:flex lg:justify-between">푸터</footer>
  <div class="transition-all sm:text-lg">텍스트</div>
</body></html>`;
    const js = `
      document.addEventListener('DOMContentLoaded', () => {});
      btn.addEventListener('click', () => {});
      el.addEventListener('input', () => {});
      fetch('/api/v1/proxy?apiId=1').then(r => r.json()).then(data => {});
    `;
    const result = evaluateQuality(html, '', js);
    expect(result.structuralScore).toBe(100);
    expect(result.hasSemanticHtml).toBe(true);
    expect(result.hasMockData).toBe(false); // derived from hardcodedArrayCount > 0
    expect(result.hasInteraction).toBe(true);
    expect(result.hasFooter).toBe(true);
    expect(result.mobileScore).toBe(100);
    expect(result.hasAdequateResponsive).toBe(true);
    expect(result.noFixedOverflow).toBe(true);
    expect(result.hasImageProtection).toBe(true);
    expect(result.hasMobileNav).toBe(true);
    expect(result.fetchCallCount).toBeGreaterThan(0);
    expect(result.placeholderCount).toBe(0);
  });

  it('빈 코드는 낮은 점수를 반환한다', () => {
    const result = evaluateQuality('<div></div>', '', '');
    expect(result.structuralScore).toBeLessThan(30);
    expect(result.hasMockData).toBe(false); // derived from hardcodedArrayCount > 0
    expect(result.hasInteraction).toBe(false);
    expect(result.fetchCallCount).toBe(0);
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

  it('반응형 클래스가 8개 이상이면 hasAdequateResponsive가 true', () => {
    const html = '<div class="sm:flex md:grid lg:block xl:hidden sm:p-4 md:p-6 lg:p-8 sm:text-lg">test</div>';
    const result = evaluateQuality(html, '', '');
    expect(result.hasAdequateResponsive).toBe(true);
  });

  it('고정 너비 500px 이상이면 noFixedOverflow가 false', () => {
    const html = '<div class="w-[1000px]">wide</div>';
    const result = evaluateQuality(html, '', '');
    expect(result.noFixedOverflow).toBe(false);
  });

  it('이미지에 w-full이 있으면 hasImageProtection이 true', () => {
    const html = '<img src="a.jpg" class="w-full"><img src="b.jpg" class="max-w-full object-cover">';
    const result = evaluateQuality(html, '', '');
    expect(result.hasImageProtection).toBe(true);
  });

  it('모바일 네비게이션 패턴이 있으면 hasMobileNav가 true', () => {
    const html = '<nav class="hidden md:flex">데스크톱</nav><button class="md:hidden">메뉴</button>';
    const result = evaluateQuality(html, '', '');
    expect(result.hasMobileNav).toBe(true);
  });

  it('mobileScore는 0-100 범위', () => {
    const result = evaluateQuality('<div></div>', '', '');
    expect(result.mobileScore).toBeGreaterThanOrEqual(0);
    expect(result.mobileScore).toBeLessThanOrEqual(100);
  });
});

describe('evaluateQuality — fetch-first scoring', () => {
  const baseHtml = `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width"><title>T</title></head>
    <body><main><nav></nav><footer></footer></main></body></html>`;

  it('gives +1 for fetch() call in JS', () => {
    const withFetch = evaluateQuality(baseHtml, '', `fetch('/api/v1/proxy?apiId=1').then(r=>r.json())`);
    const noFetch = evaluateQuality(baseHtml, '', 'console.log("hi")');
    expect(withFetch.fetchCallCount).toBeGreaterThan(0);
    expect(noFetch.fetchCallCount).toBe(0);
    expect(withFetch.structuralScore).toBeGreaterThan(noFetch.structuralScore);
  });

  it('penalizes zero fetch calls (detail message includes fetch)', () => {
    const result = evaluateQuality(baseHtml, '', 'const mockData = [{id:1}]');
    expect(result.fetchCallCount).toBe(0);
    expect(result.details.some(d => d.includes('fetch'))).toBe(true);
  });

  it('does NOT give bonus for const mockData array', () => {
    const withMock = evaluateQuality(baseHtml, '', 'const mockData = [{id:1},{id:2}]; fetch("/api")');
    const noMock = evaluateQuality(baseHtml, '', 'fetch("/api")');
    expect(withMock.structuralScore).toBe(noMock.structuralScore);
  });

  it('detects placeholder strings', () => {
    const result = evaluateQuality(baseHtml, '', 'document.write("홍길동"); fetch("/api")');
    expect(result.placeholderCount).toBeGreaterThan(0);
  });
});
