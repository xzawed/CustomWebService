'use client';

import { useEffect, useState, useCallback } from 'react';
import { Flame, Loader2, TrendingUp, ChevronRight } from 'lucide-react';

export interface PopularService {
  id: string;
  title: string;
  description: string;
  context: string;
  apiNames: string[];
  apiIds: string[];
  category: string;
  usageCount: number;
}

interface PopularServiceSuggestionsProps {
  onSelect: (service: PopularService) => void;
}

const CATEGORY_EMOJI: Record<string, string> = {
  weather: '🌤',
  finance: '💱',
  news: '📰',
  tourism: '✈️',
  translation: '🌐',
  maps: '🗺',
  location: '📍',
  image: '🖼',
  data: '📊',
  entertainment: '🎬',
  transport: '🚌',
  realestate: '🏠',
  lifestyle: '💚',
  science: '🔭',
};

export default function PopularServiceSuggestions({ onSelect }: PopularServiceSuggestionsProps) {
  const [services, setServices] = useState<PopularService[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchPopular = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/v1/popular-services');
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setServices(data.data?.services ?? []);
    } catch {
      setServices([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPopular();
  }, [fetchPopular]);

  if (isLoading) {
    return (
      <div
        className="rounded-xl p-6"
        style={{ border: '1px solid rgba(245,158,11,0.2)', background: 'rgba(245,158,11,0.05)' }}
      >
        <div className="flex items-center gap-3" style={{ color: '#d97706' }}>
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm font-medium">인기 서비스를 불러오는 중...</span>
        </div>
      </div>
    );
  }

  if (services.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Flame className="h-4 w-4" style={{ color: '#d97706' }} />
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>인기 서비스</h3>
        <span
          className="rounded-full px-2 py-0.5 text-xs"
          style={{ background: 'rgba(245,158,11,0.12)', color: '#d97706' }}
        >
          클릭하면 바로 시작
        </span>
      </div>
      <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
        어떤 서비스를 만들지 고민되시나요? 인기 있는 서비스를 선택해보세요.
      </p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {services.slice(0, 5).map((service) => (
          <button
            key={service.id}
            type="button"
            onClick={() => onSelect(service)}
            className="card group relative p-4 text-left"
          >
            <div className="mb-2 flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-lg">{CATEGORY_EMOJI[service.category] ?? '⚡'}</span>
                <h4 className="text-sm font-bold transition-colors" style={{ color: 'var(--text-primary)' }}>
                  {service.title}
                </h4>
              </div>
              <ChevronRight
                className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5"
                style={{ color: 'var(--text-muted)' }}
              />
            </div>

            <p className="mb-3 line-clamp-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
              {service.description}
            </p>

            <div className="flex flex-wrap gap-1.5">
              {service.apiNames.map((name) => (
                <span
                  key={name}
                  className="rounded px-1.5 py-0.5 text-[10px] font-medium"
                  style={{ background: 'var(--bg-surface)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
                >
                  {name}
                </span>
              ))}
              {service.usageCount > 0 && (
                <span
                  className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium"
                  style={{ background: 'rgba(245,158,11,0.12)', color: '#d97706' }}
                >
                  <TrendingUp className="h-2.5 w-2.5" />
                  {service.usageCount}회 사용
                </span>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
