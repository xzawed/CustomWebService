'use client';

import { useCallback } from 'react';
import { useDeployStore } from '@/stores/deployStore';

interface UseDeployReturn {
  status: string;
  progress: number;
  currentStep: string;
  deployUrl: string | null;
  error: string | null;
  startDeploy: (projectId: string, platform?: string) => Promise<void>;
  reset: () => void;
}

export function useDeploy(): UseDeployReturn {
  const store = useDeployStore();

  const startDeploy = useCallback(
    async (projectId: string, platform: string = 'vercel') => {
      store.startDeploy();

      try {
        const res = await fetch('/api/v1/deploy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId, platform }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error?.message ?? '배포에 실패했습니다.');
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
                  if (data.deployUrl) {
                    store.completeDeploy(data.deployUrl);
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
      } catch (err) {
        store.failDeploy(err instanceof Error ? err.message : '알 수 없는 오류');
      }
    },
    [store]
  );

  return {
    status: store.status,
    progress: store.progress,
    currentStep: store.currentStep,
    deployUrl: store.deployUrl,
    error: store.error,
    startDeploy,
    reset: store.reset,
  };
}
