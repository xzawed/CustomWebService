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

  startGeneration: () => void;
  updateProgress: (progress: number, step: string) => void;
  completeGeneration: (projectId: string, version?: number) => void;
  failGeneration: (error: string) => void;
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

  // startGeneration은 유일하게 무조건적이다 — 재시도의 진입점이므로 터미널 상태에서도 열려야 한다.
  startGeneration: () =>
    set({ status: 'generating', progress: 0, currentStep: '', error: null, version: null }),

  // ── 터미널 래치 ───────────────────────────────────────────────────────────
  // 아래 셋은 `generating`일 때만 상태를 바꾼다. **먼저 도착한 종료가 이긴다.**
  //
  // 이유(2026-07-31 발견, 실제 재현 가능한 버그였다): 생성은 SSE + 폴링 이중 경로로 돈다.
  // 탭 복귀 시 `visibilitychange`가 `void pollForCompletion(...)`으로 폴링을 fire-and-forget
  // 시작하는데 `pollGenerationStatus`에는 abort가 없다. 페이지의 `generationCompleted`·
  // `switchedToPolling` 플래그는 **두 번째 폴링 시작만 막을 뿐 이미 도는 폴링을 멈추지 못한다.**
  // 그래서 SSE가 complete를 준 뒤에도 살아 있는 폴링이 타임아웃·tracker TTL 만료로
  // `failGeneration`을 부르면, 가드가 없을 때 **성공이 실패로 뒤집혀** 사용자가 성공 직후
  // 에러 화면을 본다(`pollGenerationStatus`에는 failGeneration 호출부가 5곳이다).
  //
  // 이 래치는 안전벨트이고 근본 해결은 폴링 취소(단일 terminal owner)다.
  // 근본 해결 전까지 이 가드를 제거하지 말 것.
  updateProgress: (progress, currentStep) =>
    set((s) => (s.status === 'generating' ? { progress, currentStep } : s)),

  completeGeneration: (projectId, version) =>
    set((s) =>
      s.status === 'generating'
        ? { status: 'completed', progress: 100, projectId, version: version ?? null, generatingProjectId: null }
        : s
    ),

  failGeneration: (error) =>
    set((s) => (s.status === 'generating' ? { status: 'failed', error, generatingProjectId: null } : s)),

  reset: () =>
    set({ status: 'idle', progress: 0, currentStep: '', projectId: null, version: null, error: null, generatingProjectId: null }),

  setGeneratingProjectId: (id) => set({ generatingProjectId: id }),
}));
