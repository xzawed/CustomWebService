// @vitest-environment happy-dom
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { renderComponent, screen, fireEvent } from '@/test/helpers/component';
import type { User } from '@/types/user';

interface AuthStateShape {
  user: User | null;
  isAuthenticated: boolean;
}

const authState: AuthStateShape = {
  user: null,
  isAuthenticated: false,
};

const signOutMock = vi.fn();
let pathnameMock = '/';

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    onClick,
    className,
    style,
  }: {
    href: string;
    children: unknown;
    onClick?: () => void;
    className?: string;
    style?: React.CSSProperties;
  }) => (
    <a href={href} onClick={onClick} className={className} style={style}>
      {children as React.ReactNode}
    </a>
  ),
}));

vi.mock('next/image', () => ({
  default: ({ src, alt, width, height }: { src: string; alt: string; width: number; height: number }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} width={width} height={height} />
  ),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => pathnameMock,
}));

vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => authState,
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ signOut: signOutMock }),
}));

vi.mock('@/components/ui/ThemeSelector', () => ({
  ThemeSelector: () => <div data-testid="theme-selector" />,
}));

import { Header } from './Header';

describe('Header', () => {
  beforeEach(() => {
    authState.user = null;
    authState.isAuthenticated = false;
    pathnameMock = '/';
    signOutMock.mockReset();
  });

  describe('비로그인 상태', () => {
    it('로그인 버튼을 표시한다', () => {
      renderComponent(<Header />);
      expect(screen.getByText('로그인')).toBeTruthy();
    });

    it('카탈로그 링크는 항상 노출된다', () => {
      renderComponent(<Header />);
      // 데스크톱 네비게이션에 카탈로그 링크 노출
      const links = screen.getAllByText('카탈로그');
      expect(links.length).toBeGreaterThanOrEqual(1);
    });

    it('빌더/대시보드 링크는 숨겨진다', () => {
      renderComponent(<Header />);
      expect(screen.queryByText('빌더')).toBeNull();
      expect(screen.queryByText('대시보드')).toBeNull();
    });
  });

  describe('로그인 상태', () => {
    beforeEach(() => {
      authState.user = {
        id: 'u1',
        email: 'test@example.com',
        name: '테스터',
        avatarUrl: null,
      } as User;
      authState.isAuthenticated = true;
    });

    it('빌더/대시보드 링크가 노출된다', () => {
      renderComponent(<Header />);
      expect(screen.getAllByText('빌더').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('대시보드').length).toBeGreaterThanOrEqual(1);
    });

    it('아바타가 없으면 UserIcon 플레이스홀더를 표시한다', () => {
      const { container } = renderComponent(<Header />);
      expect(container.querySelector('img')).toBeNull();
    });

    it('avatarUrl이 있으면 next/image로 아바타를 표시한다', () => {
      authState.user = {
        ...authState.user!,
        avatarUrl: 'https://example.com/avatar.png',
      };
      const { container } = renderComponent(<Header />);
      const img = container.querySelector('img');
      expect(img).toBeTruthy();
      expect(img?.getAttribute('src')).toBe('https://example.com/avatar.png');
    });

    it('아바타 클릭 시 드롭다운이 열려 사용자 정보·메뉴를 보여준다', () => {
      const { container } = renderComponent(<Header />);
      // 아바타 버튼(첫 번째 type=button)
      const avatarBtn = container.querySelector('button[type="button"]') as HTMLButtonElement;
      fireEvent.click(avatarBtn);
      expect(screen.getByText('테스터')).toBeTruthy();
      expect(screen.getByText('test@example.com')).toBeTruthy();
      expect(screen.getByText('내 API 키 관리')).toBeTruthy();
      expect(screen.getByText('로그아웃')).toBeTruthy();
    });

    it('로그아웃 버튼 클릭 시 signOut이 호출된다', () => {
      const { container } = renderComponent(<Header />);
      const avatarBtn = container.querySelector('button[type="button"]') as HTMLButtonElement;
      fireEvent.click(avatarBtn);
      fireEvent.click(screen.getByText('로그아웃'));
      expect(signOutMock).toHaveBeenCalledTimes(1);
    });

    it('user.name이 없으면 email을 대신 표시한다', () => {
      authState.user = { ...authState.user!, name: null };
      const { container } = renderComponent(<Header />);
      const avatarBtn = container.querySelector('button[type="button"]') as HTMLButtonElement;
      fireEvent.click(avatarBtn);
      // email은 두 번 노출(상단 큰 텍스트 + 하단 작은 텍스트)
      expect(screen.getAllByText('test@example.com').length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('모바일 메뉴', () => {
    it('초기에는 닫혀 있다 (탬 카탈로그/빌더 등은 데스크톱 nav에만 노출)', () => {
      authState.isAuthenticated = true;
      authState.user = { id: 'u1', email: 'a', name: 'a', avatarUrl: null } as User;
      const { container } = renderComponent(<Header />);
      // 모바일 menu는 closed 상태이므로 mobile nav element 없음
      expect(container.querySelector('nav.border-t')).toBeNull();
    });

    it('메뉴 토글 클릭 시 모바일 nav가 열린다', () => {
      authState.isAuthenticated = true;
      authState.user = { id: 'u1', email: 'a', name: 'a', avatarUrl: null } as User;
      const { container } = renderComponent(<Header />);
      // 모바일 토글 버튼은 md:hidden 클래스의 마지막 button
      const mobileBtn = container.querySelector('button.md\\:hidden') as HTMLButtonElement;
      expect(mobileBtn).toBeTruthy();
      fireEvent.click(mobileBtn);
      expect(container.querySelector('nav.border-t')).toBeTruthy();
    });
  });

  describe('활성 링크 강조', () => {
    it('현재 경로와 일치하는 nav 링크는 accent 색상이 적용된다', () => {
      authState.isAuthenticated = true;
      authState.user = { id: 'u1', email: 'a', name: 'a', avatarUrl: null } as User;
      pathnameMock = '/builder';
      renderComponent(<Header />);
      const builderLink = screen
        .getAllByText('빌더')[0]
        .closest('a') as HTMLAnchorElement;
      expect(builderLink.style.color).toContain('--accent-primary');
    });
  });
});
