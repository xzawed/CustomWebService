'use client';

import { Loader2, Sparkles, Plus, Check, RefreshCw, AlertCircle } from 'lucide-react';
import type { ApiCatalogItem } from '@/types/api';

export interface ApiRecommendation {
  api: ApiCatalogItem;
  reason: string;
}

interface ApiRecommendationsProps {
  recommendations: ApiRecommendation[];
  isLoading: boolean;
  hasError?: boolean;
  selectedIds: string[];
  onSelect: (api: ApiCatalogItem) => void;
  onDeselect: (id: string) => void;
  onRefresh: () => void;
}

export default function ApiRecommendations({
  recommendations,
  isLoading,
  hasError,
  selectedIds,
  onSelect,
  onDeselect,
  onRefresh,
}: ApiRecommendationsProps) {
  if (isLoading) {
    return (
      <div className="rounded-xl p-6" style={{ border: '1px solid var(--border)', background: 'var(--bg-card)' }}>
        <div className="flex items-center gap-3" style={{ color: 'var(--accent-primary)' }}>
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>AI가 서비스에 적합한 API를 찾고 있습니다...</span>
        </div>
      </div>
    );
  }

  if (hasError) {
    return (
      <div className="rounded-xl p-6" style={{ border: '1px solid var(--border)', background: 'var(--bg-card)' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3" style={{ color: 'var(--text-secondary)' }}>
            <AlertCircle className="h-5 w-5" />
            <span className="text-sm font-medium">API 추천에 실패했습니다. 아래에서 직접 API를 추가해주세요.</span>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            className="btn-ghost inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs"
          >
            <RefreshCw className="h-3 w-3" />
            재시도
          </button>
        </div>
      </div>
    );
  }

  if (recommendations.length === 0) {
    return (
      <div className="rounded-xl p-6" style={{ border: '1px solid var(--border)', background: 'var(--bg-card)' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3" style={{ color: 'var(--text-secondary)' }}>
            <AlertCircle className="h-5 w-5" />
            <span className="text-sm font-medium">적합한 API를 찾지 못했습니다. 아래에서 직접 추가하거나 서비스 설명을 수정해보세요.</span>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            className="btn-ghost inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs"
          >
            <RefreshCw className="h-3 w-3" />
            재시도
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4" style={{ color: 'var(--accent-primary)' }} />
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>AI 추천 API</h3>
          <span
            className="rounded-full px-2 py-0.5 text-xs"
            style={{ background: 'var(--accent-light)', color: 'var(--accent-primary)' }}
          >
            {recommendations.length}개 발견
          </span>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="btn-ghost inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs"
        >
          <RefreshCw className="h-3 w-3" />
          다시 추천
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {recommendations.map(({ api, reason }) => {
          const isSelected = selectedIds.includes(api.id);
          return (
            <div
              key={api.id}
              className="group relative rounded-xl p-4 transition-all"
              style={
                isSelected
                  ? { border: '1px solid var(--accent-primary)', background: 'var(--accent-light)' }
                  : { border: '1px solid var(--border)', background: 'var(--bg-card)' }
              }
            >
              <div className="mb-2 flex items-start justify-between gap-2">
                <div>
                  <h4 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{api.name}</h4>
                  <span
                    className="mt-0.5 inline-block rounded px-1.5 py-0.5 text-[10px]"
                    style={{ background: 'var(--bg-surface)', color: 'var(--text-secondary)' }}
                  >
                    {api.category}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => (isSelected ? onDeselect(api.id) : onSelect(api))}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-all"
                  style={
                    isSelected
                      ? { background: 'var(--accent-primary)', color: 'white' }
                      : { background: 'var(--bg-surface)', color: 'var(--text-secondary)' }
                  }
                >
                  {isSelected ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                </button>
              </div>
              <p className="mb-2 line-clamp-2 text-xs" style={{ color: 'var(--text-secondary)' }}>{api.description}</p>
              <div
                className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5"
                style={{ background: 'var(--accent-light)' }}
              >
                <Sparkles className="h-3 w-3" style={{ color: 'var(--accent-primary)' }} />
                <span className="text-[11px]" style={{ color: 'var(--accent-primary)' }}>{reason}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
