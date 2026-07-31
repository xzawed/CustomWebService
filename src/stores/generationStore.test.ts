import { describe, it, expect, beforeEach } from 'vitest';
import { useGenerationStore } from './generationStore';

const initialState = {
  status: 'idle' as const,
  progress: 0,
  currentStep: '',
  projectId: null,
  version: null,
  error: null,
  generatingProjectId: null,
};

describe('useGenerationStore', () => {
  beforeEach(() => {
    // replace=true 금지 — 액션 함수가 덮어써져 사라진다
    useGenerationStore.setState(initialState);
  });

  it('start → progress → complete 전이 시 progress·status·generatingProjectId 불변식을 유지한다', () => {
    const store = useGenerationStore.getState();

    store.startGeneration();
    store.setGeneratingProjectId('proj-1');

    let state = useGenerationStore.getState();
    expect(state.status).toBe('generating');
    expect(state.progress).toBe(0);
    expect(state.currentStep).toBe('');
    expect(state.error).toBeNull();
    expect(state.version).toBeNull();
    expect(state.generatingProjectId).toBe('proj-1');

    store.updateProgress(40, '스테이지 1');
    state = useGenerationStore.getState();
    // updateProgress는 status를 바꾸지 않는다
    expect(state.status).toBe('generating');
    expect(state.progress).toBe(40);
    expect(state.currentStep).toBe('스테이지 1');
    expect(state.generatingProjectId).toBe('proj-1');

    store.completeGeneration('proj-1', 3);
    state = useGenerationStore.getState();
    expect(state.status).toBe('completed');
    expect(state.progress).toBe(100);
    expect(state.projectId).toBe('proj-1');
    expect(state.version).toBe(3);
    expect(state.generatingProjectId).toBeNull();
  });

  it('start → fail 전이 시 status=failed 이고 generatingProjectId를 비운다', () => {
    const store = useGenerationStore.getState();

    store.startGeneration();
    store.setGeneratingProjectId('proj-fail');
    store.updateProgress(25, '생성 중');
    store.failGeneration('타임아웃');

    const state = useGenerationStore.getState();
    expect(state.status).toBe('failed');
    expect(state.error).toBe('타임아웃');
    expect(state.generatingProjectId).toBeNull();
    // failGeneration은 progress/currentStep을 건드리지 않는다
    expect(state.progress).toBe(25);
    expect(state.currentStep).toBe('생성 중');
  });

  it('fail 이후 늦게 도착한 updateProgress는 status·generatingProjectId를 되살리지 않는다', () => {
    const store = useGenerationStore.getState();

    store.startGeneration();
    store.setGeneratingProjectId('proj-late');
    store.failGeneration('연결 끊김');

    const afterFail = useGenerationStore.getState();
    expect(afterFail.status).toBe('failed');
    expect(afterFail.generatingProjectId).toBeNull();

    store.updateProgress(90, '거의 완료');

    const state = useGenerationStore.getState();
    expect(state.status).toBe('failed');
    expect(state.generatingProjectId).toBeNull();
    expect(state.progress).toBe(90);
    expect(state.currentStep).toBe('거의 완료');
    expect(state.error).toBe('연결 끊김');
  });

  it('completeGeneration의 version 생략 시 null로 저장한다', () => {
    const store = useGenerationStore.getState();
    store.startGeneration();
    store.completeGeneration('proj-2');

    const state = useGenerationStore.getState();
    expect(state.status).toBe('completed');
    expect(state.version).toBeNull();
    expect(state.projectId).toBe('proj-2');
    expect(state.generatingProjectId).toBeNull();
  });

  it('reset은 모든 필드를 초기값으로 되돌린다', () => {
    const store = useGenerationStore.getState();
    store.startGeneration();
    store.setGeneratingProjectId('proj-x');
    store.updateProgress(50, '중간');
    store.completeGeneration('proj-x', 1);

    store.reset();

    expect(useGenerationStore.getState()).toMatchObject(initialState);
  });
});
