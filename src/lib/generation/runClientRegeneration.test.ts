import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { __resetRegenerationSessionForTests } from './regenerationSession';
import { runClientRegeneration } from './runClientRegeneration';
import { pollGenerationStatus } from './pollGenerationStatus';
import type { PollGenerationStatusDeps } from './pollGenerationStatus';

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

function makeDeps(
  overrides: Partial<Parameters<typeof runClientRegeneration>[1]> = {},
) {
  return {
    updateProgress: vi.fn(),
    completeRegeneration: vi.fn(),
    failRegeneration: vi.fn(),
    onCompleted: vi.fn(),
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
  projectId: 'proj-r1',
  feedback: '차트를 막대 그래프로 바꿔주세요',
};

describe('runClientRegeneration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    __resetRegenerationSessionForTests();
  });

  it('regenerate 실패 → failRegeneration, stream 미시작', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      makeJsonRes({ error: { message: '재생성 한도 초과' } }, false),
    );
    const deps = makeDeps({ fetchFn });

    await runClientRegeneration(input, deps);

    expect(deps.failRegeneration).toHaveBeenCalledWith('재생성 한도 초과');
    expect(deps.completeRegeneration).not.toHaveBeenCalled();
    expect(deps.onCompleted).not.toHaveBeenCalled();
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn.mock.calls[0][0]).toBe('/api/v1/generate/regenerate');
    const body = JSON.parse(
      (fetchFn.mock.calls[0][1] as RequestInit).body as string,
    ) as { projectId: string; feedback: string };
    expect(body).toEqual({
      projectId: 'proj-r1',
      feedback: '차트를 막대 그래프로 바꿔주세요',
    });
  });

  it('SSE progress → complete → completeRegeneration 1회, poll 미시작', async () => {
    const streamBody =
      'event: progress\ndata: {"progress":40,"message":"수정 중"}\n\n' +
      'event: complete\ndata: {"projectId":"proj-r1","version":5}\n\n';
    const pollGenerationStatusFn = vi.fn();
    const fetchFn = vi.fn().mockResolvedValue(makeStreamRes([streamBody]));
    const updateProgress = vi.fn();
    const deps = makeDeps({ fetchFn, updateProgress, pollGenerationStatusFn });

    await runClientRegeneration(input, deps);

    expect(deps.failRegeneration).not.toHaveBeenCalled();
    expect(updateProgress).toHaveBeenCalledWith(40, '수정 중');
    expect(deps.completeRegeneration).toHaveBeenCalledTimes(1);
    expect(deps.completeRegeneration).toHaveBeenCalledWith(5);
    expect(deps.onCompleted).toHaveBeenCalledTimes(1);
    expect(pollGenerationStatusFn).not.toHaveBeenCalled();
  });

  it('SSE error → failRegeneration with server message', async () => {
    const streamBody = 'event: error\ndata: {"message":"QC 실패"}\n\n';
    const fetchFn = vi.fn().mockResolvedValue(makeStreamRes([streamBody]));
    const deps = makeDeps({ fetchFn });

    await runClientRegeneration(input, deps);

    expect(deps.failRegeneration).toHaveBeenCalledWith('QC 실패');
    expect(deps.completeRegeneration).not.toHaveBeenCalled();
    expect(deps.onCompleted).not.toHaveBeenCalled();
  });

  it('stream ends without complete → poll started exactly once', async () => {
    const streamBody =
      'event: progress\ndata: {"progress":10,"message":"재생성 중"}\n\n';
    const fetchFn = vi.fn().mockResolvedValue(makeStreamRes([streamBody]));
    const pollGenerationStatusFn = vi
      .fn()
      .mockImplementation(async (_pid: string, pollDeps: PollGenerationStatusDeps) => {
        pollDeps.completeGeneration('proj-r1', 2);
        pollDeps.onCompleted?.();
      });
    const deps = makeDeps({ fetchFn, pollGenerationStatusFn });

    await runClientRegeneration(input, deps);

    expect(pollGenerationStatusFn).toHaveBeenCalledTimes(1);
    expect(pollGenerationStatusFn.mock.calls[0][0]).toBe('proj-r1');
    expect(deps.completeRegeneration).toHaveBeenCalledWith(2);
    expect(deps.onCompleted).toHaveBeenCalledTimes(1);
  });

  it('abort → no terminal callback fires afterwards', async () => {
    const session = new AbortController();
    let capturedSignal: AbortSignal | undefined;

    const streamBody =
      'event: progress\ndata: {"progress":15,"message":"x"}\n\n';
    const fetchFn = vi.fn().mockResolvedValue(makeStreamRes([streamBody]));

    const pollGenerationStatusFn = vi
      .fn()
      .mockImplementation(async (_pid: string, pollDeps: PollGenerationStatusDeps) => {
        capturedSignal = pollDeps.signal;
        // 폴링 시작 직후 세션 abort — terminal 콜백 금지
        session.abort();
        // 실제 poll 구현으로 abort 계약을 고정
        await pollGenerationStatus(_pid, {
          ...pollDeps,
          fetchFn: vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
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
          }) as typeof fetch,
          delay: vi.fn().mockResolvedValue(undefined),
          maxAttempts: 5,
        });
      });

    const deps = makeDeps({
      fetchFn,
      pollGenerationStatusFn,
      beginSession: () => session.signal,
    });

    await runClientRegeneration(input, deps);
    // poll fire-and-forget 이 끝날 여유
    await vi.waitFor(() => {
      expect(capturedSignal?.aborted).toBe(true);
    });

    expect(deps.completeRegeneration).not.toHaveBeenCalled();
    expect(deps.failRegeneration).not.toHaveBeenCalled();
    expect(deps.onCompleted).not.toHaveBeenCalled();
  });

  it("polling not_found → dedicated message (not generic '연결이 복구되지 않았습니다')", async () => {
    const streamBody =
      'event: progress\ndata: {"progress":5,"message":"start"}\n\n';
    const fetchFn = vi.fn().mockResolvedValue(makeStreamRes([streamBody]));

    const pollGenerationStatusFn = vi
      .fn()
      .mockImplementation(async (projectId: string, pollDeps: PollGenerationStatusDeps) => {
        await pollGenerationStatus(projectId, {
          ...pollDeps,
          fetchFn: vi.fn().mockResolvedValue(
            makeJsonRes({ data: { status: 'not_found' } }),
          ) as typeof fetch,
          delay: vi.fn().mockResolvedValue(undefined),
          maxAttempts: 3,
        });
      });

    const deps = makeDeps({ fetchFn, pollGenerationStatusFn });
    await runClientRegeneration(input, deps);

    expect(deps.failRegeneration).toHaveBeenCalledWith(
      '프로젝트를 찾을 수 없습니다. 대시보드에서 확인해주세요.',
    );
    expect(deps.failRegeneration).not.toHaveBeenCalledWith(
      expect.stringContaining('연결이 복구되지 않았습니다'),
    );
    expect(deps.completeRegeneration).not.toHaveBeenCalled();
  });

  it('pollGenerationStatusFn 에 세션 signal 이 주입된다', async () => {
    const streamBody =
      'event: progress\ndata: {"progress":10,"message":"x"}\n\n';
    const fetchFn = vi.fn().mockResolvedValue(makeStreamRes([streamBody]));

    let capturedSignal: AbortSignal | undefined;
    const pollGenerationStatusFn = vi
      .fn()
      .mockImplementation(async (_pid: string, pollDeps: PollGenerationStatusDeps) => {
        capturedSignal = pollDeps.signal;
        pollDeps.completeGeneration('proj-r1', 1);
        pollDeps.onCompleted?.();
      });

    const deps = makeDeps({ fetchFn, pollGenerationStatusFn });
    await runClientRegeneration(input, deps);

    expect(pollGenerationStatusFn).toHaveBeenCalledTimes(1);
    expect(capturedSignal).toBeInstanceOf(AbortSignal);
    expect(capturedSignal?.aborted).toBe(false);
  });

  it('no body stream → failRegeneration with stream message', async () => {
    const fetchFn = vi.fn().mockResolvedValue(makeJsonRes({}, true));
    const deps = makeDeps({ fetchFn });

    await runClientRegeneration(input, deps);

    expect(deps.failRegeneration).toHaveBeenCalledWith(
      '스트림을 읽을 수 없습니다.',
    );
  });

  it('시작 시 이미 abort된 세션이면 폴링 signal 이 처음부터 aborted', async () => {
    const alreadyAborted = new AbortController();
    alreadyAborted.abort();

    const streamBody =
      'event: progress\ndata: {"progress":10,"message":"x"}\n\n';
    const fetchFn = vi.fn().mockResolvedValue(makeStreamRes([streamBody]));

    let capturedSignal: AbortSignal | undefined;
    const pollGenerationStatusFn = vi
      .fn()
      .mockImplementation(async (_pid: string, pollDeps: PollGenerationStatusDeps) => {
        capturedSignal = pollDeps.signal;
      });

    const deps = makeDeps({
      fetchFn,
      pollGenerationStatusFn,
      beginSession: () => alreadyAborted.signal,
    });
    await runClientRegeneration(input, deps);

    expect(capturedSignal?.aborted).toBe(true);
  });

  it('fetch AbortError 는 failRegeneration 을 호출하지 않는다', async () => {
    const abortErr = new DOMException('The operation was aborted.', 'AbortError');
    const fetchFn = vi.fn().mockRejectedValue(abortErr);
    const deps = makeDeps({ fetchFn });

    await runClientRegeneration(input, deps);

    expect(deps.failRegeneration).not.toHaveBeenCalled();
    expect(deps.completeRegeneration).not.toHaveBeenCalled();
  });

  it('기본 fail 메시지 폴백 (error.message 없는 non-ok)', async () => {
    const fetchFn = vi.fn().mockResolvedValue(makeJsonRes({}, false));
    const deps = makeDeps({ fetchFn });

    await runClientRegeneration(input, deps);

    expect(deps.failRegeneration).toHaveBeenCalledWith('재생성에 실패했습니다.');
  });

  it('non-ok 응답의 json 파싱 실패 시 기본 재생성 실패 메시지', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => {
        throw new Error('invalid json');
      },
      body: null,
    } as unknown as Response);
    const deps = makeDeps({ fetchFn });

    await runClientRegeneration(input, deps);

    expect(deps.failRegeneration).toHaveBeenCalledWith('재생성에 실패했습니다.');
  });

  it('Error 형태의 AbortError 도 fail 콜백을 올리지 않는다', async () => {
    const err = new Error('aborted');
    err.name = 'AbortError';
    const fetchFn = vi.fn().mockRejectedValue(err);
    const deps = makeDeps({ fetchFn });

    await runClientRegeneration(input, deps);

    expect(deps.failRegeneration).not.toHaveBeenCalled();
  });

  it('non-Error throw → 알 수 없는 오류', async () => {
    const fetchFn = vi.fn().mockRejectedValue('boom');
    const deps = makeDeps({ fetchFn });

    await runClientRegeneration(input, deps);

    expect(deps.failRegeneration).toHaveBeenCalledWith('알 수 없는 오류');
  });

  it('injectable deps 생략 시 기본 fetchFn 배선으로 동작', async () => {
    const streamBody =
      'event: complete\ndata: {"projectId":"proj-r1","version":9}\n\n';
    const fetchMock = vi.fn().mockResolvedValue(makeStreamRes([streamBody]));
    vi.stubGlobal('fetch', fetchMock);

    const updateProgress = vi.fn();
    const completeRegeneration = vi.fn();
    const failRegeneration = vi.fn();
    const onCompleted = vi.fn();

    await runClientRegeneration(input, {
      updateProgress,
      completeRegeneration,
      failRegeneration,
      onCompleted,
      beginSession: () => new AbortController().signal,
      documentRef: {
        visibilityState: 'visible' as DocumentVisibilityState,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/generate/regenerate',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(completeRegeneration).toHaveBeenCalledWith(9);
    expect(failRegeneration).not.toHaveBeenCalled();
  });
});
