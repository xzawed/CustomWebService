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
 * - `signal`이 abort되면 **어떤 terminal 콜백도 호출하지 않고 반환**한다(E3 P3).
 *   단, `delay(intervalMs)` 중 abort되면 그 대기가 끝난 뒤에 반환하므로 최대 1틱 늦다.
 *
 * ⚠️ **이 abort는 방어적 불변조건이지 "SSE 성공을 폴링이 덮어쓰는 레이스"의 해결이 아니다.**
 * 그 레이스는 실측상 실제 브라우저에서 도달 불가다 — 폴링을 시작하는 세 지점
 * (visibility / stream_ended / stream_error)은 전부 리더 루프가 끝난 뒤이고,
 * `reader.cancel()`은 대기 중인 `read()`를 `{done:true}`로 즉시 종료시켜
 * 그 뒤에 버퍼된 `complete`를 처리할 수 없다(2026-08-01 런타임 프로브로 확인).
 * 즉 abort가 취소할 "살아 있는 폴링"은 프로덕션에 존재하지 않는다.
 *
 * 사용자가 실제로 겪던 "성공했는데 실패 화면"의 원인은 **폴링 예산 부족**이었고
 * (`maxAttempts` 주석 참조), 그쪽이 진짜 수정이다.
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
  /**
   * 최대 시도 횟수 (기본 300 = 1초 간격 5분).
   *
   * ⚠️ **서버 파이프라인 예산보다 짧으면 성공한 생성을 실패로 표시한다.**
   * 서버는 `PIPELINE_MAX_DURATION_MS`(기본 290초, Railway 300초 한도 대비 마진)까지 돌 수 있는데
   * 이 값이 120이던 시절 클라이언트는 **120초에 포기하고 `failGeneration('생성 시간이 초과되었습니다')`**를
   * 불렀다. 그 뒤 서버가 정상 완료해도 사용자는 이미 실패 화면을 본 뒤였다 —
   * 모바일 백그라운드 전환으로 폴링에 넘어간 긴 생성에서 실제로 재현되는 경로다(2026-08-01 발견).
   *
   * 이 값을 줄이려면 반드시 `PIPELINE_MAX_DURATION_MS`와 함께 볼 것.
   */
  maxAttempts?: number;
  /** 폴링 간격 ms (기본 1000). */
  intervalMs?: number;
  /**
   * 생성 세션 AbortSignal. abort 되면 즉시 return 하며
   * completeGeneration / failGeneration / updateProgress 를 더 이상 호출하지 않는다.
   */
  signal?: AbortSignal;
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
    maxAttempts = 300,
    intervalMs = 1000,
    signal,
  } = deps;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // abort 후 terminal/progress 콜백 금지 불변조건
    if (signal?.aborted) return;

    try {
      const res = await fetchFn(`/api/v1/generate/status/${projectId}`, { signal });
      if (signal?.aborted) return;
      if (!res.ok) break;
      const { data } = (await res.json()) as { data: GenerationStatusData };
      if (signal?.aborted) return;
      if (handleStatusData(data, deps) === 'stop') return;
    } catch (err) {
      // AbortError 및 abort 직후 거부는 terminal 이 아니다
      if (signal?.aborted) return;
      if (attempt === maxAttempts - 1) {
        failGeneration(err instanceof Error ? err.message : '폴링 중 오류 발생');
        return;
      }
    }
    await delay(intervalMs);
  }

  if (signal?.aborted) return;
  failGeneration('생성 시간이 초과되었습니다. 대시보드에서 확인해주세요.');
}
