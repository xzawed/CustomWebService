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
  // 생성은 SSE + 폴링 이중 경로로 돌고, 두 경로가 서로 다른 종료를 보고할 수 있다.
  // 가드가 없으면 늦게 도착한 쪽이 먼저 확정된 결과를 덮어써 **성공이 실패로 뒤집힌다.**
  //
  // ⚠️ **아래 두 이유 때문에 이 가드는 계속 필요하다. 지우지 말 것.**
  // (2026-08-01 적대적 검증 결과 — 당초 적었던 "SSE complete 직후 살아 있는 폴링" 시나리오는
  //  실제로는 도달 불가로 밝혀졌다. `reader.cancel()`이 대기 중인 read를 `{done:true}`로
  //  끝내므로 취소 뒤에 버퍼된 complete를 처리할 수 없다. 그 서술은 틀렸으니 근거로 삼지 말 것.)
  //
  // 1. **cross-run 오염** — `AbortController`가 `runClientGeneration` 호출 로컬이라,
  //    핸드오프된 폴러는 함수가 반환한 뒤에도 최대 5분 더 살아 있고 이를 끊을 수단이 없다.
  //    사용자가 '이전'을 눌러 다시 생성하면 `startGeneration`이 래치를 무조건 재개방하므로,
  //    **이전 실행의 폴러가 새 실행의 상태에 써 넣을 수 있다.**
  // 2. **재생성 경로(`RePromptPanel`)는 이 스토어를 쓰지 않는다** — 로컬 `useState`라
  //    이 안전벨트가 적용되지 않는다. 그쪽은 아직 보호가 없다.
  //
  // 근본 해결은 컨트롤러를 호출 단위가 아니라 **생성 세션 단위**로 올려
  // 새 `startGeneration`이 직전 세션을 끊게 하는 것이다(WBS E3 후속).
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
