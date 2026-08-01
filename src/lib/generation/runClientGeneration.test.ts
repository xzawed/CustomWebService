import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { __resetGenerationSessionForTests } from './generationSession';
import { runClientGeneration } from './runClientGeneration';
import { pollGenerationStatus } from './pollGenerationStatus';
import type { PollGenerationStatusDeps } from './pollGenerationStatus';

const TEST_RUN_ID = 'run-test-fixed-id';

function makeJsonRes(body: unknown, ok = true): Response {
  return {
    ok,
    json: async () => body,
    body: null,
  } as unknown as Response;
}

function makeStreamRes(chunks: string[]): Response {
  const encoded = chunks.map((c) => new TextEncoder().encode(c));
  let i = 0;
  const reader = {
    read: vi.fn(async () => {
      if (i >= encoded.length) return { value: undefined, done: true };
      const value = encoded[i];
      i += 1;
      return { value, done: false };
    }),
    cancel: vi.fn().mockResolvedValue(undefined),
    releaseLock: vi.fn(),
    closed: Promise.resolve(undefined),
  };
  return {
    ok: true,
    json: async () => ({}),
    body: {
      getReader: () => reader,
    },
  } as unknown as Response;
}

/** 첫 청크 후 hang, 이후 resolve 로 complete 주입 가능한 stream Response. */
function makeControllableStreamRes(firstChunk: string): {
  response: Response;
  resolveSecond: (chunk: string | null) => void;
  cancel: ReturnType<typeof vi.fn>;
} {
  const encode = (t: string): Uint8Array => new TextEncoder().encode(t);
  let resolveHang:
    | ((v: { value?: Uint8Array; done: boolean }) => void)
    | undefined;
  let readCount = 0;
  const cancel = vi.fn().mockResolvedValue(undefined);
  const reader = {
    read: vi.fn(
      () =>
        new Promise<{ value?: Uint8Array; done: boolean }>((resolve) => {
          readCount += 1;
          if (readCount === 1) {
            resolve({ value: encode(firstChunk), done: false });
          } else if (readCount === 2) {
            resolveHang = resolve;
          } else {
            resolve({ value: undefined, done: true });
          }
        }),
    ),
    cancel,
    releaseLock: vi.fn(),
    closed: Promise.resolve(undefined),
  };
  return {
    response: {
      ok: true,
      json: async () => ({}),
      body: { getReader: () => reader },
    } as unknown as Response,
    resolveSecond: (chunk: string | null) => {
      if (chunk === null) {
        resolveHang?.({ done: true });
      } else {
        resolveHang?.({ value: encode(chunk), done: false });
      }
    },
    cancel,
  };
}

type Listener = () => void;

function makeDocument(initial: DocumentVisibilityState = 'hidden') {
  let visibilityState: DocumentVisibilityState = initial;
  const listeners = new Set<Listener>();
  return {
    get visibilityState() {
      return visibilityState;
    },
    setVisibility(state: DocumentVisibilityState) {
      visibilityState = state;
      for (const l of listeners) l();
    },
    addEventListener: vi.fn((type: string, listener: EventListener) => {
      if (type === 'visibilitychange') {
        listeners.add(listener as Listener);
      }
    }),
    removeEventListener: vi.fn((type: string, listener: EventListener) => {
      if (type === 'visibilitychange') {
        listeners.delete(listener as Listener);
      }
    }),
  };
}

function makeDeps(overrides: Partial<Parameters<typeof runClientGeneration>[1]> = {}) {
  return {
    startGeneration: vi.fn(() => TEST_RUN_ID),
    updateProgress: vi.fn(),
    completeGeneration: vi.fn(),
    failGeneration: vi.fn(),
    setGeneratingProjectId: vi.fn(),
    onCompleted: vi.fn(),
    now: () => 1_700_000_000_000,
    // 테스트 간 세션 싱글톤 간섭 방지 — 독립 AbortSignal
    beginSession: () => new AbortController().signal,
    documentRef: {
      visibilityState: 'visible' as DocumentVisibilityState,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    },
    ...overrides,
  };
}

const input = {
  context: '날씨 앱을 만들어주세요',
  apiIds: ['api-1'],
  designPreferences: { mood: 'auto' },
  templateId: 'tpl-a' as string | null,
};

