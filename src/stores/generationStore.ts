import { create } from 'zustand';

type GenerationStatus = 'idle' | 'generating' | 'completed' | 'failed';

interface GenerationState {
  status: GenerationStatus;
  progress: number;
  currentStep: string;
  projectId: string | null;
  version: number | null;
  error: string | null;
  generatingProjectId: string | null;   // set when generation starts, before SSE
  /** 생성 실행 단위 ID. startGeneration 이 민팅하며, stale 콜백 무시용. */
  runId: string | null;

  /** 새 실행을 열고 runId 를 반환. 터미널 상태에서도 무조건 열린다(재시도 진입점). */
  startGeneration: () => string;
  updateProgress: (progress: number, step: string, runId: string) => void;
  completeGeneration: (projectId: string, version: number | undefined, runId: string) => void;
  failGeneration: (error: string, runId: string) => void;
  reset: () => void;
  setGeneratingProjectId: (id: string) => void;
}

export const useGenerationStore = create<GenerationState>((set) => ({
  status: 'idle',
  progress: 0,
  currentStep: '',
  projectId: null,
  version: null,
  error: null,
  generatingProjectId: null,
  runId: null,

  // startGeneration은 유일하게 무조건적이다 — 재시도의 진입점이므로 터미널 상태에서도 열려야 한다.
  startGeneration: () => {
    const runId = crypto.randomUUID();
    set({
      status: 'generating',
      progress: 0,
      currentStep: '',
      error: null,
      version: null,
      runId,
    });
    return runId;
  },

  // ── 터미널 래치 + runId 가드 ──────────────────────────────────────────────
  // 아래 셋은 `status === 'generating' && state.runId === runId`일 때만 상태를 바꾼다.
  // **먼저 도착한 종료가 이긴다** + **다른 실행의 콜백은 무시한다.**
  //
  // 생성은 SSE + 폴링 이중 경로로 돌고, 두 경로가 서로 다른 종료를 보고할 수 있다.
  // 가드가 없으면 늦게 도착한 쪽이 먼저 확정된 결과를 덮어써 **성공이 실패로 뒤집힌다.**
  //
  // ⚠️ **터미널 래치(`status === 'generating'`)를 지우지 말 것.**
  // (2026-08-01 적대적 검증 결과 — 당초 적었던 "SSE complete 직후 살아 있는 폴링" 시나리오는
  //  실제로는 도달 불가로 밝혀졌다. `reader.cancel()`이 대기 중인 read를 `{done:true}`로
  //  끝내므로 취소 뒤에 버퍼된 complete를 처리할 수 없다. 그 서술은 틀렸으니 근거로 삼지 말 것.)
  //
  // 1. **cross-run 오염 (E8 — `runId` 가 1차 방어)** — 핸드오프된 폴러는 함수가 반환한
  //    뒤에도 최대 5분 더 살아 있을 수 있다. 사용자가 '이전' 후 다시 생성하면
  //    `startGeneration`이 래치를 무조건 재개방하므로, **runId 가 없으면** 이전 실행의
  //    폴러가 새 실행 상태에 써 넣는다. 세션 abort 는 네트워크를 끊는 2차 방어이며,
  //    abort 가 누락돼도 runId 가 상태 오염을 막는다.
  // 2. **같은 실행 안 SSE/폴링 경쟁 종료 (defence-in-depth)** — 먼저 도착한 쪽을 확정한다.
  //    (E9 이후) 재생성 경로(`RePromptPanel`)는 이 스토어를 쓰지 않고 패널 로컬
  //    runId/terminal 가드 + `regenerationSession` abort 로 보호한다. 이 스토어 래치는
  //    빌더 create→generate 경로 전용이며, "RePromptPanel 미보호"가 존속 이유는 아니다.
  updateProgress: (progress, currentStep, runId) =>
    set((s) =>
      s.status === 'generating' && s.runId === runId
        ? { progress, currentStep }
        : s,
    ),

  completeGeneration: (projectId, version, runId) =>
    set((s) =>
      s.status === 'generating' && s.runId === runId
        ? {
            status: 'completed',
            progress: 100,
            projectId,
            version: version ?? null,
            generatingProjectId: null,
          }
        : s,
    ),

  failGeneration: (error, runId) =>
    set((s) =>
      s.status === 'generating' && s.runId === runId
        ? { status: 'failed', error, generatingProjectId: null }
        : s,
    ),

  reset: () =>
    set({
      status: 'idle',
      progress: 0,
      currentStep: '',
      projectId: null,
      version: null,
      error: null,
      generatingProjectId: null,
      runId: null,
    }),

  setGeneratingProjectId: (id) => set({ generatingProjectId: id }),
}));
