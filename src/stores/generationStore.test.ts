import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  abortGenerationSession,
  __resetGenerationSessionForTests,
} from '@/lib/generation/generationSession';
import { useGenerationStore } from './generationStore';

const initialState = {
  status: 'idle' as const,
  progress: 0,
  currentStep: '',
  projectId: null,
  version: null,
  error: null,
  generatingProjectId: null,
  runId: null,
};

describe('useGenerationStore', () => {
  beforeEach(() => {
    // replace=true 금지 — 액션 함수가 덮어써져 사라진다
    useGenerationStore.setState(initialState);
  });

  afterEach(() => {
    __resetGenerationSessionForTests();
  });

  it('start → progress → complete 전이 시 progress·status·generatingProjectId 불변식을 유지한다', () => {
    const store = useGenerationStore.getState();

    const runId = store.startGeneration();
    store.setGeneratingProjectId('proj-1');

    let state = useGenerationStore.getState();
    expect(state.status).toBe('generating');
    expect(state.progress).toBe(0);
    expect(state.currentStep).toBe('');
    expect(state.error).toBeNull();
    expect(state.version).toBeNull();
    expect(state.generatingProjectId).toBe('proj-1');
    expect(state.runId).toBe(runId);

    store.updateProgress(40, '스테이지 1', runId);
    state = useGenerationStore.getState();
    // updateProgress는 status를 바꾸지 않는다
    expect(state.status).toBe('generating');
    expect(state.progress).toBe(40);
    expect(state.currentStep).toBe('스테이지 1');
    expect(state.generatingProjectId).toBe('proj-1');

    store.completeGeneration('proj-1', 3, runId);
    state = useGenerationStore.getState();
    expect(state.status).toBe('completed');
    expect(state.progress).toBe(100);
    expect(state.projectId).toBe('proj-1');
    expect(state.version).toBe(3);
    expect(state.generatingProjectId).toBeNull();
  });

  it('start → fail 전이 시 status=failed 이고 generatingProjectId를 비운다', () => {
    const store = useGenerationStore.getState();

    const runId = store.startGeneration();
    store.setGeneratingProjectId('proj-fail');
    store.updateProgress(25, '생성 중', runId);
    store.failGeneration('타임아웃', runId);

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

  it('fail 이후 늦게 도착한 updateProgress는 아무것도 바꾸지 않는다', () => {
    const store = useGenerationStore.getState();

    const runId = store.startGeneration();
    store.setGeneratingProjectId('proj-late');
    store.updateProgress(25, '생성 중', runId);
    store.failGeneration('연결 끊김', runId);

    store.updateProgress(90, '거의 완료', runId);

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

    const runId = store.startGeneration();
    store.completeGeneration('proj-1', 2, runId);
    store.updateProgress(40, '뒤늦은 진행률', runId);

    const state = useGenerationStore.getState();
    expect(state.status).toBe('completed');
    expect(state.progress).toBe(100);
  });

  it('complete 이후 늦게 도착한 failGeneration은 성공을 실패로 뒤집지 못한다', () => {
    // 실제 재현 경로: 탭 복귀로 폴링이 시작된 뒤 SSE가 complete를 전달 →
    // 살아 있는 폴링이 타임아웃/tracker TTL 만료로 failGeneration을 부른다.
    // 가드가 없으면 사용자가 성공 직후 에러 화면을 본다.
    const store = useGenerationStore.getState();

    const runId = store.startGeneration();
    store.setGeneratingProjectId('proj-win');
    store.completeGeneration('proj-win', 3, runId);

    store.failGeneration('생성 시간이 초과되었습니다. 대시보드에서 확인해주세요.', runId);

    const state = useGenerationStore.getState();
    expect(state.status).toBe('completed');
    expect(state.projectId).toBe('proj-win');
    expect(state.version).toBe(3);
    expect(state.error).toBeNull();
  });

  it('fail 이후 늦게 도착한 completeGeneration은 실패를 성공으로 뒤집지 못한다', () => {
    const store = useGenerationStore.getState();

    const runId = store.startGeneration();
    store.failGeneration('코드 생성에 실패했습니다.', runId);

    store.completeGeneration('proj-late', 1, runId);

    const state = useGenerationStore.getState();
    expect(state.status).toBe('failed');
    expect(state.error).toBe('코드 생성에 실패했습니다.');
    expect(state.projectId).toBeNull();
  });

  it('두 번째 completeGeneration은 첫 결과를 덮어쓰지 않는다', () => {
    const store = useGenerationStore.getState();

    const runId = store.startGeneration();
    store.completeGeneration('proj-first', 1, runId);
    store.completeGeneration('proj-second', 9, runId);

    const state = useGenerationStore.getState();
    expect(state.projectId).toBe('proj-first');
    expect(state.version).toBe(1);
  });

  it('startGeneration은 터미널 상태에서도 열려 있어야 한다 (재시도 진입점)', () => {
    const store = useGenerationStore.getState();

    const runIdA = store.startGeneration();
    store.failGeneration('첫 시도 실패', runIdA);

    const runIdB = store.startGeneration();

    const state = useGenerationStore.getState();
    expect(state.status).toBe('generating');
    expect(state.error).toBeNull();
    expect(state.progress).toBe(0);
    expect(state.runId).toBe(runIdB);
    expect(runIdB).not.toBe(runIdA);

    // 재시도 이후에는 다시 전이가 허용된다
    store.updateProgress(50, '재시도 중', runIdB);
    expect(useGenerationStore.getState().progress).toBe(50);
  });

  it('completeGeneration의 version 생략(undefined) 시 null로 저장한다', () => {
    const store = useGenerationStore.getState();
    const runId = store.startGeneration();
    store.completeGeneration('proj-2', undefined, runId);

    const state = useGenerationStore.getState();
    expect(state.status).toBe('completed');
    expect(state.version).toBeNull();
    expect(state.projectId).toBe('proj-2');
    expect(state.generatingProjectId).toBeNull();
  });

  it('reset은 모든 필드를 초기값으로 되돌린다', () => {
    const store = useGenerationStore.getState();
    const runId = store.startGeneration();
    store.setGeneratingProjectId('proj-x');
    store.updateProgress(50, '중간', runId);
    store.completeGeneration('proj-x', 1, runId);

    store.reset();

    expect(useGenerationStore.getState()).toMatchObject(initialState);
    expect(useGenerationStore.getState().runId).toBeNull();
  });

  // ── runId 가드 (E8) ───────────────────────────────────────────────────────

  it('startGeneration은 호출마다 다른 runId를 반환한다', () => {
    const store = useGenerationStore.getState();
    const a = store.startGeneration();
    const b = store.startGeneration();
    expect(a).not.toBe(b);
    expect(useGenerationStore.getState().runId).toBe(b);
  });

  it('reset은 runId를 null로 비운다', () => {
    const store = useGenerationStore.getState();
    store.startGeneration();
    expect(useGenerationStore.getState().runId).not.toBeNull();
    store.reset();
    expect(useGenerationStore.getState().runId).toBeNull();
  });

  it('stale runId 의 terminal 호출은 generating 중에도 무시된다', () => {
    const store = useGenerationStore.getState();
    const runId = store.startGeneration();
    store.setGeneratingProjectId('proj-live');
    store.updateProgress(30, '진행', runId);

    store.completeGeneration('proj-stale', 9, 'not-the-active-run');
    store.failGeneration('stale fail', 'also-stale');
    store.updateProgress(99, 'stale progress', 'stale-run');

    const state = useGenerationStore.getState();
    expect(state.status).toBe('generating');
    expect(state.runId).toBe(runId);
    expect(state.progress).toBe(30);
    expect(state.currentStep).toBe('진행');
    expect(state.projectId).toBeNull();
    expect(state.error).toBeNull();
    expect(state.generatingProjectId).toBe('proj-live');
  });

  /**
   * E8 회귀: 이전 → 재생성 시 이전 실행의 폴러가 새 실행 상태를 오염시키지 못한다.
   * 실제 버그 경로 — 폴러가 fire-and-forget 으로 최대 5분 살아 있고,
   * startGeneration 이 래치를 재개방한 뒤 stale complete/fail 이 도착한다.
   */
  it('이전 → 재생성 시 이전 실행의 폴러가 새 실행 상태를 오염시키지 못한다', () => {
    const store = useGenerationStore.getState();

    // Run A 시작 후 폴링 핸드오프 상태 (in-flight 폴러가 runIdA 를 캡처)
    const runIdA = store.startGeneration();
    store.setGeneratingProjectId('proj-a');
    store.updateProgress(15, 'Run A 생성 중', runIdA);

    // 사용자 '이전' — 세션 abort + store reset (handleResetMode 와 동일)
    abortGenerationSession();
    store.reset();
    expect(useGenerationStore.getState().status).toBe('idle');
    expect(useGenerationStore.getState().runId).toBeNull();

    // Run B 시작 (새 runId)
    const runIdB = store.startGeneration();
    store.setGeneratingProjectId('proj-b');
    store.updateProgress(20, 'Run B 생성 중', runIdB);
    expect(runIdB).not.toBe(runIdA);

    // Run A 폴러가 늦게 terminal 도착 — complete 경로
    store.completeGeneration('proj-a', 1, runIdA);

    let state = useGenerationStore.getState();
    expect(state.status).toBe('generating');
    expect(state.runId).toBe(runIdB);
    expect(state.projectId).toBeNull();
    expect(state.generatingProjectId).toBe('proj-b');
    expect(state.progress).toBe(20);
    expect(state.currentStep).toBe('Run B 생성 중');
    expect(state.error).toBeNull();

    // Run A 폴러 fail 경로도 무시
    store.failGeneration('생성 시간이 초과되었습니다. 대시보드에서 확인해주세요.', runIdA);

    state = useGenerationStore.getState();
    expect(state.status).toBe('generating');
    expect(state.runId).toBe(runIdB);
    expect(state.error).toBeNull();
    expect(state.generatingProjectId).toBe('proj-b');

    // Run B 자신은 여전히 종료 가능
    store.completeGeneration('proj-b', 2, runIdB);
    state = useGenerationStore.getState();
    expect(state.status).toBe('completed');
    expect(state.projectId).toBe('proj-b');
    expect(state.version).toBe(2);
    expect(state.runId).toBe(runIdB);
  });
});
