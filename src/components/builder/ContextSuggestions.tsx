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
    <div
      className="space-y-3 rounded-xl p-4"
      style={{ border: '1px solid var(--border-accent)', background: 'var(--accent-light)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4" style={{ color: 'var(--accent-primary)' }} />
          <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>선택한 API 기반 AI 추천</span>
          <span
            className="rounded-full px-2 py-0.5 text-xs font-medium"
            style={{ background: 'var(--accent-primary)', color: 'white' }}
          >
            자동 생성
          </span>
        </div>
        {!isLoading && (
          <button
            type="button"
            onClick={onRefresh}
            aria-label="AI 추천 컨텍스트 다시 생성"
            className="btn-ghost flex items-center gap-1 px-2 py-1 text-xs"
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
              className="animate-pulse rounded-lg p-4"
              style={{ border: '1px solid var(--border)', background: 'var(--bg-card)' }}
            >
              <div className="mb-2 h-2.5 w-1/4 rounded" style={{ background: 'var(--bg-surface)' }} />
              <div className="mb-1.5 h-3 w-full rounded" style={{ background: 'var(--bg-surface)' }} />
              <div className="mb-1.5 h-3 w-5/6 rounded" style={{ background: 'var(--bg-surface)' }} />
              <div className="h-3 w-4/6 rounded" style={{ background: 'var(--bg-surface)' }} />
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
              className="rounded-lg p-4 text-left text-sm transition-all"
              style={
                activeIndex === i
                  ? { border: '1px solid var(--accent-primary)', background: 'var(--bg-card)', color: 'var(--text-primary)', boxShadow: 'var(--shadow-sm)' }
                  : { border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-secondary)' }
              }
            >
              <span className="mb-1.5 block text-xs font-semibold" style={{ color: 'var(--accent-primary)' }}>
                추천 {i + 1}
              </span>
              <span className="leading-relaxed">{suggestion}</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="py-2 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
          추천을 불러오지 못했습니다.{' '}
          <button
            type="button"
            onClick={onRefresh}
            aria-label="AI 추천 컨텍스트 다시 시도"
            className="underline transition-colors"
            style={{ color: 'var(--accent-primary)' }}
          >
            다시 시도
          </button>
        </p>
      )}

      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
        추천 항목을 선택하면 아래 입력란에 자동으로 채워집니다. 원하는 대로 수정 후 진행하세요.
      </p>
    </div>
  );
}
