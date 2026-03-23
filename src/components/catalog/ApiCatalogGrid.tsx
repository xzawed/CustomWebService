'use client';

import type { ApiCatalogItem } from '@/types/api';
import { ApiCard } from './ApiCard';

interface ApiCatalogGridProps {
  apis: ApiCatalogItem[];
  selectedIds: string[];
  onSelect: (api: ApiCatalogItem) => void;
  onDetail: (api: ApiCatalogItem) => void;
}

export function ApiCatalogGrid({
  apis,
  selectedIds,
  onSelect,
  onDetail,
}: ApiCatalogGridProps) {
  if (apis.length === 0) {
    return (
      <div className="py-16 text-center">
        <p className="text-gray-500">검색 결과가 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
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
