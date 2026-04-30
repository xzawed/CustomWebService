import { describe, it, expect } from 'vitest';
import { createPlaceholderRegex, PLACEHOLDER_STRINGS } from './placeholderPatterns';

describe('createPlaceholderRegex()', () => {
  it('PLACEHOLDER_STRINGS의 모든 문자열을 매칭한다', () => {
    for (const s of PLACEHOLDER_STRINGS) {
      const re = createPlaceholderRegex();
      const text = `사용자 이름: ${s} 입니다.`;
      expect(re.test(text)).toBe(true);
    }
  });

  it('한국어 placeholder(홍길동/김철수/이영희)를 매칭한다', () => {
    const re = createPlaceholderRegex();
    const html = '<p>이름: 홍길동</p><p>대표: 김철수</p><p>담당: 이영희</p>';
    const matches = [...html.matchAll(re)];
    expect(matches.length).toBe(3);
  });

  it('placeholder 이메일(test@example.com / user@test.com)을 매칭한다', () => {
    const re = createPlaceholderRegex();
    const html = '<p>contact: test@example.com</p>';
    expect(re.test(html)).toBe(true);

    const re2 = createPlaceholderRegex();
    expect(re2.test('admin: user@test.com')).toBe(true);
  });

  it('"준비 중", "구현 예정", "곧 출시", "추후 업데이트" 한국어 문구를 매칭한다', () => {
    const phrases = ['준비 중', '구현 예정', '곧 출시', '추후 업데이트'];
    for (const p of phrases) {
      const re = createPlaceholderRegex();
      expect(re.test(`기능: ${p}`)).toBe(true);
    }
  });

  it('영어 placeholder("Loading...", "Coming soon", "Lorem ipsum", "TBD")를 매칭한다', () => {
    const phrases = ['Loading...', 'Coming soon', 'Lorem ipsum', 'TBD'];
    for (const p of phrases) {
      const re = createPlaceholderRegex();
      expect(re.test(`Status: ${p}`)).toBe(true);
    }
  });

  it('영문 가짜 이름("John Doe", "Jane Smith")을 매칭한다', () => {
    const re = createPlaceholderRegex();
    expect(re.test('Author: John Doe')).toBe(true);

    const re2 = createPlaceholderRegex();
    expect(re2.test('CEO: Jane Smith')).toBe(true);
  });

  it('가짜 가격 "$99.99"를 매칭한다 (정규식 escape 검증)', () => {
    const re = createPlaceholderRegex();
    expect(re.test('Price: $99.99')).toBe(true);
  });

  it('가짜 날짜(MM/DD/YYYY, MM=01-09 + DD=01-09) 패턴을 매칭한다', () => {
    // 패턴 의도: 명백한 placeholder 날짜(예: 01/01/2024) 검출
    const re = createPlaceholderRegex();
    expect(re.test('Last update: 01/01/2024')).toBe(true);

    const re2 = createPlaceholderRegex();
    expect(re2.test('Date: 09/09/2025')).toBe(true);
  });

  it('실제 운영 날짜(MM/DD/YYYY, DD>=10 또는 MM=10-12)는 매칭하지 않는다', () => {
    // 0[1-9]/0[1-9]/20XX 패턴이라 day가 10 이상이거나 month가 10 이상이면 미매칭
    const re = createPlaceholderRegex();
    expect(re.test('Date: 09/15/2024')).toBe(false);

    const re2 = createPlaceholderRegex();
    expect(re2.test('Date: 12/01/2024')).toBe(false);
  });

  it('정상 텍스트(실제 데이터)는 매칭하지 않는다', () => {
    const re = createPlaceholderRegex();
    const realText = '<p>2026년 4월 30일 서울 날씨는 맑음입니다. 기온 18도</p>';
    expect(re.test(realText)).toBe(false);
  });

  it('한 텍스트에 placeholder 여러 개가 있으면 모두 카운트된다', () => {
    const re = createPlaceholderRegex();
    const text = '대표: 홍길동, 이메일: test@example.com, 상태: 준비 중';
    const matches = [...text.matchAll(re)];
    expect(matches.length).toBe(3);
  });

  it('동일 placeholder가 여러 번 나오면 각각 카운트된다 (global 플래그)', () => {
    const re = createPlaceholderRegex();
    const text = '홍길동 홍길동 홍길동';
    const matches = [...text.matchAll(re)];
    expect(matches.length).toBe(3);
  });

  it('매 호출마다 새 RegExp를 반환한다 (lastIndex 부작용 방지)', () => {
    const re1 = createPlaceholderRegex();
    const re2 = createPlaceholderRegex();
    expect(re1).not.toBe(re2);
    // 한 instance 사용 후 다른 instance 사용 시 영향 없음
    re1.test('홍길동');
    expect(re2.test('홍길동')).toBe(true);
  });

  it('정상 영어 이름(예: "John Smith", "James Brown")은 매칭하지 않는다', () => {
    // 'John Doe'와 'Jane Smith'만 placeholder. 다른 영문 이름은 매칭되지 않아야 함
    const re = createPlaceholderRegex();
    expect(re.test('Author: John Smith')).toBe(false);

    const re2 = createPlaceholderRegex();
    expect(re2.test('Director: James Brown')).toBe(false);
  });

  it('정상 날짜 형식(YYYY-MM-DD, 2026-04-30)은 매칭하지 않는다', () => {
    // EXTRA_PATTERNS는 MM/DD/YYYY만 검출 — ISO 형식은 정상으로 간주
    const re = createPlaceholderRegex();
    expect(re.test('Date: 2026-04-30')).toBe(false);
  });
});
