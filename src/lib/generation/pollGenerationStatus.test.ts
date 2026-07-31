import { describe, it, expect, vi } from 'vitest';
import { pollGenerationStatus } from './pollGenerationStatus';

/** res.ok / res.json()만 사용하므로 최소 stub. */
function makeRes(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as unknown as Response;
}

/** 공통 deps — delay는 즉시 resolve로 주입하여 실제 대기 없이 결정적으로 검증. */
function makeDeps(overrides: Partial<Parameters<typeof pollGenerationStatus>[1]> = {}) {
  return {
    updateProgress: vi.fn(),
    completeGeneration: vi.fn(),
    failGeneration: vi.fn(),
    onCompleted: vi.fn(),
    delay: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('pollGenerationStatus', () => {
  it('completed + result면 completeGeneration·onCompleted 호출 후 즉시 종료', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(
        makeRes({ data: { status: 'completed', result: { projectId: 'p9', version: 3 } } }),
      );
    const deps = makeDeps({ fetchFn });

    await pollGenerationStatus('p9', deps);

    expect(deps.completeGeneration).toHaveBeenCalledTimes(1);
    expect(deps.completeGeneration).toHaveBeenCalledWith('p9', 3);
    expect(deps.onCompleted).toHaveBeenCalledTimes(1);
    expect(deps.failGeneration).not.toHaveBeenCalled();
    expect(fetchFn).toHaveBeenCalledTimes(1);
    // E3 P3: fetch 에 항상 { signal } RequestInit 전달 (signal 미주입 시 undefined)
    expect(fetchFn).toHaveBeenCalledWith('/api/v1/generate/status/p9', {
      signal: undefined,
    });
    expect(deps.delay).not.toHaveBeenCalled();
  });

  it('completeGeneration 직후 onCompleted가 호출된다 (순서 보존)', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(
        makeRes({ data: { status: 'completed', result: { projectId: 'p', version: 1 } } }),
      );
    // .mock 접근을 위해 mock을 직접 보유 (makeDeps spread는 타입을 union으로 넓힘).
    const completeGeneration = vi.fn();
    const onCompleted = vi.fn();

    await pollGenerationStatus('p', {
      updateProgress: vi.fn(),
      completeGeneration,
      failGeneration: vi.fn(),
      onCompleted,
      delay: vi.fn().mockResolvedValue(undefined),
      fetchFn,
    });

    expect(completeGeneration.mock.invocationCallOrder[0]).toBeLessThan(
      onCompleted.mock.invocationCallOrder[0],
    );
  });

  it('generating이면 진행률을 갱신하고 다음 시도에서 completed 처리', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(makeRes({ data: { status: 'generating', progress: 40, message: '중간' } }))
      .mockResolvedValueOnce(
        makeRes({ data: { status: 'completed', result: { projectId: 'p', version: 2 } } }),
      );
    const deps = makeDeps({ fetchFn });

    await pollGenerationStatus('p', deps);

    expect(deps.updateProgress).toHaveBeenCalledTimes(1);
    expect(deps.updateProgress).toHaveBeenCalledWith(40, '중간');
    expect(deps.completeGeneration).toHaveBeenCalledWith('p', 2);
    expect(deps.delay).toHaveBeenCalledTimes(1);
    expect(deps.delay).toHaveBeenCalledWith(1000);
  });

  it('generating의 progress/message 누락 시 0·기본 문구로 폴백', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(makeRes({ data: { status: 'generating' } }))
      .mockResolvedValueOnce(
        makeRes({ data: { status: 'completed', result: { projectId: 'p', version: 1 } } }),
      );
    const deps = makeDeps({ fetchFn });

    await pollGenerationStatus('p', deps);

    expect(deps.updateProgress).toHaveBeenCalledWith(0, '생성 중...');
  });

  it("status: 'unknown'이면 즉시 failGeneration('연결이 복구...')", async () => {
    const fetchFn = vi.fn().mockResolvedValue(makeRes({ data: { status: 'unknown' } }));
    const deps = makeDeps({ fetchFn });

    await pollGenerationStatus('p', deps);

    expect(deps.failGeneration).toHaveBeenCalledTimes(1);
    expect(deps.failGeneration).toHaveBeenCalledWith(
      '연결이 복구되지 않았습니다. 대시보드에서 결과를 확인해주세요.',
    );
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(deps.completeGeneration).not.toHaveBeenCalled();
  });

  it("status: 'not_found'이면 프로젝트 미존재 메시지로 실패한다", async () => {
    const fetchFn = vi.fn().mockResolvedValue(makeRes({ data: { status: 'not_found' } }));
    const deps = makeDeps({ fetchFn });

    await pollGenerationStatus('p', deps);

    expect(deps.failGeneration).toHaveBeenCalledTimes(1);
    expect(deps.failGeneration).toHaveBeenCalledWith(
      '프로젝트를 찾을 수 없습니다. 대시보드에서 확인해주세요.',
    );
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(deps.completeGeneration).not.toHaveBeenCalled();
  });

  it("completed인데 result가 없으면 'unknown'과 동일 처리 (동작 보존)", async () => {
    const fetchFn = vi.fn().mockResolvedValue(makeRes({ data: { status: 'completed' } }));
    const deps = makeDeps({ fetchFn });

    await pollGenerationStatus('p', deps);

    expect(deps.failGeneration).toHaveBeenCalledTimes(1);
    expect(deps.failGeneration).toHaveBeenCalledWith(
      '연결이 복구되지 않았습니다. 대시보드에서 결과를 확인해주세요.',
    );
    expect(deps.completeGeneration).not.toHaveBeenCalled();
  });

  it("응답이 !res.ok면 break하여 '시간 초과' 경로로 떨어진다 (동작 보존)", async () => {
    const fetchFn = vi.fn().mockResolvedValue(makeRes({}, false));
    const deps = makeDeps({ fetchFn });

    await pollGenerationStatus('p', deps);

    expect(deps.failGeneration).toHaveBeenCalledTimes(1);
    expect(deps.failGeneration).toHaveBeenCalledWith(
      '생성 시간이 초과되었습니다. 대시보드에서 확인해주세요.',
    );
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(deps.delay).not.toHaveBeenCalled();
  });

  it("status: 'failed'는 터미널 상태로 즉시 실패한다 (재시도하지 않음)", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(makeRes({ data: { status: 'failed', error: '생성 실패함' } }));
    const deps = makeDeps({ fetchFn, maxAttempts: 3 });

    await pollGenerationStatus('p', deps);

    // 서버가 보고한 failed는 즉시 종료 — 무의미한 재시도(최대 2분) 없음
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(deps.delay).not.toHaveBeenCalled();
    expect(deps.failGeneration).toHaveBeenCalledTimes(1);
    expect(deps.failGeneration).toHaveBeenCalledWith('생성 실패함');
  });

  it('fetch가 throw하면 마지막 시도에서 에러 메시지로 실패', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('네트워크 끊김'));
    const deps = makeDeps({ fetchFn, maxAttempts: 2 });

    await pollGenerationStatus('p', deps);

    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(deps.delay).toHaveBeenCalledTimes(1);
    expect(deps.failGeneration).toHaveBeenCalledTimes(1);
    expect(deps.failGeneration).toHaveBeenCalledWith('네트워크 끊김');
  });

  it('계속 generating이면 maxAttempts 소진 후 시간 초과로 실패', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(makeRes({ data: { status: 'generating', progress: 10 } }));
    const deps = makeDeps({ fetchFn, maxAttempts: 3 });

    await pollGenerationStatus('p', deps);

    expect(deps.updateProgress).toHaveBeenCalledTimes(3);
    expect(deps.delay).toHaveBeenCalledTimes(3);
    expect(deps.failGeneration).toHaveBeenCalledTimes(1);
    expect(deps.failGeneration).toHaveBeenCalledWith(
      '생성 시간이 초과되었습니다. 대시보드에서 확인해주세요.',
    );
  });

  it('maxAttempts 소진(미 abort) 시 timeout failGeneration 회귀 가드', async () => {
    // E3 P3: abort 가드가 정상 timeout 경로를 깨뜨리지 않는지 고정
    const fetchFn = vi
      .fn()
      .mockResolvedValue(makeRes({ data: { status: 'generating', progress: 1 } }));
    const controller = new AbortController();
    const deps = makeDeps({ fetchFn, maxAttempts: 2, signal: controller.signal });

    await pollGenerationStatus('p', deps);

    expect(controller.signal.aborted).toBe(false);
    expect(deps.failGeneration).toHaveBeenCalledTimes(1);
    expect(deps.failGeneration).toHaveBeenCalledWith(
      '생성 시간이 초과되었습니다. 대시보드에서 확인해주세요.',
    );
  });

  it('intervalMs를 주입하면 그 값으로 대기한다', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(makeRes({ data: { status: 'generating', progress: 1 } }))
      .mockResolvedValueOnce(
        makeRes({ data: { status: 'completed', result: { projectId: 'p', version: 1 } } }),
      );
    const deps = makeDeps({ fetchFn, intervalMs: 250 });

    await pollGenerationStatus('p', deps);

    expect(deps.delay).toHaveBeenCalledWith(250);
  });

  it('기본 delay(setTimeout) 경로도 fake timers로 제어된다', async () => {
    vi.useFakeTimers();
    try {
      const fetchFn = vi
        .fn()
        .mockResolvedValueOnce(makeRes({ data: { status: 'generating', progress: 50, message: '중간' } }))
        .mockResolvedValueOnce(
          makeRes({ data: { status: 'completed', result: { projectId: 'p', version: 2 } } }),
        );
      const updateProgress = vi.fn();
      const completeGeneration = vi.fn();
      const failGeneration = vi.fn();

      // delay 미주입 → 모듈 기본 setTimeout(1000) 사용
      const promise = pollGenerationStatus('p', {
        updateProgress,
        completeGeneration,
        failGeneration,
        fetchFn,
      });
      await vi.runAllTimersAsync();
      await promise;

      expect(updateProgress).toHaveBeenCalledWith(50, '중간');
      expect(completeGeneration).toHaveBeenCalledWith('p', 2);
      expect(failGeneration).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  describe('AbortSignal (E3 P3 — 단일 terminal owner)', () => {
    it('첫 시도 전 abort → fetch·콜백 전부 미호출', async () => {
      const controller = new AbortController();
      controller.abort();
      const fetchFn = vi.fn();
      const deps = makeDeps({ fetchFn, signal: controller.signal });

      await pollGenerationStatus('p', deps);

      expect(fetchFn).not.toHaveBeenCalled();
      expect(deps.updateProgress).not.toHaveBeenCalled();
      expect(deps.completeGeneration).not.toHaveBeenCalled();
      expect(deps.failGeneration).not.toHaveBeenCalled();
      expect(deps.onCompleted).not.toHaveBeenCalled();
    });

    it('시도 사이 abort → failGeneration 없이 종료', async () => {
      const controller = new AbortController();
      const fetchFn = vi
        .fn()
        .mockResolvedValue(makeRes({ data: { status: 'generating', progress: 20 } }));
      const delay = vi.fn().mockImplementation(async () => {
        // 첫 delay 중에 abort — 다음 attempt 진입 시 중단
        controller.abort();
      });
      const deps = makeDeps({
        fetchFn,
        delay,
        maxAttempts: 5,
        signal: controller.signal,
      });

      await pollGenerationStatus('p', deps);

      expect(fetchFn).toHaveBeenCalledTimes(1);
      expect(deps.updateProgress).toHaveBeenCalledTimes(1);
      expect(deps.failGeneration).not.toHaveBeenCalled();
      expect(deps.completeGeneration).not.toHaveBeenCalled();
    });

    it('fetch 가 AbortError + signal.aborted → failGeneration 미호출', async () => {
      const controller = new AbortController();
      const abortErr = new DOMException('The operation was aborted.', 'AbortError');
      const fetchFn = vi.fn().mockImplementation(async () => {
        controller.abort();
        throw abortErr;
      });
      const deps = makeDeps({
        fetchFn,
        maxAttempts: 3,
        signal: controller.signal,
      });

      await pollGenerationStatus('p', deps);

      expect(fetchFn).toHaveBeenCalledTimes(1);
      expect(deps.failGeneration).not.toHaveBeenCalled();
      expect(deps.completeGeneration).not.toHaveBeenCalled();
      expect(deps.updateProgress).not.toHaveBeenCalled();
    });

    it('signal 주입 시 fetch 에 동일 AbortSignal 전달', async () => {
      const controller = new AbortController();
      const fetchFn = vi
        .fn()
        .mockResolvedValue(
          makeRes({ data: { status: 'completed', result: { projectId: 'p', version: 1 } } }),
        );
      const deps = makeDeps({ fetchFn, signal: controller.signal });

      await pollGenerationStatus('p', deps);

      expect(fetchFn).toHaveBeenCalledWith('/api/v1/generate/status/p', {
        signal: controller.signal,
      });
    });

    it('fetch resolve 직후 abort → handleStatusData 전 종료, 콜백 없음', async () => {
      const controller = new AbortController();
      const fetchFn = vi.fn().mockImplementation(async () => {
        controller.abort();
        return makeRes({
          data: { status: 'completed', result: { projectId: 'p', version: 9 } },
        });
      });
      const deps = makeDeps({ fetchFn, signal: controller.signal });

      await pollGenerationStatus('p', deps);

      expect(deps.completeGeneration).not.toHaveBeenCalled();
      expect(deps.failGeneration).not.toHaveBeenCalled();
      expect(deps.updateProgress).not.toHaveBeenCalled();
    });

    it('json 파싱 중 abort → terminal 콜백 없음', async () => {
      const controller = new AbortController();
      const fetchFn = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => {
          controller.abort();
          return {
            data: { status: 'completed', result: { projectId: 'p', version: 1 } },
          };
        },
      } as unknown as Response);
      const deps = makeDeps({ fetchFn, signal: controller.signal });

      await pollGenerationStatus('p', deps);

      expect(deps.completeGeneration).not.toHaveBeenCalled();
      expect(deps.failGeneration).not.toHaveBeenCalled();
    });

    it('마지막 delay 중 abort → 루프 종료 후 timeout fail 스킵', async () => {
      const controller = new AbortController();
      let delayCount = 0;
      const fetchFn = vi
        .fn()
        .mockResolvedValue(makeRes({ data: { status: 'generating', progress: 1 } }));
      const delay = vi.fn().mockImplementation(async () => {
        delayCount += 1;
        // 마지막 attempt 의 delay 에서 abort → for 종료 후 signal 가드
        if (delayCount >= 2) controller.abort();
      });
      const deps = makeDeps({
        fetchFn,
        delay,
        maxAttempts: 2,
        signal: controller.signal,
      });

      await pollGenerationStatus('p', deps);

      expect(deps.updateProgress).toHaveBeenCalledTimes(2);
      expect(deps.failGeneration).not.toHaveBeenCalled();
    });
  });
});
