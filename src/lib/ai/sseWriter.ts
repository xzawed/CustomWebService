export interface SseWriter {
  send(event: string, data: unknown): void;
  isCancelled(): boolean;
}

export function createSseWriter(
  controller: ReadableStreamDefaultController,
): { writer: SseWriter; markCancelled: () => void } {
  const encoder = new TextEncoder();
  let cancelled = false;

  const writer: SseWriter = {
    send(event: string, data: unknown): void {
      if (cancelled) return;
      try {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      } catch {
        cancelled = true;
      }
    },
    isCancelled(): boolean {
      return cancelled;
    },
  };

  return { writer, markCancelled: () => { cancelled = true; } };
}
