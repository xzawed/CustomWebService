/**
 * 클라이언트 재생성 오케스트레이션 — POST regenerate → SSE 소비 → 폴링 폴백.
 *
 * `RePromptPanel` handleRegenerate 본문에서 추출. React 의존 없음.
 * 콜백·fetch·poll·document 를 주입받아 단위 테스트 가능.
 *
 * **create 경로와 분리하는 이유**
 * - 재생성은 기존 `projectId` + feedback 로 `POST /api/v1/generate/regenerate` 만 친다.
 * - `runClientGeneration` 은 항상 프로젝트를 먼저 만든다. 플래그로 합치면 API 가 거짓말을 한다.
 *
 * **세션 분리**
 * - 기본 세션은 `beginRegenerationSession` (재생성 전용 싱글톤).
 * - 빌더 `generationSession` 과 공유하지 말 것 — generationSession.ts 주석 참조.
 *
 * ⚠️ abort 는 네트워크 2차 방어. 패널 쪽 late-callback 1차 방어는 로컬 runId/terminal 가드다.
 */

import {
  consumeGenerationStream,
  type ConsumeGenerationStreamDeps,
} from './consumeGenerationStream';
import {
  pollGenerationStatus,
  type PollGenerationStatusDeps,
} from './pollGenerationStatus';
import { beginRegenerationSession } from './regenerationSession';

export interface RunClientRegenerationInput {
  projectId: string;
  feedback: string;
}

export interface RunClientRegenerationDeps {
  updateProgress: (progress: number, message: string) => void;
  /** 성공 시 버전 번호. projectId 는 입력에 이미 있다. */
  completeRegeneration: (version: number | undefined) => void;
  failRegeneration: (message: string) => void;
  /** complete 직후 추가 정리 (패널의 feedback/suggestions 초기화 등). */
  onCompleted?: () => void;
  /** fetch 주입 (테스트용). 기본 전역 fetch. */
  fetchFn?: typeof fetch;
  /**
   * 폴링 구현 주입. 기본 `pollGenerationStatus`.
   * 테스트에서 호출 횟수·인자를 관측할 때 교체.
   */
  pollGenerationStatusFn?: (
    projectId: string,
    deps: PollGenerationStatusDeps,
  ) => Promise<void>;
  /** Document 주입 (visibility 폴백 테스트). */
  documentRef?: ConsumeGenerationStreamDeps['documentRef'];
  /** SSE 소비 구현 주입 (테스트용). 기본 consumeGenerationStream. */
  consumeStream?: typeof consumeGenerationStream;
  /**
   * 세션 시작 주입 (테스트용). 기본 beginRegenerationSession.
   * 빌더 generationSession 과 공유하지 말 것 — generationSession.ts 주석 참조.
   */
  beginSession?: () => AbortSignal;
}

/**
 * 재생성 전체 흐름. 실패 시 failRegeneration, 성공/폴링 전환 시 내부에서 상태 갱신.
 * 반환값은 없음 — 패널은 로컬 status 를 구독한다.
 */
export async function runClientRegeneration(
  input: RunClientRegenerationInput,
  deps: RunClientRegenerationDeps,
): Promise<void> {
  const {
    updateProgress,
    completeRegeneration,
    failRegeneration,
    onCompleted,
    // 언바운드 호출 시 Illegal invocation 방지
    fetchFn = (inputInit, init) => fetch(inputInit, init),
    pollGenerationStatusFn = pollGenerationStatus,
    documentRef,
    consumeStream = consumeGenerationStream,
    beginSession = beginRegenerationSession,
  } = deps;

  // 세션 signal (이전 재생성 세션 abort) + 이 실행 전용 local controller.
  // 폴링·abortPolling 은 local signal 을 쓴다. 세션 abort → local 도 abort.
  // 전역 abort 를 outer catch 에서 부르지 않는다 — 더 새 begin 을 죽일 수 있음.
  const sessionSignal = beginSession();
  const runController = new AbortController();
  if (sessionSignal.aborted) {
    runController.abort();
  } else {
    sessionSignal.addEventListener(
      'abort',
      () => {
        runController.abort();
      },
      { once: true },
    );
  }

  const writeProgress = (progress: number, message: string): void => {
    updateProgress(progress, message);
  };
  const writeComplete = (_projectId: string, version?: number): void => {
    completeRegeneration(version);
  };
  const writeFail = (message: string): void => {
    failRegeneration(message);
  };

  try {
    const genRes = await fetchFn('/api/v1/generate/regenerate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId: input.projectId,
        feedback: input.feedback,
      }),
      signal: runController.signal,
    });

    if (!genRes.ok) {
      const errData = (await genRes.json().catch(() => ({}))) as {
        error?: { message?: string };
      };
      throw new Error(errData.error?.message ?? '재생성에 실패했습니다.');
    }

    const reader = genRes.body?.getReader();
    if (!reader) throw new Error('스트림을 읽을 수 없습니다.');

    // 폴링 로직은 pollGenerationStatus (단위 테스트 대상).
    // signal 공유로 SSE complete/error 가 폴링 terminal 을 차단한다.
    // not_found 전용 메시지도 공유 헬퍼가 처리한다 (패널 사설 복제의 union 누락 수정).
    const pollForCompletion = (pid: string): Promise<void> =>
      pollGenerationStatusFn(pid, {
        updateProgress: writeProgress,
        completeGeneration: writeComplete,
        failGeneration: writeFail,
        onCompleted,
        signal: runController.signal,
      });

    await consumeStream(reader, input.projectId, {
      updateProgress: writeProgress,
      completeGeneration: writeComplete,
      onCompleted,
      pollForCompletion,
      abortPolling: () => {
        runController.abort();
      },
      documentRef,
    });
  } catch (err) {
    // 이미 핸드오프된 폴링이 이후 timeout fail 을 찍지 않도록 먼저 끊는다.
    // **이 실행의** controller 만 abort — 전역 abortRegenerationSession 금지.
    // abort 는 멱등; SSE error 경로에서 이미 abortPolling 했어도 안전.
    runController.abort();

    // AbortError 는 의도된 취소(언마운트·후속 실행) — terminal 실패로 올리지 않는다.
    if (err instanceof DOMException && err.name === 'AbortError') {
      return;
    }
    if (err instanceof Error && err.name === 'AbortError') {
      return;
    }

    writeFail(err instanceof Error ? err.message : '알 수 없는 오류');
  }
}
