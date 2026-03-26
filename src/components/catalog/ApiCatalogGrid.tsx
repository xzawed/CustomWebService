'use client';

import type { ApiCatalogItem } from '@/types/api';
import { ApiCard } from './ApiCard';
import { SearchX } from 'lucide-react';

interface ApiCatalogGridProps {
  apis: ApiCatalogItem[];
  selectedIds: string[];
  onSelect: (api: ApiCatalogItem) => void;
  onDetail: (api: ApiCatalogItem) => void;
}

export function ApiCatalogGrid({ apis, selectedIds, onSelect, onDetail }: ApiCatalogGridProps) {
  if (apis.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center rounded-2xl py-20"
        style={{ background: 'var(--bg-surface)', border: '1px dashed var(--glass-border)' }}
      >
        <SearchX className="h-10 w-10 text-slate-600" />
        <p className="mt-4 text-sm font-medium text-slate-400">검색 결과가 없습니다</p>
        <p className="mt-1 text-xs text-slate-500">다른 키워드로 검색해보세요</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {apis.map((api) => (
        <ApiCard
          key={api.id}
          api={api}
          isSelected={selectedIds.includes(api.id)}
          onSelect={() => onSelect(api)}
          onDetail={() => onDetail(api)}
        />
      ))}
    </div>
  );
}