describe('runClientGeneration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    __resetGenerationSessionForTests();
  });

  it('create 실패 → failGeneration, generate 미호출', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      makeJsonRes({ error: { message: '생성 한도 초과' } }, false),
    );
    const deps = makeDeps({ fetchFn });

    await runClientGeneration(input, deps);

    expect(deps.startGeneration).toHaveBeenCalledTimes(1);
    expect(deps.updateProgress).toHaveBeenCalledWith(
      5,
      '프로젝트 생성 중...',
      TEST_RUN_ID,
    );
    expect(deps.failGeneration).toHaveBeenCalledWith('생성 한도 초과', TEST_RUN_ID);
    expect(deps.setGeneratingProjectId).not.toHaveBeenCalled();
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn.mock.calls[0][0]).toBe('/api/v1/projects');
  });

  it('create ok, generate 실패 → setGeneratingProjectId 후 failGeneration', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(makeJsonRes({ data: { id: 'proj-1' } }))
      .mockResolvedValueOnce(makeJsonRes({ error: { message: '생성 거부' } }, false));
    const deps = makeDeps({ fetchFn });

    await runClientGeneration(input, deps);

    expect(deps.setGeneratingProjectId).toHaveBeenCalledWith('proj-1');
    expect(deps.updateProgress).toHaveBeenCalledWith(
      10,
      'AI 코드 생성 시작...',
      TEST_RUN_ID,
    );
    expect(deps.failGeneration).toHaveBeenCalledWith('생성 거부', TEST_RUN_ID);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(fetchFn.mock.calls[1][0]).toBe('/api/v1/generate');
  });

  it("generate ok but no body → fails with '스트림을 읽을 수 없습니다.'", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(makeJsonRes({ data: { id: 'proj-2' } }))
      .mockResolvedValueOnce(makeJsonRes({}, true)); // body null
    const deps = makeDeps({ fetchFn });

    await runClientGeneration(input, deps);

    expect(deps.failGeneration).toHaveBeenCalledWith(
      '스트림을 읽을 수 없습니다.',
      TEST_RUN_ID,
    );
  });

  it('happy path → progress 5 → 10 → SSE progress → complete → onCompleted 1회', async () => {
    const streamBody =
      'event: progress\ndata: {"progress":55,"message":"코드 작성"}\n\n' +
      'event: complete\ndata: {"projectId":"proj-h","version":3}\n\n';
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(makeJsonRes({ data: { id: 'proj-h' } }))
      .mockResolvedValueOnce(makeStreamRes([streamBody]));
    // .mock 접근을 위해 mock을 직접 보유 (makeDeps spread는 타입을 union으로 넓힘).
    const updateProgress = vi.fn();
    const deps = makeDeps({ fetchFn, updateProgress });

    await runClientGeneration(input, deps);

    expect(deps.failGeneration).not.toHaveBeenCalled();
    expect(deps.setGeneratingProjectId).toHaveBeenCalledWith('proj-h');
    expect(updateProgress.mock.calls.map((c: unknown[]) => c[0])).toEqual([5, 10, 55]);
    expect(updateProgress).toHaveBeenNthCalledWith(1, 5, '프로젝트 생성 중...', TEST_RUN_ID);
    expect(updateProgress).toHaveBeenNthCalledWith(2, 10, 'AI 코드 생성 시작...', TEST_RUN_ID);
    expect(updateProgress).toHaveBeenNthCalledWith(3, 55, '코드 작성', TEST_RUN_ID);
    expect(deps.completeGeneration).toHaveBeenCalledWith('proj-h', 3, TEST_RUN_ID);
    expect(deps.onCompleted).toHaveBeenCalledTimes(1);

    const createBody = JSON.parse(
      (fetchFn.mock.calls[0][1] as RequestInit).body as string,
    ) as { name: string };
    expect(createBody.name).toBe('프로젝트-1700000000000');
  });

  it('SSE error 이벤트는 failGeneration으로 전파', async () => {
    const streamBody = 'event: error\ndata: {"message":"QC 실패"}\n\n';
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(makeJsonRes({ data: { id: 'proj-e' } }))
      .mockResolvedValueOnce(makeStreamRes([streamBody]));
    const deps = makeDeps({ fetchFn });

    await runClientGeneration(input, deps);

    expect(deps.failGeneration).toHaveBeenCalledWith('QC 실패', TEST_RUN_ID);
    expect(deps.onCompleted).not.toHaveBeenCalled();
  });

  it('스토어 writer 에 자신이 민팅한 runId 를 넘긴다', async () => {
    const runId = 'run-owned-by-this-call';
    const streamBody =
      'event: complete\ndata: {"projectId":"proj-rid","version":1}\n\n';
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(makeJsonRes({ data: { id: 'proj-rid' } }))
      .mockResolvedValueOnce(makeStreamRes([streamBody]));
    const startGeneration = vi.fn(() => runId);
    const updateProgress = vi.fn();
    const completeGeneration = vi.fn();
    const failGeneration = vi.fn();
    const deps = makeDeps({
      fetchFn,
      startGeneration,
      updateProgress,
      completeGeneration,
      failGeneration,
    });

    await runClientGeneration(input, deps);

    for (const call of updateProgress.mock.calls) {
      expect(call[2]).toBe(runId);
    }
    expect(completeGeneration).toHaveBeenCalledWith('proj-rid', 1, runId);
    expect(failGeneration).not.toHaveBeenCalled();
  });

  it('injectable deps 생략 시 기본 fetchFn(now/consumeStream/poll) 배선으로 동작', async () => {
    // 언바운드 fetch 대신 (input, init) => fetch(...) 래퍼가 기본값.
    // 전역 fetch만 stub 하고 fetchFn/now/pollGenerationStatusFn/consumeStream 미주입.
    const streamBody =
      'event: progress\ndata: {"progress":40,"message":"생성 중"}\n\n';
    const fetchMock = vi
      .fn()
      // 1) 프로젝트 생성
      .mockResolvedValueOnce(makeJsonRes({ data: { id: 'proj-def' } }))
      // 2) generate SSE — complete 없이 종료 → 기본 pollForCompletion 경로
      .mockResolvedValueOnce(makeStreamRes([streamBody]))
      // 3) 기본 pollGenerationStatus → 전역 fetch 로 status 조회
      .mockResolvedValueOnce(
        makeJsonRes({
          data: {
            status: 'completed',
            result: { projectId: 'proj-def', version: 7 },
          },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    // makeDeps 의 now/fetchFn 을 쓰지 않는다 — 기본 파라미터 경로 검증
    // beginSession 은 주입해 싱글톤 오염을 막는다
    const startGeneration = vi.fn(() => TEST_RUN_ID);
    const updateProgress = vi.fn();
    const completeGeneration = vi.fn();
    const failGeneration = vi.fn();
    const setGeneratingProjectId = vi.fn();
    const onCompleted = vi.fn();

    await runClientGeneration(input, {
      startGeneration,
      updateProgress,
      completeGeneration,
      failGeneration,
      setGeneratingProjectId,
      onCompleted,
      beginSession: () => new AbortController().signal,
      documentRef: {
        visibilityState: 'visible' as DocumentVisibilityState,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
    });

    // 기본 fetchFn 이 global.fetch 를 (input, init) 형태로 호출
    expect(fetchMock).toHaveBeenCalled();
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/projects');
    expect(fetchMock.mock.calls[1][0]).toBe('/api/v1/generate');

    const createBody = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string,
    ) as { name: string };
    // 기본 now = () => Date.now()
    expect(createBody.name).toMatch(/^프로젝트-\d+$/);

    // stream_ended → 기본 pollForCompletion → pollGenerationStatus(fn 기본값)
    await vi.waitFor(() => {
      expect(completeGeneration).toHaveBeenCalledWith('proj-def', 7, TEST_RUN_ID);
    });
    expect(onCompleted).toHaveBeenCalledTimes(1);
    expect(failGeneration).not.toHaveBeenCalled();
    expect(
      fetchMock.mock.calls.some(
        (c) => c[0] === '/api/v1/generate/status/proj-def',
      ),
    ).toBe(true);
  });

  it('pollGenerationStatusFn 에 세션 signal 이 주입된다', async () => {
    const streamBody =
      'event: progress\ndata: {"progress":10,"message":"x"}\n\n';
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(makeJsonRes({ data: { id: 'proj-sig' } }))
      .mockResolvedValueOnce(makeStreamRes([streamBody]));

    let capturedSignal: AbortSignal | undefined;
    const pollGenerationStatusFn = vi
      .fn()
      .mockImplementation(async (_pid: string, pollDeps: PollGenerationStatusDeps) => {
        capturedSignal = pollDeps.signal;
        // 즉시 complete — 핸드오프 경로 검증 목적
        pollDeps.completeGeneration('proj-sig', 1);
        pollDeps.onCompleted?.();
      });

    const deps = makeDeps({ fetchFn, pollGenerationStatusFn });
    await runClientGeneration(input, deps);

    expect(pollGenerationStatusFn).toHaveBeenCalledTimes(1);
    expect(capturedSignal).toBeInstanceOf(AbortSignal);
    expect(capturedSignal?.aborted).toBe(false);
  });

  /**
   * 회귀: visibility → poll 시작 → 버퍼된 SSE complete 도착 후
   * 폴링 timeout 이 failGeneration 을 덮어쓰지 않아야 한다.
   * (보고된 버그: 성공 직후 에러 화면)
   */
  it('회귀: visibility 폴링 중 SSE complete → failGeneration 미호출·complete 1회', async () => {
    const doc = makeDocument('hidden');
    const stream = makeControllableStreamRes(
      'event: progress\ndata: {"progress":20,"message":"생성 중"}\n\n',
    );

    // ⚠️ 이 순서는 **목(mock)에서만 성립한다.** 실제 ReadableStream은 cancel() 시 대기 중인
    //    read()를 {done:true}로 끝내므로, visibility가 cancel한 뒤에 버퍼된 complete를
    //    처리하는 일은 브라우저에서 일어나지 않는다(2026-08-01 런타임 프로브로 확인).
    //    따라서 이 테스트는 "레이스가 고쳐졌다"의 증거가 아니라,
    //    **"abort 후에는 terminal 콜백이 절대 나가지 않는다"는 방어적 계약의 고정**이다.
    // 첫 status fetch 는 abort 될 때까지 hang
    let pollFetchStarted = 0;
    const statusFetch = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      pollFetchStarted += 1;
      return new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        if (signal?.aborted) {
          reject(new DOMException('The operation was aborted.', 'AbortError'));
          return;
        }
        signal?.addEventListener(
          'abort',
          () => {
            reject(new DOMException('The operation was aborted.', 'AbortError'));
          },
          { once: true },
        );
      });
    });

    let pollFinished: Promise<void> | undefined;
    const pollGenerationStatusFn = vi
      .fn()
      .mockImplementation((projectId: string, pollDeps: PollGenerationStatusDeps) => {
        // 실제 pollGenerationStatus (signal 가드 포함) — fire-and-forget 관찰용
        pollFinished = pollGenerationStatus(projectId, {
          ...pollDeps,
          fetchFn: statusFetch as typeof fetch,
          delay: vi.fn().mockResolvedValue(undefined),
          maxAttempts: 5,
        });
        return pollFinished;
      });

    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(makeJsonRes({ data: { id: 'proj-race' } }))
      .mockResolvedValueOnce(stream.response);

    const completeGeneration = vi.fn();
    const failGeneration = vi.fn();
    const onCompleted = vi.fn();
    const updateProgress = vi.fn();

    const pending = runClientGeneration(input, {
      startGeneration: vi.fn(() => TEST_RUN_ID),
      updateProgress,
      completeGeneration,
      failGeneration,
      setGeneratingProjectId: vi.fn(),
      onCompleted,
      now: () => 1_700_000_000_000,
      fetchFn,
      pollGenerationStatusFn,
      beginSession: () => new AbortController().signal,
      documentRef: doc,
    });

    // SSE progress 수신 대기
    await vi.waitFor(() => {
      expect(updateProgress).toHaveBeenCalledWith(20, '생성 중', TEST_RUN_ID);
    });

    // 탭 복귀 → poll 시작 (fire-and-forget)
    doc.setVisibility('visible');

    await vi.waitFor(() => {
      expect(pollGenerationStatusFn).toHaveBeenCalledTimes(1);
      expect(pollFetchStarted).toBeGreaterThanOrEqual(1);
    });

    // 폴링이 in-flight 인 상태에서 버퍼된 SSE complete 도착
    stream.resolveSecond(
      'event: complete\ndata: {"projectId":"proj-race","version":4}\n\n',
    );

    await pending;
    // 폴링이 abort 로 조용히 끝날 때까지 대기 (timeout fail 여부 판정)
    await pollFinished;

    expect(completeGeneration).toHaveBeenCalledTimes(1);
    expect(completeGeneration).toHaveBeenCalledWith('proj-race', 4, TEST_RUN_ID);
    expect(onCompleted).toHaveBeenCalledTimes(1);
    // 핵심 회귀: 폴링이 abort 된 뒤 failGeneration 을 호출하면 안 됨
    expect(failGeneration).not.toHaveBeenCalled();
  });
});
