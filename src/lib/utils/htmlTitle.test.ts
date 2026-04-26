import { describe, it, expect } from 'vitest';
import { extractTitle } from './htmlTitle';

describe('extractTitle()', () => {
  it('title 태그의 내용을 추출한다', () => {
    const html = '<html><head><title>My App</title></head><body></body></html>';
    expect(extractTitle(html)).toBe('My App');
  });

  it('title 태그가 없으면 undefined를 반환한다', () => {
    const html = '<html><head></head><body>내용</body></html>';
    expect(extractTitle(html)).toBeUndefined();
  });

  it('title 내용의 앞뒤 공백을 제거한다', () => {
    const html = '<title>  공백 있는 제목  </title>';
    expect(extractTitle(html)).toBe('공백 있는 제목');
  });

  it('대소문자 혼합 TITLE 태그도 인식한다', () => {
    const html = '<TITLE>대문자 제목</TITLE>';
    expect(extractTitle(html)).toBe('대문자 제목');
  });

  it('혼합 대소문자 Title 태그도 인식한다', () => {
    const html = '<Title>혼합 제목</Title>';
    expect(extractTitle(html)).toBe('혼합 제목');
  });

  it('빈 문자열이면 undefined를 반환한다', () => {
    expect(extractTitle('')).toBeUndefined();
  });

  it('한국어 제목을 올바르게 추출한다', () => {
    const html = '<title>날씨 앱</title>';
    expect(extractTitle(html)).toBe('날씨 앱');
  });

  it('title 속성이 있는 태그도 처리한다', () => {
    const html = '<title lang="ko">속성 있는 제목</title>';
    expect(extractTitle(html)).toBe('속성 있는 제목');
  });
});
