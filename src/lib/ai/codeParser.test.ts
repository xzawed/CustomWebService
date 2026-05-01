import { describe, it, expect } from 'vitest';
import {
  parseGeneratedCode, assembleHtml, sanitizeCss,
  ensureCharset, ensureViewport, injectCdnTags, injectAlpineScript,
} from './codeParser';

// Minimal fixtures that satisfy MIN_CODE_LENGTHS (html≥50, css≥20, js≥10)
const MIN_HTML = '<!DOCTYPE html><html><head></head><body><h1>Hello World</h1></body></html>';
const MIN_CSS = 'body { color: red; margin: 0; }';
const MIN_JS = 'const x = 1;';

function buildInput(overrides: { html?: string; css?: string; js?: string } = {}): string {
  const html = overrides.html ?? MIN_HTML;
  const css = overrides.css ?? MIN_CSS;
  const js = overrides.js ?? MIN_JS;
  return [
    `\`\`\`html\n${html}\n\`\`\``,
    `\`\`\`css\n${css}\n\`\`\``,
    `\`\`\`javascript\n${js}\n\`\`\``,
  ].join('\n');
}

describe('parseGeneratedCode', () => {
  it('HTML 블록을 정상 파싱한다', () => {
    const result = parseGeneratedCode(buildInput());
    expect(result.html).toBe(MIN_HTML);
  });

  it('CSS 블록을 정상 파싱한다', () => {
    const result = parseGeneratedCode(buildInput({ css: 'body { background: blue; }' }));
    expect(result.css).toBe('body { background: blue; }');
  });

  it('javascript 블록을 정상 파싱한다', () => {
    const result = parseGeneratedCode(buildInput({ js: 'console.log("hello world")' }));
    expect(result.js).toBe('console.log("hello world")');
  });

  it('js 블록(단축 표기)을 정상 파싱한다', () => {
    const input = [
      `\`\`\`html\n${MIN_HTML}\n\`\`\``,
      `\`\`\`css\n${MIN_CSS}\n\`\`\``,
      `\`\`\`js\n${MIN_JS}\n\`\`\``,
    ].join('\n');
    const result = parseGeneratedCode(input);
    expect(result.js).toBe(MIN_JS);
  });

  it('HTML 블록이 없으면 에러를 던진다', () => {
    expect(() => parseGeneratedCode('아무 코드 블록 없는 텍스트')).toThrow('HTML 코드 블록이 너무 짧습니다');
  });

  it('HTML 블록이 너무 짧으면 에러를 던진다', () => {
    const input = [
      '```html\n<h1>Hi</h1>\n```',
      `\`\`\`css\n${MIN_CSS}\n\`\`\``,
      `\`\`\`javascript\n${MIN_JS}\n\`\`\``,
    ].join('\n');
    expect(() => parseGeneratedCode(input)).toThrow('HTML 코드 블록이 너무 짧습니다');
  });

  it('HTML/CSS/JS 세 블록을 동시에 파싱한다', () => {
    const result = parseGeneratedCode(buildInput());
    expect(result.html).toBe(MIN_HTML);
    expect(result.css).toBe(MIN_CSS);
    expect(result.js).toBe(MIN_JS);
  });
});

