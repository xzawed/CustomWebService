'use client';

import { useState, useEffect, useCallback } from 'react';
import type { ApiCatalogItem, Category } from '@/types/api';

interface UseApiCatalogReturn {
  apis: ApiCatalogItem[];
  categories: Category[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useApiCatalog(): UseApiCatalogReturn {
  const [apis, setApis] = useState<ApiCatalogItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (signal?: AbortSignal) => {
    setIsLoading(true);
    setError(null);
    try {
      const [apisRes, catsRes] = await Promise.all([
        fetch('/api/v1/catalog?limit=100', { signal }),
        fetch('/api/v1/catalog/categories', { signal }),
      ]);
      if (!apisRes.ok || !catsRes.ok) throw new Error('API 카탈로그를 불러올 수 없습니다.');
      const apisData = await apisRes.json();
      const catsData = await catsRes.json();
      setApis(apisData.data?.items ?? []);
      setCategories(catsData.data ?? []);
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
    fetchData(ctrl.signal);
    return () => ctrl.abort();
  }, [fetchData]);

  return { apis, categories, isLoading, error, refetch: () => fetchData() };
}
