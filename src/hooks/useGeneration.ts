'use client';

import { useCallback } from 'react';
import { useGenerationStore } from '@/stores/generationStore';

interface UseGenerationReturn {
  status: string;
  progress: number;
  currentStep: string;
  projectId: string | null;
  error: string | null;
  startGeneration: (projectId: string) => Promise<void>;
  reset: () => void;
}

export function useGeneration(): UseGenerationReturn {
  const store = useGenerationStore();

  const startGeneration = useCallback(
    async (projectId: string) => {
      store.startGeneration();

      try {
        const res = await fetch('/api/v1/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error?.message ?? '코드 생성에 실패했습니다.');
        }

        const reader = res.body?.getReader();
        if (!reader) throw new Error('스트림을 읽을 수 없습니다.');

        const decoder = new TextDecoder();
        let done = false;

        while (!done) {
          const { value, done: streamDone } = await reader.read();
          done = streamDone;
          if (value) {
            const text = decoder.decode(value, { stream: true });
            for (const line of text.split('\n')) {
              if (line.startsWith('data: ')) {
                try {
                  const data = JSON.parse(line.slice(6));
                  if (data.progress !== undefined) {
                    store.updateProgress(data.progress, data.message ?? '');
                  }
                  if (data.projectId && data.version !== undefined) {
                    store.completeGeneration(data.projectId);
                    return;
                  }
                  if (data.message && data.progress === undefined) {
                    throw new Error(data.message);
                  }
                } catch (e) {
                  if (e instanceof SyntaxError) continue;
                  throw e;
                }
              }
            }
          }
        }

        store.completeGeneration(projectId);
      } catch (err) {
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
    error: store.error,
    startGeneration,
    reset: store.reset,
  };
}
