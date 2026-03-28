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
      <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-6">
        <div className="flex items-center gap-3 text-violet-400">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm font-medium">AI가 서비스에 적합한 API를 찾고 있습니다...</span>
        </div>
      </div>
    );
  }

  if (hasError) {
    return (
      <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 text-rose-400">
            <AlertCircle className="h-5 w-5" />
            <span className="text-sm font-medium">API 추천에 실패했습니다. 아래에서 직접 API를 추가해주세요.</span>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs text-rose-400 transition-colors hover:bg-rose-500/10 hover:text-rose-300"
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
      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 text-amber-400">
            <AlertCircle className="h-5 w-5" />
            <span className="text-sm font-medium">적합한 API를 찾지 못했습니다. 아래에서 직접 추가하거나 서비스 설명을 수정해보세요.</span>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs text-amber-400 transition-colors hover:bg-amber-500/10 hover:text-amber-300"
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
          <Sparkles className="h-4 w-4 text-violet-400" />
          <h3 className="text-sm font-semibold text-white">AI 추천 API</h3>
          <span className="rounded-full bg-violet-500/10 px-2 py-0.5 text-xs text-violet-400">
            {recommendations.length}개 발견
          </span>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs text-slate-400 transition-colors hover:bg-white/5 hover:text-white"
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
              className={`group relative rounded-xl border p-4 transition-all ${
                isSelected
                  ? 'border-violet-500/40 bg-violet-500/10'
                  : 'border-white/[0.06] bg-[#0f1629] hover:border-violet-500/20'
              }`}
            >
              <div className="mb-2 flex items-start justify-between gap-2">
                <div>
                  <h4 className="text-sm font-bold text-white">{api.name}</h4>
                  <span className="mt-0.5 inline-block rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-slate-400">
                    {api.category}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => (isSelected ? onDeselect(api.id) : onSelect(api))}
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-all ${
                    isSelected
                      ? 'bg-violet-500 text-white'
                      : 'bg-white/5 text-slate-400 hover:bg-violet-500/20 hover:text-violet-400'
                  }`}
                >
                  {isSelected ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                </button>
              </div>
              <p className="mb-2 line-clamp-2 text-xs text-slate-400">{api.description}</p>
              <div className="flex items-center gap-1.5 rounded-lg bg-violet-500/5 px-2.5 py-1.5">
                <Sparkles className="h-3 w-3 text-violet-400" />
                <span className="text-[11px] text-violet-300">{reason}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
