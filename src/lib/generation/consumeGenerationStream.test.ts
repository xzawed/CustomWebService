import { describe, it, expect, vi, beforeEach } from 'vitest';
import { consumeGenerationStream } from './consumeGenerationStream';

function encode(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

/** 순차 청크를 내는 fake reader. rejectIndex 가 있으면 해당 read 에서 reject. */
function makeReader(
  chunks: Array<Uint8Array | null>,
  options?: { rejectAt?: number; rejectError?: Error },
): ReadableStreamDefaultReader<Uint8Array> & {
  cancel: ReturnType<typeof vi.fn>;
} {
  let i = 0;
  const cancel = vi.fn().mockResolvedValue(undefined);
  return {
    read: vi.fn(async () => {
      if (options?.rejectAt !== undefined && i === options.rejectAt) {
        i += 1;
        throw options.rejectError ?? new Error('network drop');
      }
      if (i >= chunks.length) {
        return { value: undefined, done: true };
      }
      const value = chunks[i];
      i += 1;
      if (value === null) {
        return { value: undefined, done: true };
      }
      return { value, done: false };
    }),
    cancel,
    releaseLock: vi.fn(),
    closed: Promise.resolve(undefined),
  } as unknown as ReadableStreamDefaultReader<Uint8Array> & {
    cancel: ReturnType<typeof vi.fn>;
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

function makeDeps(overrides: Partial<Parameters<typeof consumeGenerationStream>[2]> = {}) {
  return {
    updateProgress: vi.fn(),
    completeGeneration: vi.fn(),
    onCompleted: vi.fn(),
    pollForCompletion: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('consumeGenerationStream', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('progress 후 complete → completed, poll 미호출', async () => {
    const body =
      'event: progress\ndata: {"progress":30,"message":"작업 중"}\n\n' +
      'event: complete\ndata: {"projectId":"p1","version":2}\n\n';
    const reader = makeReader([encode(body), null]);
    const doc = makeDocument();
    const deps = makeDeps({ documentRef: doc });

    const result = await consumeGenerationStream(reader, 'p1', deps);

    expect(result).toEqual({ kind: 'completed' });
    expect(deps.updateProgress).toHaveBeenCalledWith(30, '작업 중');
    expect(deps.completeGeneration).toHaveBeenCalledWith('p1', 2);
    expect(deps.onCompleted).toHaveBeenCalledTimes(1);
    expect(deps.pollForCompletion).not.toHaveBeenCalled();
    expect(doc.removeEventListener).toHaveBeenCalled();
    expect(reader.cancel).toHaveBeenCalled();
  });

  it('event: error → 서버 메시지로 throw, poll 미호출', async () => {
    const body = 'event: error\ndata: {"message":"서버 생성 실패"}\n\n';
    const reader = makeReader([encode(body), null]);
    const deps = makeDeps({ documentRef: makeDocument() });

    await expect(consumeGenerationStream(reader, 'p1', deps)).rejects.toThrow(
      '서버 생성 실패',
    );
    expect(deps.pollForCompletion).not.toHaveBeenCalled();
    expect(deps.completeGeneration).not.toHaveBeenCalled();
    expect(reader.cancel).toHaveBeenCalled();
  });

  it('complete 없이 스트림 종료 → poll 정확히 1회', async () => {
    // characterization: 현 동작 고정 (P3에서 변경 예정) — void fire-and-forget poll
    const body = 'event: progress\ndata: {"progress":50,"message":"중"}\n\n';
    const reader = makeReader([encode(body), null]);
    const deps = makeDeps({ documentRef: makeDocument() });

    const result = await consumeGenerationStream(reader, 'p9', deps);

    expect(result).toEqual({ kind: 'switched_to_polling', reason: 'stream_ended' });
    expect(deps.pollForCompletion).toHaveBeenCalledTimes(1);
    expect(deps.pollForCompletion).toHaveBeenCalledWith('p9');
    expect(deps.completeGeneration).not.toHaveBeenCalled();
  });

  it('reader.read() reject + SSE error 아님 → poll 1회, 이 레이어는 fail 없음', async () => {
    // characterization: 현 동작 고정 (P3에서 변경 예정)
    const reader = makeReader([], { rejectAt: 0, rejectError: new Error('aborted') });
    const deps = makeDeps({ documentRef: makeDocument() });

    const result = await consumeGenerationStream(reader, 'p2', deps);

    expect(result).toEqual({ kind: 'switched_to_polling', reason: 'stream_error' });
    expect(deps.pollForCompletion).toHaveBeenCalledTimes(1);
    expect(deps.completeGeneration).not.toHaveBeenCalled();
  });

  it('visibilitychange → visible mid-stream → reader cancel + poll 1회', async () => {
    // characterization: 현 동작 고정 (P3에서 변경 예정) — poll abort 없음
    const doc = makeDocument('hidden');
    let resolveRead: ((v: { value?: Uint8Array; done: boolean }) => void) | undefined;
    const cancel = vi.fn().mockResolvedValue(undefined);
    let readCount = 0;
    const reader = {
      read: vi.fn(
        () =>
          new Promise<{ value?: Uint8Array; done: boolean }>((resolve) => {
            readCount += 1;
            if (readCount === 1) {
              // first chunk: progress, keep stream open
              resolve({
                value: encode('event: progress\ndata: {"progress":10,"message":"go"}\n\n'),
                done: false,
              });
            } else {
              // hang until cancel / visibility
              resolveRead = resolve;
            }
          }),
      ),
      cancel,
      releaseLock: vi.fn(),
      closed: Promise.resolve(undefined),
    } as unknown as ReadableStreamDefaultReader<Uint8Array> & {
      cancel: ReturnType<typeof vi.fn>;
    };

    const deps = makeDeps({ documentRef: doc });
    const pending = consumeGenerationStream(reader, 'p3', deps);

    // allow first read + progress handling
    await vi.waitFor(() => {
      expect(deps.updateProgress).toHaveBeenCalledWith(10, 'go');
    });

    doc.setVisibility('visible');

    // cancel may cause second read to settle as error or done — either is fine for switched path
    resolveRead?.({ done: true });

    const result = await pending;

    expect(deps.pollForCompletion).toHaveBeenCalledTimes(1);
    expect(deps.pollForCompletion).toHaveBeenCalledWith('p3');
    expect(cancel).toHaveBeenCalled();
    expect(result.kind).toBe('switched_to_polling');
  });

  it('complete 이후 visibilitychange → poll 미호출', async () => {
    const body = 'event: complete\ndata: {"projectId":"p4","version":1}\n\n';
    const reader = makeReader([encode(body), null]);
    const doc = makeDocument('hidden');
    const deps = makeDeps({ documentRef: doc });

    await consumeGenerationStream(reader, 'p4', deps);

    // listener already removed in finally — firing visibility should not poll
    doc.setVisibility('visible');
    expect(deps.pollForCompletion).not.toHaveBeenCalled();
  });

  it('이미 switched 후 visibilitychange → poll 두 번째 없음', async () => {
    // characterization: 현 동작 고정 (P3에서 변경 예정)
    const doc = makeDocument('hidden');
    let secondResolve: ((v: { value?: Uint8Array; done: boolean }) => void) | undefined;
    const cancel = vi.fn().mockResolvedValue(undefined);
    let n = 0;
    const reader = {
      read: vi.fn(
        () =>
          new Promise<{ value?: Uint8Array; done: boolean }>((resolve) => {
            n += 1;
            if (n === 1) {
              resolve({
                value: encode('event: progress\ndata: {"progress":1,"message":"x"}\n\n'),
                done: false,
              });
            } else {
              secondResolve = resolve;
            }
          }),
      ),
      cancel,
      releaseLock: vi.fn(),
      closed: Promise.resolve(undefined),
    } as unknown as ReadableStreamDefaultReader<Uint8Array>;

    const deps = makeDeps({ documentRef: doc });
    const pending = consumeGenerationStream(reader, 'p5', deps);

    await vi.waitFor(() => {
      expect(deps.updateProgress).toHaveBeenCalled();
    });

    doc.setVisibility('visible');
    expect(deps.pollForCompletion).toHaveBeenCalledTimes(1);

    // second visibility while still mid-stream (switched already)
    doc.setVisibility('hidden');
    doc.setVisibility('visible');
    expect(deps.pollForCompletion).toHaveBeenCalledTimes(1);

    secondResolve?.({ done: true });
    await pending;
    expect(deps.pollForCompletion).toHaveBeenCalledTimes(1);
  });
});
