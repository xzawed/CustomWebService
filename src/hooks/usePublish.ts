'use client';

import { useState } from 'react';

export function usePublish() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const publish = async (projectId: string, slug?: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const body = slug ? JSON.stringify({ slug }) : undefined;
      const res = await fetch(`/api/v1/projects/${projectId}/publish`, {
        method: 'POST',
        headers: slug ? { 'Content-Type': 'application/json' } : {},
        body,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? '게시에 실패했습니다.');
      }
      return await res.json();
    } catch (err) {
      const message = err instanceof Error ? err.message : '게시에 실패했습니다.';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const unpublish = async (projectId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/projects/${projectId}/publish`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? '게시 취소에 실패했습니다.');
      }
      return await res.json();
    } catch (err) {
      const message = err instanceof Error ? err.message : '게시 취소에 실패했습니다.';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  return { publish, unpublish, isLoading, error };
}
