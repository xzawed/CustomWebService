// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { THEMES, useThemeStore, type ThemeId } from './themeStore';

describe('useThemeStore', () => {
  beforeEach(() => {
    localStorage.removeItem('cws-theme');
    // replace=true 금지 — 액션 함수가 덮어써져 사라진다
    useThemeStore.setState({ theme: 'sky' });
  });

  it('기본 theme는 sky다', () => {
    expect(useThemeStore.getState().theme).toBe('sky');
  });

  it('setTheme으로 테마를 변경한다', () => {
    useThemeStore.getState().setTheme('dusk');
    expect(useThemeStore.getState().theme).toBe('dusk');

    useThemeStore.getState().setTheme('mint');
    expect(useThemeStore.getState().theme).toBe('mint');
  });

  it('THEMES 목록은 6개 테마 id를 포함한다', () => {
    const ids = THEMES.map((t) => t.id);
    expect(ids).toEqual(['sky', 'lavender', 'mint', 'peach', 'rose', 'dusk']);
    expect(THEMES.find((t) => t.id === 'dusk')?.dark).toBe(true);
  });

  it('지원 ThemeId를 모두 설정할 수 있다', () => {
    const all: ThemeId[] = ['sky', 'lavender', 'mint', 'peach', 'rose', 'dusk'];
    for (const id of all) {
      useThemeStore.getState().setTheme(id);
      expect(useThemeStore.getState().theme).toBe(id);
    }
  });
});
