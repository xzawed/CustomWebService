import { describe, it, expect, vi, afterEach } from 'vitest';
import { appendAndParseSse } from './parseSseBlocks';

describe('appendAndParseSse', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('한 청크에 여러 이벤트를 파싱한다', () => {
    const chunk =
      'event: progress\ndata: {"progress":20,"message":"a"}\n\n' +
      'event: progress\ndata: {"progress":40,"message":"b"}\n\n';

    const { buffer, events } = appendAndParseSse('', chunk);

    expect(buffer).toBe('');
    expect(events).toEqual([
      { type: 'progress', data: { progress: 20, message: 'a' } },
      { type: 'progress', data: { progress: 40, message: 'b' } },
    ]);
  });

  it('두 청크에 걸친 이벤트를 이어 파싱한다', () => {
    const first = appendAndParseSse('', 'event: complete\ndata: {"projectId":"p1"');
    expect(first.events).toEqual([]);
    expect(first.buffer).toBe('event: complete\ndata: {"projectId":"p1"');

    const second = appendAndParseSse(first.buffer, ',"version":2}\n\n');
    expect(second.buffer).toBe('');
    expect(second.events).toEqual([
      { type: 'complete', data: { projectId: 'p1', version: 2 } },
    ]);
  });

  it('data: 없는 블록은 스킵한다', () => {
    const chunk = 'event: progress\n\nevent: progress\ndata: {"progress":1}\n\n';
    const { events } = appendAndParseSse('', chunk);
    expect(events).toEqual([{ type: 'progress', data: { progress: 1 } }]);
  });

  it('malformed JSON은 스킵하고 스트림을 계속한다', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const chunk =
      'event: progress\ndata: {not-json}\n\n' +
      'event: complete\ndata: {"projectId":"ok","version":1}\n\n';

    const { events } = appendAndParseSse('', chunk);

    expect(events).toEqual([
      { type: 'complete', data: { projectId: 'ok', version: 1 } },
    ]);
    expect(warn).toHaveBeenCalledWith(
      '[SSE] Failed to parse event data',
      expect.objectContaining({ eventType: 'progress', eventData: '{not-json}' }),
    );
  });

  it('trailing partial 블록은 buffer에 남긴다', () => {
    const chunk =
      'event: progress\ndata: {"progress":5}\n\n' +
      'event: progress\ndata: {"progress":9';

    const { buffer, events } = appendAndParseSse('', chunk);

    expect(events).toEqual([{ type: 'progress', data: { progress: 5 } }]);
    expect(buffer).toBe('event: progress\ndata: {"progress":9');
  });

  it('event: 줄이 없으면 type은 message 기본값', () => {
    const { events } = appendAndParseSse('', 'data: {"x":1}\n\n');
    expect(events).toEqual([{ type: 'message', data: { x: 1 } }]);
  });
});
