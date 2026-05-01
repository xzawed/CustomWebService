import { describe, it, expect } from 'vitest';
import { applyAutoFix } from './autoFix';

describe('applyAutoFix — CDN http→https', () => {
  it('cdn.tailwindcss.com http를 https로 업그레이드한다', () => {
    const result = applyAutoFix({
      html: '<script src="http://cdn.tailwindcss.com"></script>',
      css: '',
      js: '',
    });
    expect(result.html).toContain('https://cdn.tailwindcss.com');
    expect(result.html).not.toContain('http://cdn.tailwindcss.com');
    expect(result.fixesApplied).toEqual(expect.arrayContaining([expect.stringContaining('CDN')]));
  });

  it('unpkg.com JS 코드의 http를 https로 업그레이드한다', () => {
    const result = applyAutoFix({
      html: '',
      css: '',
      js: 'const url = "http://unpkg.com/alpinejs@3/dist/cdn.min.js";',
    });
    expect(result.js).toContain('https://unpkg.com');
    expect(result.js).not.toContain('http://unpkg.com');
  });

  it('cdn.jsdelivr.net http를 https로 업그레이드한다', () => {
    const result = applyAutoFix({
      html: '<link href="http://cdn.jsdelivr.net/npm/bootstrap.css">',
      css: '',
      js: '',
    });
    expect(result.html).toContain('https://cdn.jsdelivr.net');
  });

  it('cdnjs.cloudflare.com http를 https로 업그레이드한다', () => {
    const result = applyAutoFix({
      html: '<link href="http://cdnjs.cloudflare.com/libs/font-awesome/6.5.0/css/all.min.css">',
      css: '',
      js: '',
    });
    expect(result.html).toContain('https://cdnjs.cloudflare.com');
  });

  it('임의의 도메인 http는 변경하지 않는다 (allowlist 외)', () => {
    const result = applyAutoFix({
      html: '',
      css: '',
      js: 'fetch("http://api.example.com/data")',
    });
    expect(result.js).toContain('http://api.example.com');
    expect(result.fixesApplied.some(f => f.includes('CDN'))).toBe(false);
  });
});

describe('applyAutoFix — TODO 주석 제거', () => {
  it('JS // TODO: 주석을 제거한다', () => {
    const result = applyAutoFix({
      html: '',
      css: '',
      js: '// TODO: implement this\nconst x = 1;\n// TODO: fix later\n',
    });
    expect(result.js).not.toContain('TODO');
    expect(result.js).toContain('const x = 1;');
    expect(result.fixesApplied).toEqual(expect.arrayContaining([expect.stringContaining('TODO')]));
  });

  it('HTML <!-- TODO --> 주석을 제거한다', () => {
    const result = applyAutoFix({
      html: '<div><!-- TODO: fill in --><p>내용</p></div>',
      css: '',
      js: '',
    });
    expect(result.html).not.toContain('TODO');
    expect(result.html).toContain('<p>내용</p>');
  });

  it('여러 줄 HTML <!-- TODO --> 주석을 제거한다', () => {
    const result = applyAutoFix({
      html: '<div><!-- TODO:\n  fix this later\n--><p>내용</p></div>',
      css: '',
      js: '',
    });
    expect(result.html).not.toContain('TODO');
    expect(result.html).toContain('<p>내용</p>');
  });

  it('TODO가 없으면 fixesApplied에 TODO 항목이 없다', () => {
    const result = applyAutoFix({ html: '<p>정상</p>', css: '', js: 'const x = 1;' });
    expect(result.fixesApplied.some(f => f.includes('TODO'))).toBe(false);
  });
});

describe('applyAutoFix — Placeholder 교체/제거', () => {
  it('홍길동을 사용자로 교체한다', () => {
    const result = applyAutoFix({
      html: '<p>안녕하세요 홍길동 님</p>',
      css: '',
      js: '',
    });
    expect(result.html).not.toContain('홍길동');
    expect(result.html).toContain('사용자');
    expect(result.fixesApplied).toEqual(expect.arrayContaining([expect.stringContaining('Placeholder')]));
  });

  it('김철수, 이영희를 사용자로 교체한다', () => {
    const result = applyAutoFix({
      html: '<p>김철수</p><p>이영희</p>',
      css: '',
      js: '',
    });
    expect(result.html).not.toContain('김철수');
    expect(result.html).not.toContain('이영희');
  });

  it('John Doe, Jane Smith를 User로 교체한다', () => {
    const result = applyAutoFix({
      html: '<span>John Doe</span>',
      css: '',
      js: 'const name = "Jane Smith";',
    });
    expect(result.html).not.toContain('John Doe');
    expect(result.js).not.toContain('Jane Smith');
  });

  it('test@example.com을 빈 문자열로 제거한다', () => {
    const result = applyAutoFix({
      html: '<span>test@example.com</span>',
      css: '',
      js: '',
    });
    expect(result.html).not.toContain('test@example.com');
  });

  it('Lorem ipsum을 제거한다', () => {
    const result = applyAutoFix({
      html: '<p>Lorem ipsum dolor sit amet</p>',
      css: '',
      js: '',
    });
    expect(result.html).not.toContain('Lorem ipsum');
  });

  it('Sample Data를 제거한다', () => {
    const result = applyAutoFix({
      html: '',
      css: '',
      js: 'const title = "Sample Data";',
    });
    expect(result.js).not.toContain('Sample Data');
  });

  it('수정 없는 정상 코드에서 fixesApplied는 빈 배열이다', () => {
    const result = applyAutoFix({
      html: '<p>정상 한국어 콘텐츠</p>',
      css: 'body { color: red; }',
      js: 'console.log("hello");',
    });
    expect(result.fixesApplied).toHaveLength(0);
  });
});

describe('applyAutoFix — 복합 적용', () => {
  it('CDN https 업그레이드, TODO 제거, placeholder 교체를 한 번에 수행한다', () => {
    const result = applyAutoFix({
      html: '<script src="http://cdn.tailwindcss.com"></script><!-- TODO: fix --><p>홍길동</p>',
      css: '',
      js: '// TODO: add fetch\nconst x = 1;',
    });
    expect(result.html).toContain('https://cdn.tailwindcss.com');
    expect(result.html).not.toContain('TODO');
    expect(result.html).not.toContain('홍길동');
    expect(result.js).not.toContain('TODO');
    expect(result.fixesApplied.length).toBeGreaterThanOrEqual(2);
  });

  it('css는 변경하지 않는다', () => {
    const css = 'body { color: red; background: blue; }';
    const result = applyAutoFix({ html: '', css, js: '' });
    expect(result.css).toBe(css);
  });
});
