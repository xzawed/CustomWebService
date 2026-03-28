'use client';

import { Sparkles, RefreshCw } from 'lucide-react';

interface ContextSuggestionsProps {
  suggestions: string[];
  isLoading: boolean;
  activeIndex: number | null;
  onSelect: (suggestion: string, index: number) => void;
  onRefresh: () => void;
}

export default function ContextSuggestions({
  suggestions,
  isLoading,
  activeIndex,
  onSelect,
  onRefresh,
}: ContextSuggestionsProps) {
  return (
    <div className="space-y-3 rounded-xl border border-blue-100 bg-blue-50/40 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-blue-500" />
          <span className="text-sm font-semibold text-gray-800">선택한 API 기반 AI 추천</span>
          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-600">
            자동 생성
          </span>
        </div>
        {!isLoading && (
          <button
            type="button"
            onClick={onRefresh}
            aria-label="AI 추천 컨텍스트 다시 생성"
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-gray-400 transition-colors hover:bg-white hover:text-gray-600"
          >
            <RefreshCw className="h-3 w-3" />
            다시 생성
          </button>
        )}
      </div>

      {/* Suggestion cards */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="animate-pulse rounded-lg border border-gray-200 bg-white p-4"
            >
              <div className="mb-2 h-2.5 w-1/4 rounded bg-gray-200" />
              <div className="mb-1.5 h-3 w-full rounded bg-gray-200" />
              <div className="mb-1.5 h-3 w-5/6 rounded bg-gray-200" />
              <div className="h-3 w-4/6 rounded bg-gray-200" />
            </div>
          ))}
        </div>
      ) : suggestions.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {suggestions.map((suggestion, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onSelect(suggestion, i)}
              className={`rounded-lg border p-4 text-left text-sm transition-all ${
                activeIndex === i
                  ? 'border-blue-500 bg-white text-gray-900 shadow-sm ring-1 ring-blue-400'
                  : 'border-gray-200 bg-white text-gray-700 hover:border-blue-300 hover:bg-blue-50/60 hover:shadow-sm'
              }`}
            >
              <span className="mb-1.5 block text-xs font-semibold text-blue-500">
                추천 {i + 1}
              </span>
              <span className="leading-relaxed">{suggestion}</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="py-2 text-center text-sm text-gray-400">
          추천을 불러오지 못했습니다.{' '}
          <button
            type="button"
            onClick={onRefresh}
            aria-label="AI 추천 컨텍스트 다시 시도"
            className="text-blue-500 underline hover:text-blue-600"
          >
            다시 시도
          </button>
        </p>
      )}

      <p className="text-xs text-gray-400">
        추천 항목을 선택하면 아래 입력란에 자동으로 채워집니다. 원하는 대로 수정 후 진행하세요.
      </p>
    </div>
  );
}
