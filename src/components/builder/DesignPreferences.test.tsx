// @vitest-environment happy-dom
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { renderComponent, screen, fireEvent } from '@/test/helpers/component';
import type { DesignMood, DesignAudience, DesignLayout, PreferenceSuggestion } from '@/types/project';

interface ContextStateShape {
  mood: DesignMood;
  audience: DesignAudience;
  layoutPreference: DesignLayout;
  setMood: ReturnType<typeof vi.fn>;
  setAudience: ReturnType<typeof vi.fn>;
  setLayoutPreference: ReturnType<typeof vi.fn>;
  aiSuggestion: PreferenceSuggestion | null;
  gateResolved: boolean;
}

const contextState: ContextStateShape = {
  mood: 'auto',
  audience: 'general',
  layoutPreference: 'auto',
  setMood: vi.fn(),
  setAudience: vi.fn(),
  setLayoutPreference: vi.fn(),
  aiSuggestion: null,
  gateResolved: false,
};

vi.mock('@/stores/contextStore', () => ({
  useContextStore: () => contextState,
}));

import DesignPreferences from './DesignPreferences';

describe('DesignPreferences', () => {
  beforeEach(() => {
    contextState.mood = 'auto';
    contextState.audience = 'general';
    contextState.layoutPreference = 'auto';
    contextState.setMood = vi.fn();
    contextState.setAudience = vi.fn();
    contextState.setLayoutPreference = vi.fn();
    contextState.aiSuggestion = null;
    contextState.gateResolved = false;
  });

  it('summary와 details 구조로 렌더링된다', () => {
    const { container } = renderComponent(<DesignPreferences />);
    expect(container.querySelector('details')).toBeTruthy();
    expect(screen.getByText('디자인 선호도 설정 (선택사항)')).toBeTruthy();
  });

  it('세 개의 ChipGroup(분위기/대상 고객/레이아웃)을 렌더링한다', () => {
    renderComponent(<DesignPreferences />);
    expect(screen.getByText('분위기')).toBeTruthy();
    expect(screen.getByText('대상 고객')).toBeTruthy();
    expect(screen.getByText('레이아웃')).toBeTruthy();
  });

  it('분위기 옵션 클릭 시 setMood가 호출된다', () => {
    renderComponent(<DesignPreferences />);
    fireEvent.click(screen.getByText('어둡고 세련'));
    expect(contextState.setMood).toHaveBeenCalledWith('dark');
  });

  it('대상 고객 옵션 클릭 시 setAudience가 호출된다', () => {
    renderComponent(<DesignPreferences />);
    fireEvent.click(screen.getByText('비즈니스'));
    expect(contextState.setAudience).toHaveBeenCalledWith('business');
  });

  it('레이아웃 옵션 클릭 시 setLayoutPreference가 호출된다', () => {
    renderComponent(<DesignPreferences />);
    fireEvent.click(screen.getByText('대시보드'));
    expect(contextState.setLayoutPreference).toHaveBeenCalledWith('dashboard');
  });

  it('aiSuggestion + gateResolved 상태에서 "AI 추천 적용됨" 배지를 표시한다', () => {
    contextState.gateResolved = true;
    contextState.aiSuggestion = {
      mood: 'dark',
      audience: 'business',
      layoutPreference: 'dashboard',
    } as PreferenceSuggestion;
    renderComponent(<DesignPreferences />);
    expect(screen.getByText('AI 추천 적용됨')).toBeTruthy();
  });

  it('gateResolved=false면 AI 추천 배지를 숨긴다', () => {
    contextState.gateResolved = false;
    contextState.aiSuggestion = {
      mood: 'dark',
      audience: 'business',
      layoutPreference: 'dashboard',
    } as PreferenceSuggestion;
    renderComponent(<DesignPreferences />);
    expect(screen.queryByText('AI 추천 적용됨')).toBeNull();
  });

  it('AI 추천 값(auto/general 제외)에는 ★ 표시가 붙는다', () => {
    contextState.gateResolved = true;
    contextState.aiSuggestion = {
      mood: 'dark',
      audience: 'business',
      layoutPreference: 'dashboard',
    } as PreferenceSuggestion;
    renderComponent(<DesignPreferences />);
    expect(screen.getByText('어둡고 세련').textContent).toContain('★');
    expect(screen.getByText('비즈니스').textContent).toContain('★');
    expect(screen.getByText('대시보드').textContent).toContain('★');
    // auto/general은 추천에서 제외되어 ★ 미표시
    expect(screen.getByText('일반').textContent).not.toContain('★');
  });

  it('현재 선택된 값은 강조 스타일이 적용된다 (white 색상)', () => {
    contextState.mood = 'minimal';
    renderComponent(<DesignPreferences />);
    const minimalBtn = screen.getByText('미니멀').closest('button')!;
    expect(minimalBtn.style.color).toBe('white');
    const lightBtn = screen.getByText('밝고 깔끔').closest('button')!;
    expect(lightBtn.style.color).not.toBe('white');
  });
});
