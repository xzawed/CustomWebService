'use client';

import { useCallback, useRef } from 'react';
import { useGenerationStore } from '@/stores/generationStore';

interface UseGenerationReturn {
  status: string;
  progress: number;
  currentStep: string;
  projectId: string | null;
  version: number | null;
  error: string | null;
  startGeneration: (projectId: string) => Promise<void>;
  cancel: () => void;
  reset: () => void;
}

export function useGeneration(): UseGenerationReturn {
  const store = useGenerationStore();
  const abortRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const startGeneration = useCallback(
    async (projectId: string) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      store.startGeneration();

      try {
        const res = await fetch('/api/v1/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error?.message ?? '코드 생성에 실패했습니다.');
        }

        const reader = res.body?.getReader();
        if (!reader) throw new Error('스트림을 읽을 수 없습니다.');

        const decoder = new TextDecoder();
        let buffer = '';
        let done = false;

        try {
          while (!done) {
            const { value, done: streamDone } = await reader.read();
            done = streamDone;
            if (value) {
              buffer += decoder.decode(value, { stream: true });

              // Process complete SSE event blocks (separated by double newline)
              const blocks = buffer.split('\n\n');
              buffer = blocks.pop() ?? '';

              for (const block of blocks) {
                if (!block.trim()) continue;

                let eventType = 'message';
                let eventData = '';

                for (const line of block.split('\n')) {
                  if (line.startsWith('event: ')) {
                    eventType = line.slice(7).trim();
                  } else if (line.startsWith('data: ')) {
                    eventData = line.slice(6);
                  }
                }

                if (!eventData) continue;

                let parsed: Record<string, unknown>;
                try {
                  parsed = JSON.parse(eventData);
                } catch {
                  continue;
                }

                if (eventType === 'progress') {
                  store.updateProgress(
                    (parsed.progress as number) ?? 0,
                    (parsed.message as string) ?? ''
                  );
                } else if (eventType === 'complete') {
                  store.completeGeneration(
                    (parsed.projectId as string) ?? projectId,
                    parsed.version as number | undefined
                  );
                  return;
                } else if (eventType === 'error') {
                  throw new Error((parsed.message as string) ?? '코드 생성에 실패했습니다.');
                }
              }
            }
          }
        } finally {
          reader.cancel().catch(() => {});
        }

        store.completeGeneration(projectId);
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        store.failGeneration(err instanceof Error ? err.message : '알 수 없는 오류');
      }
    },
    [store]
  );

  return {
    status: store.status,
    progress: store.progress,
    currentStep: store.currentStep,
    projectId: store.projectId,
    version: store.version,
    error: store.error,
    startGeneration,
    cancel,
    reset: store.reset,
  };
}
