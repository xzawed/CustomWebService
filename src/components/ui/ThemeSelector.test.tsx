// @vitest-environment happy-dom
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { renderComponent, screen, fireEvent } from '@/test/helpers/component';
import { mockThemeStore } from '@/test/mocks/zustand';

const themeStoreState = mockThemeStore();

vi.mock('@/stores/themeStore', async () => {
  const actual = await vi.importActual<typeof import('@/stores/themeStore')>('@/stores/themeStore');
  return {
    ...actual,
    useThemeStore: () => themeStoreState,
  };
});

import { ThemeSelector } from './ThemeSelector';
import { THEMES } from '@/stores/themeStore';

describe('ThemeSelector', () => {
  beforeEach(() => {
    themeStoreState.theme = 'sky';
    themeStoreState.setTheme = vi.fn();
  });

  it('초기에는 드롭다운이 닫혀 있다', () => {
    renderComponent(<ThemeSelector />);
    expect(screen.queryByText('테마 선택')).toBeNull();
  });

  it('토글 버튼 클릭 시 드롭다운이 열려 모든 테마를 보여준다', () => {
    renderComponent(<ThemeSelector />);
    fireEvent.click(screen.getByTitle('테마 색상 변경'));
    expect(screen.getByText('테마 선택')).toBeTruthy();
    for (const t of THEMES) {
      expect(screen.getByText(t.label)).toBeTruthy();
    }
  });

  it('토글 버튼을 두 번 클릭하면 드롭다운이 닫힌다', () => {
    renderComponent(<ThemeSelector />);
    const btn = screen.getByTitle('테마 색상 변경');
    fireEvent.click(btn);
    expect(screen.getByText('테마 선택')).toBeTruthy();
    fireEvent.click(btn);
    expect(screen.queryByText('테마 선택')).toBeNull();
  });

  it('테마 클릭 시 setTheme이 호출되고 드롭다운이 닫힌다', () => {
    renderComponent(<ThemeSelector />);
    fireEvent.click(screen.getByTitle('테마 색상 변경'));
    fireEvent.click(screen.getByText('민트'));
    expect(themeStoreState.setTheme).toHaveBeenCalledWith('mint');
    expect(screen.queryByText('테마 선택')).toBeNull();
  });

  it('현재 활성 테마는 active dot을 표시한다', () => {
    themeStoreState.theme = 'rose';
    const { container } = renderComponent(<ThemeSelector />);
    fireEvent.click(screen.getByTitle('테마 색상 변경'));
    const roseButton = screen.getByText('로즈').closest('button');
    expect(roseButton).toBeTruthy();
    // active dot은 1.5x1.5 크기의 추가 span으로 표시됨
    const activeDot = roseButton!.querySelector('.h-1\\.5.w-1\\.5');
    expect(activeDot).toBeTruthy();

    // 비활성 테마는 active dot이 없음
    const skyButton = screen.getByText('하늘').closest('button');
    expect(skyButton!.querySelector('.h-1\\.5.w-1\\.5')).toBeNull();
    expect(container).toBeTruthy();
  });

  it('드롭다운 외부 클릭 시 닫힌다', () => {
    renderComponent(
      <div>
        <ThemeSelector />
        <div data-testid="outside">outside</div>
      </div>,
    );
    fireEvent.click(screen.getByTitle('테마 색상 변경'));
    expect(screen.getByText('테마 선택')).toBeTruthy();
    fireEvent.mouseDown(screen.getByTestId('outside'));
    expect(screen.queryByText('테마 선택')).toBeNull();
  });
});
