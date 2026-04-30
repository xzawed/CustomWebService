// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { renderComponent, screen } from '@/test/helpers/component';
import { Footer } from './Footer';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: unknown }) => (
    <a href={href}>{children as React.ReactNode}</a>
  ),
}));

describe('Footer', () => {
  it('브랜드 텍스트를 렌더링한다', () => {
    renderComponent(<Footer />);
    expect(screen.getByText('Custom')).toBeTruthy();
    expect(screen.getByText('WebService')).toBeTruthy();
  });

  it('현재 연도를 copyright에 표시한다', () => {
    renderComponent(<Footer />);
    const year = new Date().getFullYear();
    expect(screen.getByText(`© ${year}`, { exact: false })).toBeTruthy();
  });

  it('네비게이션 링크 4개를 올바른 href로 렌더링한다', () => {
    const { container } = renderComponent(<Footer />);
    const expectedLinks: ReadonlyArray<readonly [string, string]> = [
      ['/catalog', 'API 카탈로그'],
      ['/terms', '이용약관'],
      ['/privacy', '개인정보처리방침'],
      ['/disclaimer', '면책 조항'],
    ];
    for (const [href, label] of expectedLinks) {
      const link = container.querySelector(`a[href="${href}"]`);
      expect(link).toBeTruthy();
      expect(link?.textContent).toBe(label);
    }
  });

  it('GitHub 외부 링크는 noopener noreferrer를 가진다', () => {
    const { container } = renderComponent(<Footer />);
    const github = container.querySelector('a[href="https://github.com"]');
    expect(github).toBeTruthy();
    expect(github?.getAttribute('target')).toBe('_blank');
    expect(github?.getAttribute('rel')).toBe('noopener noreferrer');
  });

});
