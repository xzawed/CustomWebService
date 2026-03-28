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

// Hue-based category accent — bg uses accent-light equivalent, text uses accent-primary equivalent
const categoryBadgeStyle: Record<string, { background: string; color: string }> = {
  weather:     { background: 'rgba(14,165,233,0.12)',  color: '#0284c7' },
  finance:     { background: 'rgba(16,185,129,0.12)',  color: '#059669' },
  data:        { background: 'rgba(59,130,246,0.12)',  color: '#2563eb' },
  entertainment:{ background: 'rgba(139,92,246,0.12)', color: '#7c3aed' },
  image:       { background: 'rgba(236,72,153,0.12)',  color: '#db2777' },
  fun:         { background: 'rgba(245,158,11,0.12)',  color: '#d97706' },
  utility:     { background: 'rgba(100,116,139,0.12)', color: '#475569' },
  dictionary:  { background: 'rgba(20,184,166,0.12)',  color: '#0d9488' },
  news:        { background: 'rgba(249,115,22,0.12)',  color: '#ea580c' },
  social:      { background: 'rgba(99,102,241,0.12)',  color: '#4f46e5' },
  transport:   { background: 'rgba(6,182,212,0.12)',   color: '#0891b2' },
  realestate:  { background: 'rgba(132,204,22,0.12)',  color: '#65a30d' },
  tourism:     { background: 'rgba(244,63,94,0.12)',   color: '#e11d48' },
  lifestyle:   { background: 'rgba(217,70,239,0.12)',  color: '#c026d3' },
  location:    { background: 'rgba(6,182,212,0.12)',   color: '#0891b2' },
  science:     { background: 'rgba(139,92,246,0.12)',  color: '#7c3aed' },
};

export function ApiCard({ api, isSelected, onSelect, onDetail }: ApiCardProps) {
  const catStyle = categoryBadgeStyle[api.category] ?? categoryBadgeStyle.utility;

  return (
    <div
      onClick={onSelect}
      className="card group relative cursor-pointer p-5"
      style={isSelected ? { borderColor: 'var(--accent-primary)', boxShadow: 'var(--shadow-glow)' } : undefined}
    >
      {/* Selection indicator */}
      <div className="absolute right-4 top-4">
        <div
          className="flex h-5 w-5 items-center justify-center rounded-md border transition-all"
          style={
            isSelected
              ? { borderColor: 'var(--accent-primary)', background: 'var(--accent-primary)' }
              : { borderColor: 'var(--border)', background: 'transparent' }
          }
        >
          {isSelected && <Check className="h-3 w-3 text-white" />}
        </div>
      </div>

      <div className="pr-8">
        <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{api.name}</h3>
        <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          {api.description}
        </p>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span
          className="badge"
          style={catStyle}
        >
          {api.category}
        </span>
        <span
          className="badge"
          style={{ background: 'var(--bg-surface)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
        >
          {authTypeLabels[api.authType] ?? api.authType}
        </span>
        {api.rateLimit && (
          <span
            className="badge"
            style={{ background: 'rgba(245,158,11,0.12)', color: '#d97706' }}
          >
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
        className="absolute bottom-4 right-4 rounded-lg p-1.5 opacity-0 transition-all group-hover:opacity-100"
        style={{ color: 'var(--text-muted)' }}
        onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--accent-primary)')}
        onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
        aria-label="상세 보기"
      >
        <ExternalLink className="h-4 w-4" />
      </button>
    </div>
  );
}
