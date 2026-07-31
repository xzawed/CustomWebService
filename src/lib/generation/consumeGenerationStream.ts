/**
 * 생성 SSE 스트림 소비 + visibilitychange 폴링 폴백.
 *
 * `builder/page.tsx` handleGenerate의 reader 루프·visibility 핸들러·
 * generationCompleted / switchedToPolling / sseErrorEvent 플래그 제어를 추출.
 *
 * **E3 P3**: SSE terminal(complete/error) 시 `abortPolling`으로 진행 중 폴링을
 * 취소한다. 폴링 핸드오프 경로(stream ended / read error / visibility)에서는
 * 호출하지 않는다 — 그쪽이 폴링을 *시작*하는 경로이기 때문.
 */

import { appendAndParseSse } from './parseSseBlocks';

export interface ConsumeGenerationStreamDeps {
  updateProgress: (progress: number, message: string) => void;
  completeGeneration: (projectId: string, version?: number) => void;
  /** complete 처리 직후 호출 (resetContext + clearApis). */
  onCompleted?: () => void;
  /**
   * 폴링 폴백. 호출 시 fire-and-forget (`void`).
   * 취소는 세션 AbortController + abortPolling 으로 처리 (E3 P3).
   */
  pollForCompletion: (projectId: string) => Promise<void>;
  /**
   * SSE 가 terminal 에 도달했을 때 진행 중 폴링을 중단.
   * complete / error 에서만 호출. 폴링 핸드오프 경로에서는 호출하지 않음.
   */
  abortPolling?: () => void;
  /** 테스트 주입용 Document. 기본은 전역 document. */
  documentRef?: Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>;
}

export type ConsumeGenerationStreamResult =
  | { kind: 'completed' }
  | { kind: 'switched_to_polling'; reason: 'visibility' | 'stream_error' | 'stream_ended' };

/**
 * ReadableStream reader 를 소비하며 progress/complete/error SSE 이벤트를 처리한다.
 * SSE `error` 이벤트는 throw 하여 호출부(outer catch → failGeneration)로 전파한다.
 * 그 외 스트림 끊김·visibility 전환은 폴링으로 전환하고 결과 kind 를 반환한다.
 */
export async function consumeGenerationStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  projectId: string,
  deps: ConsumeGenerationStreamDeps,
): Promise<ConsumeGenerationStreamResult> {
  const {
    updateProgress,
    completeGeneration,
    onCompleted,
    pollForCompletion,
    abortPolling,
    documentRef = typeof document !== 'undefined' ? document : undefined,
  } = deps;

  const decoder = new TextDecoder();
  let buffer = '';
  let done = false;
  let generationCompleted = false;
  let switchedToPolling = false;
  let sseErrorEvent = false;
  let pollReason: 'visibility' | 'stream_error' | 'stream_ended' | null = null;

  const handleVisibilityChange = (): void => {
    if (!documentRef) return;
    // visibility 는 폴링 핸드오프 — abortPolling 호출 금지 (폴링을 *시작*하는 경로)
    if (
      documentRef.visibilityState === 'visible' &&
      !generationCompleted &&
      !switchedToPolling
    ) {
      switchedToPolling = true;
      pollReason = 'visibility';
      reader.cancel().catch(() => {});
      void pollForCompletion(projectId);
    }
  };

  if (documentRef) {
    documentRef.addEventListener('visibilitychange', handleVisibilityChange);
  }

  try {
    while (!done) {
      const { value, done: streamDone } = await reader.read();
      done = streamDone;
      if (value) {
        const chunk = decoder.decode(value, { stream: true });
        const parsed = appendAndParseSse(buffer, chunk);
        buffer = parsed.buffer;

        for (const event of parsed.events) {
          if (event.type === 'progress') {
            updateProgress(
              (event.data.progress as number) ?? 0,
              (event.data.message as string) ?? '',
            );
          } else if (event.type === 'complete') {
            // terminal owner: 폴링을 먼저 끊은 뒤 성공을 기록한다.
            // (방어적 불변조건 — 이 시점에 실제로 도는 폴링은 없다. pollGenerationStatus 헤더 주석 참조)
            abortPolling?.();
            completeGeneration(
              (event.data.projectId as string) ?? projectId,
              event.data.version as number | undefined,
            );
            onCompleted?.();
            generationCompleted = true;
            return { kind: 'completed' };
          } else if (event.type === 'error') {
            sseErrorEvent = true;
            // terminal owner: throw 전에 폴링 취소 — outer catch 의 failGeneration 과 경합 방지
            abortPolling?.();
            throw new Error((event.data.message as string) ?? '코드 생성에 실패했습니다.');
          }
        }
      }
    }

    if (!generationCompleted && !switchedToPolling) {
      // SSE stream ended without 'complete' event and we didn't already switch to polling
      // This can happen on mobile disconnect. Switch to polling to check actual server status.
      // 핸드오프 경로 — abortPolling 호출 금지
      pollReason = 'stream_ended';
      void pollForCompletion(projectId);
      return { kind: 'switched_to_polling', reason: 'stream_ended' };
    }

    if (switchedToPolling && pollReason) {
      return { kind: 'switched_to_polling', reason: pollReason };
    }

    // stream ended after already switched (e.g. cancel after visibility) — still polling path
    return {
      kind: 'switched_to_polling',
      reason: pollReason ?? 'stream_ended',
    };
  } catch (streamErr) {
    if (sseErrorEvent) {
      // 서버가 보낸 SSE error 이벤트 — 외부 catch로 전파
      throw streamErr;
    }
    // 스트림 읽기 에러 (모바일 백그라운드 전환으로 연결 끊김 등) — 폴링으로 전환
    // 핸드오프 경로 — abortPolling 호출 금지
    if (!generationCompleted && !switchedToPolling) {
      switchedToPolling = true;
      pollReason = 'stream_error';
      void pollForCompletion(projectId);
      return { kind: 'switched_to_polling', reason: 'stream_error' };
    }
    return {
      kind: 'switched_to_polling',
      reason: pollReason ?? 'stream_error',
    };
  } finally {
    if (documentRef) {
      documentRef.removeEventListener('visibilitychange', handleVisibilityChange);
    }
    reader.cancel().catch(() => {});
  }
}
