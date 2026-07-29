/**
 * 생성 상태 폴링 — SSE 스트림이 'complete' 없이 끊기거나(모바일 백그라운드 전환 등)
 * visibilitychange로 전환될 때 `/api/v1/generate/status/:projectId`를 주기적으로 조회한다.
 *
 * 원래 `builder/page.tsx`의 `handleGenerate` 클로저 내부에 있던 로직을 추출한 것이며,
 * 의존성을 주입받아 단위 테스트가 가능하다. 추출 당시에는 동작을 그대로 보존했으나
 * 이후 두 가지를 개선했다(아래).
 *
 * **현재 동작에서 헷갈리기 쉬운 지점**:
 * - `status: 'failed'`는 **즉시 terminal 실패**다. 추출 시점에는 `throw` 후 마지막
 *   시도에서만 실패시켜 `maxAttempts`까지 무의미하게 폴링했고, 이를 개선했다.
 * - `status: 'not_found'`는 전용 메시지로 처리한다. 추출 시점에는 union에 없어
 *   'unknown'으로 흘러 "연결 복구 안됨"이라는 잘못된 메시지가 나갔다.
 * - 응답이 `!res.ok`이면 루프를 `break`하여 "생성 시간이 초과되었습니다" 경로로 떨어진다.
 * - `status: 'completed'`인데 `result`가 없으면 'unknown'과 동일하게 처리된다.
 */

export interface GenerationStatusData {
  // 'not_found' — /api/v1/generate/status 엔드포인트가 프로젝트 미존재·권한 없음 시 반환.
  // (이전엔 union에 없어 'unknown'으로 잘못 처리되어 "연결 복구 안됨" 오메시지가 표시되었음)
  status: 'generating' | 'completed' | 'failed' | 'not_found' | 'unknown';
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

/** 한 번의 상태 응답을 처리. 'continue'=폴링 지속, 'stop'=종료. ('failed'는 throw하여 호출부 catch로 전파) */
function handleStatusData(
  data: GenerationStatusData,
  deps: Pick<PollGenerationStatusDeps, 'updateProgress' | 'completeGeneration' | 'failGeneration' | 'onCompleted'>,
): 'continue' | 'stop' {
  if (data.status === 'generating') {
    deps.updateProgress(data.progress ?? 0, data.message ?? '생성 중...');
    return 'continue';
  }
  if (data.status === 'completed' && data.result) {
    deps.completeGeneration(data.result.projectId, data.result.version);
    deps.onCompleted?.();
    return 'stop';
  }
  if (data.status === 'failed') {
    // 서버가 'failed'를 보고하면 터미널 상태다. 즉시 실패 처리한다.
    // (이전엔 throw하여 마지막 시도까지 재시도 → 최대 2분간 무의미하게 폴링하던 동작을 개선)
    deps.failGeneration(data.error ?? '코드 생성에 실패했습니다.');
    return 'stop';
  }
  if (data.status === 'not_found') {
    deps.failGeneration('프로젝트를 찾을 수 없습니다. 대시보드에서 확인해주세요.');
    return 'stop';
  }
  // 'unknown' (또는 result 없는 completed) — tracker entry expired or server restarted
  deps.failGeneration('연결이 복구되지 않았습니다. 대시보드에서 결과를 확인해주세요.');
  return 'stop';
}

export async function pollGenerationStatus(
  projectId: string,
  deps: PollGenerationStatusDeps,
): Promise<void> {
  const {
    failGeneration,
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
      if (handleStatusData(data, deps) === 'stop') return;
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
