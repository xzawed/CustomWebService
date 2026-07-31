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

  // ── 터미널 래치 ─────────────────────────────────────────────────────────
  // SSE + 폴링 이중 경로에서 늦게 도착한 종료가 먼저 확정된 결과를 덮어쓰지 못해야 한다.
  // 폴링은 fire-and-forget으로 시작되고 abort가 없어, 이 순서들이 실제로 발생한다.

  it('fail 이후 늦게 도착한 updateProgress는 아무것도 바꾸지 않는다', () => {
    const store = useGenerationStore.getState();

    store.startGeneration();
    store.setGeneratingProjectId('proj-late');
    store.updateProgress(25, '생성 중');
    store.failGeneration('연결 끊김');

    store.updateProgress(90, '거의 완료');

    const state = useGenerationStore.getState();
    expect(state.status).toBe('failed');
    expect(state.generatingProjectId).toBeNull();
    expect(state.error).toBe('연결 끊김');
    // 종료 후에는 progress·currentStep도 얼어 있어야 한다 (이전엔 90으로 갱신됐다)
    expect(state.progress).toBe(25);
    expect(state.currentStep).toBe('생성 중');
  });

  it('complete 이후 늦게 도착한 updateProgress는 progress 100을 훼손하지 않는다', () => {
    const store = useGenerationStore.getState();

    store.startGeneration();
    store.completeGeneration('proj-1', 2);
    store.updateProgress(40, '뒤늦은 진행률');

    const state = useGenerationStore.getState();
    expect(state.status).toBe('completed');
    expect(state.progress).toBe(100);
  });

  it('complete 이후 늦게 도착한 failGeneration은 성공을 실패로 뒤집지 못한다', () => {
    // 실제 재현 경로: 탭 복귀로 폴링이 시작된 뒤 SSE가 complete를 전달 →
    // 살아 있는 폴링이 타임아웃/tracker TTL 만료로 failGeneration을 부른다.
    // 가드가 없으면 사용자가 성공 직후 에러 화면을 본다.
    const store = useGenerationStore.getState();

    store.startGeneration();
    store.setGeneratingProjectId('proj-win');
    store.completeGeneration('proj-win', 3);

    store.failGeneration('생성 시간이 초과되었습니다. 대시보드에서 확인해주세요.');

    const state = useGenerationStore.getState();
    expect(state.status).toBe('completed');
    expect(state.projectId).toBe('proj-win');
    expect(state.version).toBe(3);
    expect(state.error).toBeNull();
  });

  it('fail 이후 늦게 도착한 completeGeneration은 실패를 성공으로 뒤집지 못한다', () => {
    const store = useGenerationStore.getState();

    store.startGeneration();
    store.failGeneration('코드 생성에 실패했습니다.');

    store.completeGeneration('proj-late', 1);

    const state = useGenerationStore.getState();
    expect(state.status).toBe('failed');
    expect(state.error).toBe('코드 생성에 실패했습니다.');
    expect(state.projectId).toBeNull();
  });

  it('두 번째 completeGeneration은 첫 결과를 덮어쓰지 않는다', () => {
    const store = useGenerationStore.getState();

    store.startGeneration();
    store.completeGeneration('proj-first', 1);
    store.completeGeneration('proj-second', 9);

    const state = useGenerationStore.getState();
    expect(state.projectId).toBe('proj-first');
    expect(state.version).toBe(1);
  });

  it('startGeneration은 터미널 상태에서도 열려 있어야 한다 (재시도 진입점)', () => {
    const store = useGenerationStore.getState();

    store.startGeneration();
    store.failGeneration('첫 시도 실패');

    store.startGeneration();

    const state = useGenerationStore.getState();
    expect(state.status).toBe('generating');
    expect(state.error).toBeNull();
    expect(state.progress).toBe(0);

    // 재시도 이후에는 다시 전이가 허용된다
    store.updateProgress(50, '재시도 중');
    expect(useGenerationStore.getState().progress).toBe(50);
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
