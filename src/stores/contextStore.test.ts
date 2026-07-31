// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import type {
  DesignAudience,
  DesignLayout,
  DesignMood,
  PreferenceSuggestion,
  ResolutionOptions,
} from '@/types/project';
import { LIMITS } from '@/lib/config/features';
import { useContextStore } from './contextStore';

const initialState = {
  context: '',
  selectedTemplate: null,
  mood: 'auto' as DesignMood,
  audience: 'general' as DesignAudience,
  layoutPreference: 'auto' as DesignLayout,
  aiSuggestion: null,
  relevanceScore: null,
  suggestionSource: null,
  gateResolved: false,
  resolutionOptions: null,
};

describe('useContextStore', () => {
  beforeEach(() => {
    // persist 스토리지 잔존 상태 제거 (테스트 순서 독립성)
    localStorage.removeItem('builder-context');
    // replace=true 금지 — 액션 함수가 덮어써져 사라진다
    useContextStore.setState(initialState);
  });

  it('maxLength 길이의 텍스트는 저장된다', () => {
    const exact = 'a'.repeat(LIMITS.contextMaxLength);
    useContextStore.getState().setContext(exact);

    expect(useContextStore.getState().context).toBe(exact);
    expect(useContextStore.getState().charCount()).toBe(LIMITS.contextMaxLength);
  });

  it('maxLength+1 입력은 무시되어 상태가 변하지 않는다', () => {
    const accepted = 'b'.repeat(100);
    useContextStore.getState().setContext(accepted);
    const before = useContextStore.getState().context;

    useContextStore.getState().setContext('c'.repeat(LIMITS.contextMaxLength + 1));

    expect(useContextStore.getState().context).toBe(before);
  });

  it('clearSuggestion은 멱등하다 (두 번 호출 = 한 번 호출)', () => {
    const suggestion: PreferenceSuggestion = {
      template: null,
      mood: 'minimal',
      audience: 'business',
      layoutPreference: 'tool',
      reason: '테스트',
    };
    const options: ResolutionOptions = {
      suggestedContexts: ['날씨 대시보드'],
      suggestedApis: [{ category: 'weather', reason: '관련' }],
      creativeMerges: ['날씨 + 지도'],
    };

    useContextStore.getState().setAiSuggestion(suggestion);
    useContextStore.getState().setRelevanceScore(0.4);
    useContextStore.getState().setSuggestionSource('ai');
    useContextStore.getState().setResolutionOptions(options);
    useContextStore.getState().markGateResolved();

    useContextStore.getState().clearSuggestion();
    const afterOnce = {
      aiSuggestion: useContextStore.getState().aiSuggestion,
      relevanceScore: useContextStore.getState().relevanceScore,
      suggestionSource: useContextStore.getState().suggestionSource,
      gateResolved: useContextStore.getState().gateResolved,
      resolutionOptions: useContextStore.getState().resolutionOptions,
    };

    useContextStore.getState().clearSuggestion();
    const afterTwice = {
      aiSuggestion: useContextStore.getState().aiSuggestion,
      relevanceScore: useContextStore.getState().relevanceScore,
      suggestionSource: useContextStore.getState().suggestionSource,
      gateResolved: useContextStore.getState().gateResolved,
      resolutionOptions: useContextStore.getState().resolutionOptions,
    };

    expect(afterOnce).toEqual({
      aiSuggestion: null,
      relevanceScore: null,
      suggestionSource: null,
      gateResolved: false,
      resolutionOptions: null,
    });
    expect(afterTwice).toEqual(afterOnce);
  });

  it('partialize는 context·selectedTemplate·mood·audience·layoutPreference만 남긴다', () => {
    useContextStore.getState().setContext('a'.repeat(60));
    useContextStore.getState().setTemplate('tpl-1');
    useContextStore.getState().setMood('colorful');
    useContextStore.getState().setAudience('youth');
    useContextStore.getState().setLayoutPreference('dashboard');
    useContextStore.getState().setAiSuggestion({
      template: null,
      mood: 'minimal',
      audience: 'general',
      layoutPreference: 'auto',
      reason: 'gate',
    });
    useContextStore.getState().setRelevanceScore(0.9);
    useContextStore.getState().markGateResolved();

    const partialize = useContextStore.persist.getOptions().partialize;
    expect(partialize).toBeTypeOf('function');

    const partial = partialize!(useContextStore.getState());
    expect(Object.keys(partial).sort()).toEqual(
      ['audience', 'context', 'layoutPreference', 'mood', 'selectedTemplate'].sort(),
    );
    expect(partial).toEqual({
      context: 'a'.repeat(60),
      selectedTemplate: 'tpl-1',
      mood: 'colorful',
      audience: 'youth',
      layoutPreference: 'dashboard',
    });
    // session-only 키가 partialize 결과에 없어야 한다
    expect(partial).not.toHaveProperty('aiSuggestion');
    expect(partial).not.toHaveProperty('relevanceScore');
    expect(partial).not.toHaveProperty('gateResolved');
  });

  it('isValid는 min~max 범위에서만 true다', () => {
    expect(useContextStore.getState().isValid()).toBe(false);

    useContextStore.getState().setContext('x'.repeat(LIMITS.contextMinLength - 1));
    expect(useContextStore.getState().isValid()).toBe(false);

    useContextStore.getState().setContext('y'.repeat(LIMITS.contextMinLength));
    expect(useContextStore.getState().isValid()).toBe(true);
  });

  it('getDesignPreferences는 mood·audience·layoutPreference를 반환한다', () => {
    useContextStore.getState().setMood('warm');
    useContextStore.getState().setAudience('business');
    useContextStore.getState().setLayoutPreference('feed');

    expect(useContextStore.getState().getDesignPreferences()).toEqual({
      mood: 'warm',
      audience: 'business',
      layoutPreference: 'feed',
    });
  });

  it('reset은 컨텍스트와 gate 관련 상태를 모두 초기화한다', () => {
    useContextStore.getState().setContext('z'.repeat(80));
    useContextStore.getState().setTemplate('t');
    useContextStore.getState().setAiSuggestion({
      template: null,
      mood: 'auto',
      audience: 'general',
      layoutPreference: 'auto',
      reason: 'r',
    });
    useContextStore.getState().markGateResolved();

    useContextStore.getState().reset();

    expect(useContextStore.getState()).toMatchObject(initialState);
  });
});
