import { describe, it, expect } from 'vitest';
import { parseGeneratedCode, assembleHtml } from './codeParser';

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
});
