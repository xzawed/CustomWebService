/**
 * SSE 블록 파서 — 청크 경계에 걸친 부분 블록을 버퍼에 남기고,
 * 완성된 블록만 `event:` / `data:` 로 파싱한다.
 *
 * `builder/page.tsx` handleGenerate SSE 루프(buffer/split 구간)에서 추출.
 * IO 없음, 순수 함수.
 */

export interface SseEvent {
  type: string;
  data: Record<string, unknown>;
}

/**
 * 기존 버퍼에 chunk를 이어 붙인 뒤 완성된 SSE 블록을 파싱한다.
 * 마지막 incomplete 블록은 buffer에 남긴다.
 */
export function appendAndParseSse(
  buffer: string,
  chunk: string,
): { buffer: string; events: SseEvent[] } {
  let nextBuffer = buffer + chunk;
  const blocks = nextBuffer.split('\n\n');
  nextBuffer = blocks.pop() ?? '';

  const events: SseEvent[] = [];

  for (const eventBlock of blocks) {
    if (!eventBlock.trim()) continue;

    let eventType = 'message';
    let eventData = '';

    for (const line of eventBlock.split('\n')) {
      if (line.startsWith('event: ')) {
        eventType = line.slice(7).trim();
      } else if (line.startsWith('data: ')) {
        eventData = line.slice(6);
      }
    }

    if (!eventData) continue;

    try {
      const data = JSON.parse(eventData) as Record<string, unknown>;
      events.push({ type: eventType, data });
    } catch {
      console.warn('[SSE] Failed to parse event data', { eventType, eventData });
    }
  }

  return { buffer: nextBuffer, events };
}
