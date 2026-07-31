/**
 * 클라이언트 생성 오케스트레이션 — 프로젝트 생성 → POST generate → SSE 소비.
 *
 * `builder/page.tsx` handleGenerate 본문에서 추출. React/router 의존 없음.
 * 스토어 액션·fetch·poll·document·now 를 주입받아 단위 테스트 가능.
 *
 * **characterization 고정**: SSE + 폴링 이중 경로 레이스 포함 현 동작 보존 (P3 별도).
 */

import {
  consumeGenerationStream,
  type ConsumeGenerationStreamDeps,
} from './consumeGenerationStream';
import {
  pollGenerationStatus,
  type PollGenerationStatusDeps,
} from './pollGenerationStatus';

export interface RunClientGenerationInput {
  context: string;
  apiIds: string[];
  designPreferences: unknown;
  templateId?: string | null;
}

export interface RunClientGenerationDeps {
  startGeneration: () => void;
  updateProgress: (progress: number, message: string) => void;
  completeGeneration: (projectId: string, version?: number) => void;
  failGeneration: (message: string) => void;
  setGeneratingProjectId: (id: string) => void;
  /** complete 시 resetContext + clearApis 등 정리. */
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
  /** 프로젝트 이름 timestamp. 기본 Date.now. */
  now?: () => number;
  /** SSE 소비 구현 주입 (테스트용). 기본 consumeGenerationStream. */
  consumeStream?: typeof consumeGenerationStream;
}

/**
 * 생성 전체 흐름. 실패 시 failGeneration, 성공/폴링 전환 시 내부에서 상태 갱신.
 * 반환값은 없음 — 페이지는 스토어 status를 구독한다.
 */
export async function runClientGeneration(
  input: RunClientGenerationInput,
  deps: RunClientGenerationDeps,
): Promise<void> {
  const {
    startGeneration,
    updateProgress,
    completeGeneration,
    failGeneration,
    setGeneratingProjectId,
    onCompleted,
    // 언바운드 호출 시 Illegal invocation 방지
    fetchFn = (inputInit, init) => fetch(inputInit, init),
    pollGenerationStatusFn = pollGenerationStatus,
    documentRef,
    now = () => Date.now(),
    consumeStream = consumeGenerationStream,
  } = deps;

  startGeneration();

  try {
    updateProgress(5, '프로젝트 생성 중...');
    const createRes = await fetchFn('/api/v1/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `프로젝트-${now()}`,
        context: input.context,
        apiIds: input.apiIds,
        designPreferences: input.designPreferences,
      }),
    });

    if (!createRes.ok) {
      const errData = (await createRes.json().catch(() => ({}))) as {
        error?: { message?: string };
      };
      throw new Error(errData.error?.message ?? '프로젝트 생성에 실패했습니다.');
    }

    const { data: project } = (await createRes.json()) as { data: { id: string } };
    setGeneratingProjectId(project.id);

    updateProgress(10, 'AI 코드 생성 시작...');
    const genRes = await fetchFn('/api/v1/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId: project.id,
        templateId: input.templateId ?? undefined,
      }),
    });

    if (!genRes.ok) {
      const errData = (await genRes.json().catch(() => ({}))) as {
        error?: { message?: string };
      };
      throw new Error(errData.error?.message ?? '코드 생성에 실패했습니다.');
    }

    const reader = genRes.body?.getReader();
    if (!reader) throw new Error('스트림을 읽을 수 없습니다.');

    // 폴링 로직은 pollGenerationStatus (단위 테스트 대상).
    // 동작 보존: completed 시 completeGeneration → onCompleted.
    const pollForCompletion = (pid: string): Promise<void> =>
      pollGenerationStatusFn(pid, {
        updateProgress,
        completeGeneration,
        failGeneration,
        onCompleted,
      });

    await consumeStream(reader, project.id, {
      updateProgress,
      completeGeneration,
      onCompleted,
      pollForCompletion,
      documentRef,
    });
  } catch (err) {
    failGeneration(err instanceof Error ? err.message : '알 수 없는 오류');
  }
}