describe('assembleHtml', () => {
  it('이미 <style>과 <script>가 있어도 별도 CSS/JS를 추가 주입한다', () => {
    const html = '<html><head><style>a{}</style></head><body><script>var x</script></body></html>';
    const result = assembleHtml({ html, css: 'body{}', js: 'alert()' });
    expect(result).toContain('body{}');
    expect(result).toContain('<script>\nalert()\n</script>');
  });

  it('</head>가 있는 HTML에 CSS를 주입한다', () => {
    const html = '<html><head></head><body></body></html>';
    const result = assembleHtml({ html, css: 'body { color: red; }', js: '' });
    expect(result).toContain('body { color: red; }');
    expect(result).toContain('</head>');
  });

  it('</body>가 있는 HTML에 JS를 주입한다', () => {
    const html = '<html><head></head><body></body></html>';
    const result = assembleHtml({ html, css: '', js: 'const x = 1;' });
    expect(result).toContain('<script>\nconst x = 1;\n</script>');
    expect(result).toContain('</body>');
  });

  it('HTML이 없으면 완전한 문서 구조를 생성한다', () => {
    const result = assembleHtml({ html: '<p>content</p>', css: 'p{}', js: 'var a=1' });
    expect(result).toContain('<!DOCTYPE html>');
    expect(result).toContain('<html lang="ko">');
    expect(result).toContain('<p>content</p>');
  });

  it('OG 메타태그와 파비콘을 자동 주입한다', () => {
    const html = '<html><head><title>테스트 서비스</title></head><body></body></html>';
    const result = assembleHtml({ html, css: '', js: '' });
    expect(result).toContain('og:type');
    expect(result).toContain('og:locale');
    expect(result).toContain('og:title');
    expect(result).toContain('테스트 서비스');
    expect(result).toContain('rel="icon"');
  });

  it('CSS 기본 변수와 프린트 스타일시트를 주입한다', () => {
    const html = '<html><head></head><body></body></html>';
    const result = assembleHtml({ html, css: '', js: '' });
    expect(result).toContain('--transition-fast');
    expect(result).toContain('--shadow-sm');
    expect(result).toContain('@media print');
  });

  it('이미지에 lazy loading과 decoding을 추가한다', () => {
    const html = '<html><head></head><body><img src="a.jpg"><img src="b.jpg"><img src="https://picsum.photos/seed/test/600/400"></body></html>';
    const result = assembleHtml({ html, css: '', js: '' });
    // 3rd image should have lazy loading
    expect(result).toContain('loading="lazy"');
    expect(result).toContain('decoding="async"');
    // picsum.photos should get width/height
    expect(result).toContain('width="600"');
    expect(result).toContain('height="400"');
  });

  it('모바일 안전 CSS를 주입한다', () => {
    const html = '<html><head></head><body></body></html>';
    const result = assembleHtml({ html, css: '', js: '' });
    expect(result).toContain('box-sizing: border-box');
    expect(result).toContain('overflow-x: hidden');
    expect(result).toContain('safe-area-inset-bottom');
  });

  it('viewport meta가 없으면 자동 주입한다', () => {
    const html = '<html><head><meta charset="UTF-8"></head><body></body></html>';
    const result = assembleHtml({ html, css: '', js: '' });
    expect(result).toContain('name="viewport"');
    expect(result).toContain('width=device-width');
  });

  it('viewport meta가 이미 있으면 중복 주입하지 않는다', () => {
    const html = '<html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"></head><body></body></html>';
    const result = assembleHtml({ html, css: '', js: '' });
    const viewportCount = (result.match(/name="viewport"/g) ?? []).length;
    expect(viewportCount).toBe(1);
  });

  it('Alpine.js CDN 태그를 </head> 앞에 주입한다', () => {
    const html = '<html><head></head><body></body></html>';
    const result = assembleHtml({ html, css: '', js: '' });
    expect(result).toContain('alpinejs@3.14.8/dist/cdn.min.js');
    // Alpine tag must appear before </head>
    const alpineIdx = result.indexOf('alpinejs');
    const headCloseIdx = result.indexOf('</head>');
    expect(alpineIdx).toBeGreaterThan(-1);
    expect(alpineIdx).toBeLessThan(headCloseIdx);
  });

  it('HTML에 이미 alpinejs가 있으면 중복 주입하지 않는다', () => {
    const html = '<html><head><script defer src="https://unpkg.com/alpinejs@3.14.8/dist/cdn.min.js"></script></head><body></body></html>';
    const result = assembleHtml({ html, css: '', js: '' });
    const alpineCount = (result.match(/alpinejs/g) ?? []).length;
    expect(alpineCount).toBe(1);
  });

  it('완전한 문서 구조 생성 시에도 Alpine.js를 주입한다', () => {
    const result = assembleHtml({ html: '<p>content</p>', css: '', js: '' });
    expect(result).toContain('alpinejs@3.14.8/dist/cdn.min.js');
  });

  it('인라인 script 태그를 sanitize로 제거한다', () => {
    const result = assembleHtml({
      html: '<div><script>alert("xss")</script><p>Hello</p></div>',
      css: '',
      js: '',
    });
    expect(result).not.toContain('<script>alert');
    expect(result).toContain('<p>Hello</p>');
  });

  it('Alpine.js CDN script 태그는 buildHeadInjections로 포함한다', () => {
    const result = assembleHtml({ html: '<p>Hello</p>', css: '', js: '' });
    expect(result).toContain('alpinejs');
  });

  it('Alpine.js x-* 속성을 sanitize 후에도 보존한다 (정확도 핵심)', () => {
    const result = assembleHtml({
      html: '<div x-data="{ open: false }" x-show="open"><button x-on:click="open = !open">toggle</button></div>',
      css: '',
      js: '',
    });
    expect(result).toContain('x-data');
    expect(result).toContain('x-show');
    expect(result).toContain('x-on:click');
  });

  it('Alpine 단축 바인딩(:class, :style)을 보존한다', () => {
    const result = assembleHtml({
      html: '<button :class="{ active: open }" :style="{ color: \'red\' }">btn</button>',
      css: '',
      js: '',
    });
    expect(result).toContain(':class');
    expect(result).toContain(':style');
  });

  it('Alpine 이벤트 단축 바인딩(@click, @keydown)을 보존한다', () => {
    const result = assembleHtml({
      html: '<input @click="handle()" @keydown.enter="submit()" />',
      css: '',
      js: '',
    });
    expect(result).toContain('@click');
    expect(result).toContain('@keydown.enter');
  });

  it('인라인 이벤트 핸들러(onclick, onerror)를 제거한다 (XSS 방지)', () => {
    const result = assembleHtml({
      html: '<div onclick="alert(1)"><img src="x" onerror="alert(2)" /></div>',
      css: '',
      js: '',
    });
    expect(result).not.toContain('onclick');
    expect(result).not.toContain('onerror');
    expect(result).not.toContain('alert(');
  });

  it('javascript: URL scheme을 href에서 제거한다 (XSS 방지)', () => {
    const result = assembleHtml({
      html: '<a href="javascript:alert(1)">click</a>',
      css: '',
      js: '',
    });
    expect(result).not.toMatch(/href\s*=\s*["']?javascript:/i);
  });

  it('<script src="외부URL"> 태그는 ADD_TAGS=[]에 따라 제거된다', () => {
    const result = assembleHtml({
      html: '<div><script src="https://evil.example.com/payload.js"></script><p>safe</p></div>',
      css: '',
      js: '',
    });
    expect(result).not.toContain('https://evil.example.com');
    expect(result).toContain('<p>safe</p>');
  });

  // ── CDN 재주입 테스트 (DOMPurify가 제거한 CDN을 assembleHtml이 복원하는지 검증) ──

  it('Tailwind CDN script 태그를 </head> 앞에 재주입한다 (풀 문서)', () => {
    const html = '<html><head></head><body><p class="bg-blue-500">Hello</p></body></html>';
    const result = assembleHtml({ html, css: '', js: '' });
    expect(result).toContain('cdn.tailwindcss.com');
    const tailwindIdx = result.indexOf('cdn.tailwindcss.com');
    const headCloseIdx = result.indexOf('</head>');
    expect(tailwindIdx).toBeGreaterThan(-1);
    expect(tailwindIdx).toBeLessThan(headCloseIdx);
  });

  it('tailwind.config 인라인 스크립트를 재주입한다 (풀 문서)', () => {
    const html = '<html><head></head><body></body></html>';
    const result = assembleHtml({ html, css: '', js: '' });
    expect(result).toContain('tailwind.config');
    expect(result).toContain('pretendard');
  });

  it('Pretendard 폰트 CDN link 태그를 재주입한다 (풀 문서)', () => {
    const html = '<html><head></head><body></body></html>';
    const result = assembleHtml({ html, css: '', js: '' });
    expect(result).toContain('cdn.jsdelivr.net');
    expect(result).toContain('pretendardvariable-dynamic-subset');
  });

  it('Font Awesome CDN link 태그를 재주입한다 (풀 문서)', () => {
    const html = '<html><head></head><body></body></html>';
    const result = assembleHtml({ html, css: '', js: '' });
    expect(result).toContain('font-awesome');
    expect(result).toContain('cdnjs.cloudflare.com');
  });

  it('AI 생성 HTML에 Tailwind CDN이 있어도 DOMPurify 제거 후 재주입 — count=1', () => {
    // DOMPurify removes the original <script src>, so we re-inject exactly once
    const html =
      '<html><head><script src="https://cdn.tailwindcss.com"></script></head><body></body></html>';
    const result = assembleHtml({ html, css: '', js: '' });
    const count = (result.match(/cdn\.tailwindcss\.com/g) ?? []).length;
    expect(count).toBe(1);
  });

  it('비-풀 문서 HTML에서도 Tailwind CDN을 주입한다', () => {
    const result = assembleHtml({ html: '<p class="text-blue-500">Hello</p>', css: '', js: '' });
    expect(result).toContain('cdn.tailwindcss.com');
    expect(result).toContain('tailwind.config');
    expect(result).toContain('pretendardvariable-dynamic-subset');
    expect(result).toContain('font-awesome');
  });

  it('악성 도메인 script는 제거되고 화이트리스트 CDN은 재주입된다', () => {
    const html =
      '<html><head><script src="https://evil.com/payload.js"></script></head><body></body></html>';
    const result = assembleHtml({ html, css: '', js: '' });
    expect(result).not.toContain('evil.com');
    expect(result).toContain('cdn.tailwindcss.com');
  });
});

describe('ensureCharset', () => {
  it('charset 이미 있으면 변경 없음', () => {
    const html = '<html><head><meta charset="UTF-8"></head><body></body></html>';
    expect(ensureCharset(html)).toBe(html);
  });
  it('charset 없으면 <head> 뒤에 삽입', () => {
    const html = '<html><head></head><body></body></html>';
    expect(ensureCharset(html)).toContain('<meta charset="UTF-8">');
  });
});

describe('ensureViewport', () => {
  it('viewport 이미 있으면 변경 없음', () => {
    const html = '<html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"></head></html>';
    expect(ensureViewport(html)).toBe(html);
  });
  it('viewport 없으면 charset 뒤에 삽입', () => {
    const html = '<html><head><meta charset="UTF-8"></head><body></body></html>';
    expect(ensureViewport(html)).toContain('viewport');
  });
});

describe('injectCdnTags', () => {
  it('</head> 바로 앞에 Tailwind CDN 주입', () => {
    const html = '<html><head></head><body></body></html>';
    expect(injectCdnTags(html)).toContain('cdn.tailwindcss.com');
  });
  it('Pretendard 폰트도 주입', () => {
    const html = '<html><head></head><body></body></html>';
    expect(injectCdnTags(html)).toContain('pretendard');
  });
});

describe('injectAlpineScript', () => {
  it('alpinejs 없으면 주입', () => {
    const html = '<html><head></head><body></body></html>';
    expect(injectAlpineScript(html)).toContain('alpinejs');
  });
  it('alpinejs 이미 있으면 그대로', () => {
    const html = '<html><head><script src="alpinejs"></script></head><body></body></html>';
    const result = injectAlpineScript(html);
    expect((result.match(/alpinejs/g) ?? []).length).toBe(1);
  });
});
