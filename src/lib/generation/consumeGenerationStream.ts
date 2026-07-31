/**
 * 생성 SSE 스트림 소비 + visibilitychange 폴링 폴백.
 *
 * `builder/page.tsx` handleGenerate의 reader 루프·visibility 핸들러·
 * generationCompleted / switchedToPolling / sseErrorEvent 플래그 제어를 추출.
 *
 * **characterization 고정**: fire-and-forget `void pollForCompletion(...)` 및
 * abort 없음, 이중 경로 레이스를 그대로 보존한다 (P3에서 수정 예정).
 */

import { appendAndParseSse } from './parseSseBlocks';

export interface ConsumeGenerationStreamDeps {
  updateProgress: (progress: number, message: string) => void;
  completeGeneration: (projectId: string, version?: number) => void;
  /** complete 처리 직후 호출 (resetContext + clearApis). */
  onCompleted?: () => void;
  /**
   * 폴링 폴백. 호출 시 fire-and-forget (`void`) — 취소/abort 없음.
   * characterization: 현 동작 고정 (P3에서 변경 예정)
   */
  pollForCompletion: (projectId: string) => Promise<void>;
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
    // characterization: 현 동작 고정 (P3에서 변경 예정) — poll abort 없음, 플래그만 가드
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
            completeGeneration(
              (event.data.projectId as string) ?? projectId,
              event.data.version as number | undefined,
            );
            onCompleted?.();
            generationCompleted = true;
            return { kind: 'completed' };
          } else if (event.type === 'error') {
            sseErrorEvent = true;
            throw new Error((event.data.message as string) ?? '코드 생성에 실패했습니다.');
          }
        }
      }
    }

    if (!generationCompleted && !switchedToPolling) {
      // SSE stream ended without 'complete' event and we didn't already switch to polling
      // This can happen on mobile disconnect. Switch to polling to check actual server status.
      // characterization: 현 동작 고정 (P3에서 변경 예정) — void fire-and-forget, no abort
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
    // characterization: 현 동작 고정 (P3에서 변경 예정)
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
