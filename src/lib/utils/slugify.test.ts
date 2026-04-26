import { describe, it, expect } from 'vitest';
import { toSlug, generateSlug, isValidSlug, RESERVED_SLUGS } from './slugify';

describe('toSlug()', () => {
  it('영문 소문자로 변환한다', () => {
    expect(toSlug('Hello World')).toBe('hello-world');
  });

  it('발음 기호(액센트)를 제거한다', () => {
    expect(toSlug('café')).toBe('cafe');
    expect(toSlug('résumé')).toBe('resume');
    expect(toSlug('naïve')).toBe('naive');
  });

  it('특수문자를 제거한다', () => {
    expect(toSlug('hello!@#$%^&*()')).toBe('hello');
    expect(toSlug('my.app.name')).toBe('myappname');
  });

  it('공백을 하이픈으로 변환한다', () => {
    expect(toSlug('my project name')).toBe('my-project-name');
  });

  it('언더스코어는 특수문자로 제거된다 (하이픈 변환 전에 삭제)', () => {
    // toSlug: [^a-z0-9\s-] 제거 → 언더스코어가 먼저 제거됨
    expect(toSlug('my_project_name')).toBe('myprojectname');
  });

  it('연속된 하이픈을 단일 하이픈으로 변환한다', () => {
    expect(toSlug('hello---world')).toBe('hello-world');
    expect(toSlug('hello   world')).toBe('hello-world');
  });

  it('앞뒤 하이픈을 제거한다', () => {
    expect(toSlug('-hello-')).toBe('hello');
    expect(toSlug('  hello  ')).toBe('hello');
  });

  it('한국어는 빈 문자열이 된다', () => {
    expect(toSlug('안녕하세요')).toBe('');
  });

  it('숫자는 유지한다', () => {
    expect(toSlug('project123')).toBe('project123');
    expect(toSlug('123 test')).toBe('123-test');
  });
});

describe('generateSlug()', () => {
  it('영문 프로젝트 이름으로 slug를 생성한다', () => {
    const result = generateSlug('My Weather App', 'abc123-def456');
    // idSuffix: 'abc123def456'.slice(0,6) = 'abc123'
    expect(result).toBe('my-weather-app-abc123');
  });

  it('한글/특수문자 이름이면 project-{idSuffix} 형식을 사용한다', () => {
    const result = generateSlug('한국어 앱', 'xyz789-uvw012');
    // toSlug('한국어 앱') = '' (길이 0)
    expect(result).toMatch(/^project-/);
  });

  it('1글자 이름이면 project-{idSuffix} 형식을 사용한다', () => {
    const result = generateSlug('a', 'abc123-def456');
    // toSlug('a').length = 1 < 2
    expect(result).toMatch(/^project-/);
  });

  it('id의 하이픈을 제거하고 앞 6자리만 사용한다', () => {
    const result = generateSlug('test-app', 'abcdef-ghijkl');
    // idSuffix = 'abcdefghijkl'.slice(0,6) = 'abcdef'
    expect(result).toBe('test-app-abcdef');
  });

  it('긴 프로젝트 이름은 43자로 잘린다', () => {
    const longName = 'a'.repeat(50);
    const result = generateSlug(longName, 'abc123-def456');
    // base = 'a'.repeat(43), idSuffix = 'abc123'
    expect(result).toBe('a'.repeat(43) + '-abc123');
    expect(result.length).toBeLessThanOrEqual(50);
  });
});

describe('isValidSlug()', () => {
  it('유효한 slug를 허용한다', () => {
    expect(isValidSlug('my-app')).toBe(true);
    expect(isValidSlug('project-abc123')).toBe(true);
    expect(isValidSlug('hello-world-test')).toBe(true);
  });

  it('예약된 slug를 거부한다', () => {
    expect(isValidSlug('www')).toBe(false);
    expect(isValidSlug('api')).toBe(false);
    expect(isValidSlug('admin')).toBe(false);
    expect(isValidSlug('dashboard')).toBe(false);
    expect(isValidSlug('login')).toBe(false);
    expect(isValidSlug('logout')).toBe(false);
    expect(isValidSlug('signup')).toBe(false);
    expect(isValidSlug('auth')).toBe(false);
    expect(isValidSlug('site')).toBe(false);
    expect(isValidSlug('app')).toBe(false);
    expect(isValidSlug('settings')).toBe(false);
    expect(isValidSlug('builder')).toBe(false);
    expect(isValidSlug('docs')).toBe(false);
    expect(isValidSlug('status')).toBe(false);
    expect(isValidSlug('health')).toBe(false);
  });

  it('대문자가 포함된 slug를 거부한다', () => {
    expect(isValidSlug('MyApp')).toBe(false);
    expect(isValidSlug('MY-APP')).toBe(false);
  });

  it('앞/뒤 하이픈이 있는 slug를 거부한다', () => {
    expect(isValidSlug('-myapp')).toBe(false);
    expect(isValidSlug('myapp-')).toBe(false);
  });

  it('너무 짧은 slug를 거부한다 (2자 미만)', () => {
    expect(isValidSlug('a')).toBe(false);
    expect(isValidSlug('ab')).toBe(false); // 2자: ^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$ — 최소 3자
  });

  it('특수문자가 포함된 slug를 거부한다', () => {
    expect(isValidSlug('my_app')).toBe(false);
    expect(isValidSlug('my.app')).toBe(false);
    expect(isValidSlug('my app')).toBe(false);
  });

  it('숫자로 시작하는 slug를 허용한다', () => {
    expect(isValidSlug('123abc')).toBe(true);
  });

  it('RESERVED_SLUGS Set에 포함된 항목들이 모두 거부된다', () => {
    for (const reserved of RESERVED_SLUGS) {
      expect(isValidSlug(reserved)).toBe(false);
    }
  });
});
