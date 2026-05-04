import { describe, it, expect, vi } from 'vitest';
import { createSseWriter } from './sseWriter';

function makeController() {
  return {
    enqueue: vi.fn(),
    close: vi.fn(),
    error: vi.fn(),
  } as unknown as ReadableStreamDefaultController;
}

describe('createSseWriter', () => {
  it('send()가 SSE 형식으로 인코딩된 데이터를 enqueue한다', () => {
    const controller = makeController();
    const { writer } = createSseWriter(controller);
    writer.send('progress', { step: 'test', value: 42 });
    expect(controller.enqueue).toHaveBeenCalledTimes(1);
    const encoded = (controller.enqueue as ReturnType<typeof vi.fn>).mock.calls[0][0] as Uint8Array;
    const text = new TextDecoder().decode(encoded);
    expect(text).toContain('event: progress');
    expect(text).toContain('"step":"test"');
  });

  it('isCancelled()는 초기에 false를 반환한다', () => {
    const controller = makeController();
    const { writer } = createSseWriter(controller);
    expect(writer.isCancelled()).toBe(false);
  });

  it('markCancelled() 호출 후 isCancelled()는 true를 반환한다', () => {
    const controller = makeController();
    const { writer, markCancelled } = createSseWriter(controller);
    markCancelled();
    expect(writer.isCancelled()).toBe(true);
  });

  it('markCancelled() 후 send()는 enqueue하지 않는다', () => {
    const controller = makeController();
    const { writer, markCancelled } = createSseWriter(controller);
    markCancelled();
    writer.send('progress', { value: 1 });
    expect(controller.enqueue).not.toHaveBeenCalled();
  });

  it('enqueue()가 throw하면 cancelled=true가 되어 이후 send()는 무시된다', () => {
    const controller = makeController();
    (controller.enqueue as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      throw new Error('stream closed');
    });
    const { writer } = createSseWriter(controller);
    writer.send('first', {}); // throws → cancelled=true
    writer.send('second', {}); // should be ignored
    expect(controller.enqueue).toHaveBeenCalledTimes(1);
    expect(writer.isCancelled()).toBe(true);
  });
});
