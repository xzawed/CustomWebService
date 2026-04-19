'use client';

import type { DesignMood, DesignAudience, DesignLayout } from '@/types/project';
import { useContextStore } from '@/stores/contextStore';

const MOOD_OPTIONS: { value: DesignMood; label: string }[] = [
  { value: 'auto', label: '자동' },
  { value: 'light', label: '밝고 깔끔' },
  { value: 'dark', label: '어둡고 세련' },
  { value: 'warm', label: '따뜻하고 친근' },
  { value: 'colorful', label: '화려하고 역동' },
  { value: 'minimal', label: '미니멀' },
];

const AUDIENCE_OPTIONS: { value: DesignAudience; label: string }[] = [
  { value: 'general', label: '일반' },
  { value: 'business', label: '비즈니스' },
  { value: 'youth', label: '젊은층' },
  { value: 'premium', label: '프리미엄' },
];

const LAYOUT_OPTIONS: { value: DesignLayout; label: string }[] = [
  { value: 'auto', label: '자동' },
  { value: 'dashboard', label: '대시보드' },
  { value: 'feed', label: '피드/목록' },
  { value: 'landing', label: '랜딩페이지' },
  { value: 'tool', label: '도구/유틸리티' },
];

function ChipGroup<T extends string>({
  label,
  options,
  value,
  onChange,
  aiSuggestedValue,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  aiSuggestedValue?: T;
}) {
  return (
    <div>
      <label className="mb-2 block text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
        {label}
      </label>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className="rounded-lg px-3 py-1.5 text-sm transition-all duration-150"
            style={{
              background: value === opt.value ? 'var(--accent-primary)' : 'var(--bg-card)',
              color: value === opt.value ? 'white' : 'var(--text-secondary)',
              border: `1px solid ${value === opt.value ? 'var(--accent-primary)' : 'var(--border)'}`,
            }}
          >
            {opt.label}
            {opt.value === aiSuggestedValue && (
              <span className="ml-1 text-xs" style={{ color: value === opt.value ? 'white' : 'var(--accent-primary)' }}>
                ★
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function DesignPreferences() {
  const {
    mood,
    audience,
    layoutPreference,
    setMood,
    setAudience,
    setLayoutPreference,
    aiSuggestion,
    gateResolved,
  } = useContextStore();

  const hasSuggestion = gateResolved && aiSuggestion !== null;

  return (
    <details className="group">
      <summary
        className="flex cursor-pointer list-none items-center gap-1.5 text-sm font-medium transition-colors [&::-webkit-details-marker]:hidden"
        style={{ color: 'var(--text-muted)' }}
      >
        <svg
          className="h-3.5 w-3.5 transition-transform group-open:rotate-90"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        디자인 선호도 설정 (선택사항)
        {hasSuggestion && (
          <span
            className="ml-2 rounded-full px-2 py-0.5 text-xs"
            style={{ background: '#ede9fe', color: 'var(--accent-primary)' }}
          >
            AI 추천 적용됨
          </span>
        )}
      </summary>
      <div
        className="mt-4 space-y-4 rounded-lg p-4"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
      >
        <ChipGroup
          label="분위기"
          options={MOOD_OPTIONS}
          value={mood}
          onChange={setMood}
          aiSuggestedValue={aiSuggestion?.mood !== 'auto' ? aiSuggestion?.mood : undefined}
        />
        <ChipGroup
          label="대상 고객"
          options={AUDIENCE_OPTIONS}
          value={audience}
          onChange={setAudience}
          aiSuggestedValue={
            aiSuggestion?.audience !== 'general' ? aiSuggestion?.audience : undefined
          }
        />
        <ChipGroup
          label="레이아웃"
          options={LAYOUT_OPTIONS}
          value={layoutPreference}
          onChange={setLayoutPreference}
          aiSuggestedValue={
            aiSuggestion?.layoutPreference !== 'auto'
              ? aiSuggestion?.layoutPreference
              : undefined
          }
        />
      </div>
    </details>
  );
}
