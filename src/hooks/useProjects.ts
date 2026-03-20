'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Project } from '@/types/project';

interface UseProjectsReturn {
  projects: Project[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
  deleteProject: (id: string) => Promise<void>;
}

export function useProjects(): UseProjectsReturn {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProjects = useCallback(async (signal?: AbortSignal) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/projects', { signal });
      if (!res.ok) throw new Error('프로젝트를 불러올 수 없습니다.');
      const data = await res.json();
      setProjects(data.data ?? []);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setError(err instanceof Error ? err.message : '알 수 없는 오류');
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    fetchProjects(ctrl.signal);
    return () => ctrl.abort();
  }, [fetchProjects]);

  const deleteProject = async (id: string) => {
    const res = await fetch(`/api/v1/projects/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error?.message ?? '삭제에 실패했습니다.');
    }
    setProjects((prev) => prev.filter((p) => p.id !== id));
  };

  return { projects, isLoading, error, refetch: () => fetchProjects(), deleteProject };
}
