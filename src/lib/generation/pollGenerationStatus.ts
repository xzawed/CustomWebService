/**
 * 생성 상태 폴링 — SSE 스트림이 'complete' 없이 끊기거나(모바일 백그라운드 전환 등)
 * visibilitychange로 전환될 때 `/api/v1/generate/status/:projectId`를 주기적으로 조회한다.
 *
 * 원래 `builder/page.tsx`의 `handleGenerate` 클로저 내부에 있던 로직을 그대로 추출한 것이다.
 * 동작을 byte-for-byte 보존했으며(아래 주의 참고), 의존성을 주입받아 단위 테스트가 가능하다.
 *
 * **주의(기존 동작 보존)**:
 * - `status: 'failed'`는 즉시 실패시키지 않고 `throw` → catch에서 마지막 시도일 때만
 *   `failGeneration`. 즉 'failed'가 계속 반환되면 `maxAttempts`까지 재시도 후 실패한다.
 *   (개선 여지가 있으나 이번 추출은 동작 변경 없이 보존만 한다.)
 * - 응답이 `!res.ok`이면 루프를 `break`하여 "생성 시간이 초과되었습니다" 경로로 떨어진다.
 * - `status: 'completed'`인데 `result`가 없으면 'unknown'과 동일하게 처리된다.
 */

export interface GenerationStatusData {
  status: 'generating' | 'completed' | 'failed' | 'unknown';
  progress?: number;
  message?: string;
  result?: { projectId: string; version: number };
  error?: string;
}

export interface PollGenerationStatusDeps {
  updateProgress: (progress: number, message: string) => void;
  completeGeneration: (projectId: string, version?: number) => void;
  failGeneration: (message: string) => void;
  /** completed 처리 직후 호출 (기존 코드의 resetContext + clearApis 정리 단계). */
  onCompleted?: () => void;
  /** 폴링 간 대기. 기본은 setTimeout 기반 sleep. 테스트에서 즉시 resolve로 주입 가능. */
  delay?: (ms: number) => Promise<void>;
  /** fetch 주입 (테스트용). 기본은 전역 fetch. */
  fetchFn?: typeof fetch;
  /** 최대 시도 횟수 (기본 120 = 1초 간격 2분). */
  maxAttempts?: number;
  /** 폴링 간격 ms (기본 1000). */
  intervalMs?: number;
}

const defaultDelay = (ms: number): Promise<void> =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function pollGenerationStatus(
  projectId: string,
  deps: PollGenerationStatusDeps,
): Promise<void> {
  const {
    updateProgress,
    completeGeneration,
    failGeneration,
    onCompleted,
    delay = defaultDelay,
    // 언바운드 호출 시 일부 런타임에서 "Illegal invocation"이 나므로 래핑하여 전달한다.
    fetchFn = (input, init) => fetch(input, init),
    maxAttempts = 120,
    intervalMs = 1000,
  } = deps;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const res = await fetchFn(`/api/v1/generate/status/${projectId}`);
      if (!res.ok) break;
      const { data } = (await res.json()) as { data: GenerationStatusData };
      if (data.status === 'generating') {
        updateProgress(data.progress ?? 0, data.message ?? '생성 중...');
      } else if (data.status === 'completed' && data.result) {
        completeGeneration(data.result.projectId, data.result.version);
        onCompleted?.();
        return;
      } else if (data.status === 'failed') {
        throw new Error(data.error ?? '코드 생성에 실패했습니다.');
      } else {
        // 'unknown' — tracker entry expired or server restarted
        failGeneration('연결이 복구되지 않았습니다. 대시보드에서 결과를 확인해주세요.');
        return;
      }
    } catch (err) {
      if (attempt === maxAttempts - 1) {
        failGeneration(err instanceof Error ? err.message : '폴링 중 오류 발생');
        return;
      }
    }
    await delay(intervalMs);
  }
  failGeneration('생성 시간이 초과되었습니다. 대시보드에서 확인해주세요.');
}
