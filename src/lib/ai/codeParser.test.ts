import { describe, it, expect } from 'vitest';
import { parseGeneratedCode, assembleHtml } from './codeParser';

describe('parseGeneratedCode', () => {
  it('HTML 블록을 정상 파싱한다', () => {
    const input = '```html\n<h1>Hello</h1>\n```';
    const result = parseGeneratedCode(input);
    expect(result.html).toBe('<h1>Hello</h1>');
  });

  it('CSS 블록을 정상 파싱한다', () => {
    const input = '```css\nbody { color: red; }\n```';
    const result = parseGeneratedCode(input);
    expect(result.css).toBe('body { color: red; }');
  });

  it('javascript 블록을 정상 파싱한다', () => {
    const input = '```javascript\nconsole.log("hi")\n```';
    const result = parseGeneratedCode(input);
    expect(result.js).toBe('console.log("hi")');
  });

  it('js 블록(단축 표기)을 정상 파싱한다', () => {
    const input = '```js\nconst x = 1\n```';
    const result = parseGeneratedCode(input);
    expect(result.js).toBe('const x = 1');
  });

  it('블록이 없으면 빈 문자열을 반환한다', () => {
    const result = parseGeneratedCode('아무 코드 블록 없는 텍스트');
    expect(result.html).toBe('');
    expect(result.css).toBe('');
    expect(result.js).toBe('');
  });

  it('HTML/CSS/JS 세 블록을 동시에 파싱한다', () => {
    const input = [
      '```html\n<div>test</div>\n```',
      '```css\ndiv { margin: 0; }\n```',
      '```javascript\nconst a = 1;\n```',
    ].join('\n');
    const result = parseGeneratedCode(input);
    expect(result.html).toBe('<div>test</div>');
    expect(result.css).toBe('div { margin: 0; }');
    expect(result.js).toBe('const a = 1;');
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
});
