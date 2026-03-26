'use client';

import type { ApiCatalogItem } from '@/types/api';
import { ExternalLink, Check } from 'lucide-react';

interface ApiCardProps {
  api: ApiCatalogItem;
  isSelected: boolean;
  onSelect: () => void;
  onDetail: () => void;
}

const authTypeLabels: Record<string, string> = {
  none: '키 불필요',
  api_key: 'API Key',
  oauth: 'OAuth',
};

const categoryColors: Record<string, string> = {
  weather: 'from-sky-500/20 to-sky-400/5 text-sky-400',
  finance: 'from-emerald-500/20 to-emerald-400/5 text-emerald-400',
  data: 'from-blue-500/20 to-blue-400/5 text-blue-400',
  entertainment: 'from-violet-500/20 to-violet-400/5 text-violet-400',
  image: 'from-pink-500/20 to-pink-400/5 text-pink-400',
  fun: 'from-amber-500/20 to-amber-400/5 text-amber-400',
  utility: 'from-slate-500/20 to-slate-400/5 text-slate-300',
  dictionary: 'from-teal-500/20 to-teal-400/5 text-teal-400',
  news: 'from-orange-500/20 to-orange-400/5 text-orange-400',
  social: 'from-indigo-500/20 to-indigo-400/5 text-indigo-400',
  transport: 'from-cyan-500/20 to-cyan-400/5 text-cyan-400',
  realestate: 'from-lime-500/20 to-lime-400/5 text-lime-400',
  tourism: 'from-rose-500/20 to-rose-400/5 text-rose-400',
  lifestyle: 'from-fuchsia-500/20 to-fuchsia-400/5 text-fuchsia-400',
  location: 'from-cyan-500/20 to-cyan-400/5 text-cyan-400',
  science: 'from-violet-500/20 to-violet-400/5 text-violet-400',
};

export function ApiCard({ api, isSelected, onSelect, onDetail }: ApiCardProps) {
  const colorClass = categoryColors[api.category] ?? categoryColors.utility;

  return (
    <div
      onClick={onSelect}
      className={`card group relative cursor-pointer p-5 ${
        isSelected
          ? 'ring-1 ring-cyan-500/50'
          : ''
      }`}
      style={isSelected ? { borderColor: 'rgba(6, 182, 212, 0.3)' } : undefined}
    >
      {/* Selection indicator */}
      <div className="absolute right-4 top-4">
        <div
          className={`flex h-5 w-5 items-center justify-center rounded-md border transition-all ${
            isSelected
              ? 'border-cyan-500 bg-cyan-500'
              : 'border-slate-600 bg-transparent group-hover:border-slate-400'
          }`}
        >
          {isSelected && <Check className="h-3 w-3 text-white" />}
        </div>
      </div>

      <div className="pr-8">
        <h3 className="text-sm font-bold text-white">{api.name}</h3>
        <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-slate-400">
          {api.description}
        </p>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className={`badge bg-gradient-to-r ${colorClass}`}>
          {api.category}
        </span>
        <span className="badge bg-slate-700/50 text-slate-300">
          {authTypeLabels[api.authType] ?? api.authType}
        </span>
        {api.rateLimit && (
          <span className="badge bg-amber-500/10 text-amber-400">
            {api.rateLimit}/min
          </span>
        )}
      </div>

      {/* Detail button */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDetail();
        }}
        className="absolute bottom-4 right-4 rounded-lg p-1.5 text-slate-500 opacity-0 transition-all hover:bg-white/[0.06] hover:text-cyan-400 group-hover:opacity-100"
        aria-label="상세 보기"
      >
        <ExternalLink className="h-4 w-4" />
      </button>
    </div>
  );
}
