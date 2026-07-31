// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { useBuilderModeStore } from './builderModeStore';

describe('useBuilderModeStore', () => {
  beforeEach(() => {
    localStorage.removeItem('builder-mode');
    // replace=true 금지 — 액션 함수가 덮어써져 사라진다
    useBuilderModeStore.setState({ mode: 'api-first' });
  });

  it('기본 mode는 api-first다', () => {
    expect(useBuilderModeStore.getState().mode).toBe('api-first');
  });

  it('setMode로 context-first / api-first를 전환한다', () => {
    useBuilderModeStore.getState().setMode('context-first');
    expect(useBuilderModeStore.getState().mode).toBe('context-first');

    useBuilderModeStore.getState().setMode('api-first');
    expect(useBuilderModeStore.getState().mode).toBe('api-first');
  });

  it('partialize는 mode 키만 남긴다', () => {
    useBuilderModeStore.getState().setMode('context-first');

    const partialize = useBuilderModeStore.persist.getOptions().partialize;
    expect(partialize).toBeTypeOf('function');

    const partial = partialize!(useBuilderModeStore.getState());
    expect(Object.keys(partial)).toEqual(['mode']);
    expect(partial).toEqual({ mode: 'context-first' });
  });
});
