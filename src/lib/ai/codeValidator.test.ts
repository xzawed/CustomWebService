import { describe, it, expect } from 'vitest';
import {
  validateSecurity, validateFunctionality, evaluateQuality, validateAll,
  evaluateDataBinding, evaluateStructure, evaluateInteractivity, evaluateMobileResponsiveness,
  detectAlpineDoubleInit,
} from './codeValidator';

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

  it('Alpine 이중 init 경고가 validateFunctionality 경고로 표면화되고 passed는 true를 유지한다', () => {
    const html =
      '<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width"></head>' +
      '<body><div x-data="app()" x-init="init()"></div></body></html>';
    const result = validateFunctionality(html, '', '');
    expect(result.passed).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings.some((w) => w.includes('Alpine') && w.includes('init()'))).toBe(true);
  });
});

describe('detectAlpineDoubleInit', () => {
  describe('감지해야 하는 경우', () => {
    it('x-data와 x-init="init()" 조합을 감지한다', () => {
      const result = detectAlpineDoubleInit('<div x-data="app()" x-init="init()">');
      expect(result).toHaveLength(1);
      expect(result[0]).toContain('init()');
    });

    it('속성 순서가 바뀐 x-init + x-data도 감지한다', () => {
      const result = detectAlpineDoubleInit('<div x-init="init()" x-data="app()">');
      expect(result).toHaveLength(1);
    });

    it('x-init 값의 앞뒤 공백이 있어도 감지한다', () => {
      const result = detectAlpineDoubleInit('<div x-data="app()"   x-init=" init() ">');
      expect(result).toHaveLength(1);
    });

    it('홑따옴표 속성도 감지한다', () => {
      const result = detectAlpineDoubleInit("<div x-data='app()' x-init='init()'>");
      expect(result).toHaveLength(1);
    });

    it('await init() 형태를 감지한다', () => {
      const result = detectAlpineDoubleInit('<div x-data="app()" x-init="await init()">');
      expect(result).toHaveLength(1);
    });

    it('$nextTick 콜백 안의 init() 호출을 감지한다', () => {
      const result = detectAlpineDoubleInit(
        '<div x-data="app()" x-init="$nextTick(() => init())">',
      );
      expect(result).toHaveLength(1);
    });

    it('init(); other()처럼 연쇄 호출도 감지한다', () => {
      const result = detectAlpineDoubleInit('<div x-data="app()" x-init="init(); other()">');
      expect(result).toHaveLength(1);
    });

    it('위반 요소가 여러 개면 요소마다 경고를 하나씩 반환한다', () => {
      const html =
        '<div x-data="a()" x-init="init()"></div><section x-data="b()" x-init="init()"></section>';
      const result = detectAlpineDoubleInit(html);
      expect(result).toHaveLength(2);
    });

    it('값 없는 x-data도 감지한다 — Alpine은 이를 빈 객체로 보므로 init()이 ReferenceError로 죽는다', () => {
      const result = detectAlpineDoubleInit('<div x-data x-init="init()">');
      expect(result).toHaveLength(1);
    });

    it('경고에 문제의 x-init 식을 포함해 어느 요소인지 짚을 수 있게 한다', () => {
      // 위반이 여러 개일 때 메시지가 전부 같으면 어디를 고쳐야 할지 알 수 없다.
      const html =
        '<div x-data="a()" x-init="init()"></div>' +
        '<section x-data="b()" x-init="$nextTick(() => init())"></section>';
      const [first, second] = detectAlpineDoubleInit(html);
      expect(first).toContain('x-init="init()"');
      expect(second).toContain('$nextTick(() => init())');
      expect(first).not.toBe(second);
    });

    it('여러 줄에 걸쳐 속성이 있어도 감지한다', () => {
      const html = `<div
  class="card"
  x-data="app()"
  id="root"
  x-init="init()"
>`;
      const result = detectAlpineDoubleInit(html);
      expect(result).toHaveLength(1);
    });
  });

  describe('감지하지 않아야 하는 경우', () => {
    it('다른 메서드명 loadData()는 감지하지 않는다', () => {
      expect(detectAlpineDoubleInit('<div x-data="app()" x-init="loadData()">')).toEqual([]);
    });

    it('initialize()는 단어 경계로 구분되어 감지하지 않는다', () => {
      expect(detectAlpineDoubleInit('<div x-data="app()" x-init="initialize()">')).toEqual([]);
    });

    it('initChart()는 단어 경계로 구분되어 감지하지 않는다', () => {
      expect(detectAlpineDoubleInit('<div x-data="app()" x-init="initChart()">')).toEqual([]);
    });

    it('myInit()는 단어 경계로 구분되어 감지하지 않는다', () => {
      expect(detectAlpineDoubleInit('<div x-data="app()" x-init="myInit()">')).toEqual([]);
    });

    it('this.initialize()는 감지하지 않는다', () => {
      expect(detectAlpineDoubleInit('<div x-data="app()" x-init="this.initialize()">')).toEqual([]);
    });

    it('x-init 없이 x-data만 있으면 감지하지 않는다', () => {
      expect(detectAlpineDoubleInit('<div x-data="app()">')).toEqual([]);
    });

    it('x-data 없이 x-init="init()"만 있으면 감지하지 않는다', () => {
      expect(detectAlpineDoubleInit('<div x-init="init()">')).toEqual([]);
    });

    it('빈 문자열은 경고 없이 빈 배열을 반환한다', () => {
      expect(detectAlpineDoubleInit('')).toEqual([]);
    });

    it('Alpine 속성이 없는 HTML은 경고 없이 빈 배열을 반환한다', () => {
      expect(detectAlpineDoubleInit('<div class="app"><p>hello</p></div>')).toEqual([]);
    });
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

  describe('hardcodedArrayCount 감지 패턴', () => {
    it('단일 객체 배열 const items = [{id:1}] 감지', () => {
      const js = 'const items = [{id:1}]; fetch("/api/v1/proxy")';
      const result = evaluateQuality(baseHtml, '', js);
      expect(result.hardcodedArrayCount).toBe(1);
      expect(result.hasMockData).toBe(true);
    });

    it('두 객체 배열 const data = [{a:1},{b:2}] 감지', () => {
      const js = 'const data = [{a:1},{b:2}]; fetch("/api/v1/proxy")';
      const result = evaluateQuality(baseHtml, '', js);
      expect(result.hardcodedArrayCount).toBe(1);
    });

    it('대문자로 시작하는 상수 const DATA = [{...}] 감지', () => {
      const js = 'const DATA = [{name:"a"}]; fetch("/api/v1/proxy")';
      const result = evaluateQuality(baseHtml, '', js);
      expect(result.hardcodedArrayCount).toBe(1);
    });

    it('동일 파일 내 여러 하드코딩 배열을 모두 카운트한다', () => {
      const js = `
        const users = [{id:1}];
        const items = [{name:"a"},{name:"b"}];
        fetch("/api/v1/proxy")
      `;
      const result = evaluateQuality(baseHtml, '', js);
      expect(result.hardcodedArrayCount).toBe(2);
    });

    it('빈 배열 const x = [] 은 mock 데이터로 분류하지 않는다', () => {
      const js = 'const x = []; fetch("/api/v1/proxy")';
      const result = evaluateQuality(baseHtml, '', js);
      expect(result.hardcodedArrayCount).toBe(0);
      expect(result.hasMockData).toBe(false);
    });

    it('원시값 배열 const nums = [1,2,3] 은 카운트하지 않는다 (객체 아님)', () => {
      const js = 'const nums = [1, 2, 3]; fetch("/api/v1/proxy")';
      const result = evaluateQuality(baseHtml, '', js);
      expect(result.hardcodedArrayCount).toBe(0);
    });

    it('다중 라인 객체 배열도 감지한다', () => {
      const js = `const list = [
        { id: 1, name: "first" },
        { id: 2, name: "second" }
      ]; fetch("/api/v1/proxy")`;
      const result = evaluateQuality(baseHtml, '', js);
      expect(result.hardcodedArrayCount).toBe(1);
    });
  });
});

describe('evaluateDataBinding', () => {
  it('fetch 없음 → fetchCallCount=0, details에 포함', () => {
    const result = evaluateDataBinding('', '', '');
    expect(result.fetchCallCount).toBe(0);
    expect(result.details.some(d => d.includes('fetch()'))).toBe(true);
  });
  it('fetch 있음 → fetchCallCount>0, score+1', () => {
    const js = 'fetch("/api/v1/proxy")';
    const result = evaluateDataBinding(js, js, js);
    expect(result.fetchCallCount).toBe(1);
    expect(result.score).toBeGreaterThan(0);
  });
  it('placeholder 있음 → placeholderCount>0', () => {
    const code = '홍길동';
    const result = evaluateDataBinding('', code, code);
    expect(result.placeholderCount).toBeGreaterThan(0);
  });
  it('hardcoded array → hardcodedArrayCount>0', () => {
    const js = 'const items = [{ id: 1 }, { id: 2 }]';
    const result = evaluateDataBinding(js, js, js);
    expect(result.hardcodedArrayCount).toBeGreaterThan(0);
  });
});

describe('evaluateStructure', () => {
  it('semantic 태그 2개 이상 → hasSemanticHtml true', () => {
    const html = '<main><nav></nav><footer></footer></main>';
    const result = evaluateStructure(html, html);
    expect(result.hasSemanticHtml).toBe(true);
  });
  it('footer 없음 → hasFooter false', () => {
    const result = evaluateStructure('<div></div>', '<div></div>');
    expect(result.hasFooter).toBe(false);
  });
  it('img alt 70% 이상 → hasImgAlt true', () => {
    const html = '<img src="a.jpg" alt="a"><img src="b.jpg" alt="b">';
    const result = evaluateStructure(html, html);
    expect(result.hasImgAlt).toBe(true);
  });
});

describe('evaluateInteractivity', () => {
  it('DOMContentLoaded 없음 → details에 포함', () => {
    const result = evaluateInteractivity('');
    expect(result.details.some(d => d.includes('DOMContentLoaded'))).toBe(true);
  });
  it('addEventListener 2개 이상 → hasInteraction true', () => {
    const js = 'el.addEventListener("click",()=>{});el.addEventListener("keydown",()=>{});';
    const result = evaluateInteractivity(js);
    expect(result.hasInteraction).toBe(true);
  });
});

describe('evaluateMobileResponsiveness', () => {
  it('반응형 클래스 없음 → hasResponsiveClasses false', () => {
    const result = evaluateMobileResponsiveness('<div></div>', '<div></div>');
    expect(result.hasResponsiveClasses).toBe(false);
  });
  it('sm:p-4 패턴 8개 이상 → hasAdequateResponsive true', () => {
    const code = 'sm:p-1 md:p-2 lg:p-3 xl:p-4 sm:m-1 md:m-2 lg:m-3 xl:m-4';
    const result = evaluateMobileResponsiveness('', code);
    expect(result.hasAdequateResponsive).toBe(true);
  });
  it('hidden md:flex → hasMobileNav true', () => {
    const result = evaluateMobileResponsiveness('', 'hidden md:flex');
    expect(result.hasMobileNav).toBe(true);
  });
});
