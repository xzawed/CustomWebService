'use client';

import type { ApiCatalogItem } from '@/types/api';
import { ExternalLink } from 'lucide-react';

interface ApiCardProps {
  api: ApiCatalogItem;
  isSelected: boolean;
  onSelect: () => void;
  onDetail: () => void;
}

const authTypeLabels: Record<string, string> = {
  none: '인증 불필요',
  api_key: 'API Key',
  oauth: 'OAuth',
};

export function ApiCard({ api, isSelected, onSelect, onDetail }: ApiCardProps) {
  return (
    <div
      className={`group relative rounded-xl border bg-white p-5 shadow-sm transition-all hover:shadow-md ${
        isSelected
          ? 'border-blue-500 ring-1 ring-blue-500'
          : 'border-gray-200 hover:border-gray-300'
      }`}
    >
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onSelect}
          aria-label={`${api.name} API 선택`}
          className="mt-1 h-4 w-4 shrink-0 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h3 className="truncate text-sm font-semibold text-gray-900">
              {api.name}
            </h3>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDetail();
              }}
              className="shrink-0 text-gray-400 opacity-0 transition-opacity hover:text-blue-600 group-hover:opacity-100"
              aria-label="상세 보기"
            >
              <ExternalLink className="h-4 w-4" />
            </button>
          </div>

          <p className="mt-1 line-clamp-2 text-xs text-gray-500">
            {api.description}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
              {api.category}
            </span>
            <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
              {authTypeLabels[api.authType] ?? api.authType}
            </span>
            {api.rateLimit && (
              <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700">
                {api.rateLimit}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
