import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runClientGeneration } from './runClientGeneration';

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

function makeDeps(overrides: Partial<Parameters<typeof runClientGeneration>[1]> = {}) {
  return {
    startGeneration: vi.fn(),
    updateProgress: vi.fn(),
    completeGeneration: vi.fn(),
    failGeneration: vi.fn(),
    setGeneratingProjectId: vi.fn(),
    onCompleted: vi.fn(),
    now: () => 1_700_000_000_000,
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
  });

  it('create 실패 → failGeneration, generate 미호출', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      makeJsonRes({ error: { message: '생성 한도 초과' } }, false),
    );
    const deps = makeDeps({ fetchFn });

    await runClientGeneration(input, deps);

    expect(deps.startGeneration).toHaveBeenCalledTimes(1);
    expect(deps.updateProgress).toHaveBeenCalledWith(5, '프로젝트 생성 중...');
    expect(deps.failGeneration).toHaveBeenCalledWith('생성 한도 초과');
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
    expect(deps.updateProgress).toHaveBeenCalledWith(10, 'AI 코드 생성 시작...');
    expect(deps.failGeneration).toHaveBeenCalledWith('생성 거부');
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

    expect(deps.failGeneration).toHaveBeenCalledWith('스트림을 읽을 수 없습니다.');
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
    expect(updateProgress).toHaveBeenNthCalledWith(1, 5, '프로젝트 생성 중...');
    expect(updateProgress).toHaveBeenNthCalledWith(2, 10, 'AI 코드 생성 시작...');
    expect(updateProgress).toHaveBeenNthCalledWith(3, 55, '코드 작성');
    expect(deps.completeGeneration).toHaveBeenCalledWith('proj-h', 3);
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

    expect(deps.failGeneration).toHaveBeenCalledWith('QC 실패');
    expect(deps.onCompleted).not.toHaveBeenCalled();
  });

  it('injectable deps 생략 시 기본 fetchFn(now/consumeStream/poll) 배선으로 동작', async () => {
    // characterization: 언바운드 fetch 대신 (input, init) => fetch(...) 래퍼가 기본값.
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
    const startGeneration = vi.fn();
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
      expect(completeGeneration).toHaveBeenCalledWith('proj-def', 7);
    });
    expect(onCompleted).toHaveBeenCalledTimes(1);
    expect(failGeneration).not.toHaveBeenCalled();
    expect(
      fetchMock.mock.calls.some(
        (c) => c[0] === '/api/v1/generate/status/proj-def',
      ),
    ).toBe(true);
  });
});
