'use client';

import { X } from 'lucide-react';
import type { ApiCatalogItem } from '@/types/api';

interface SelectedApiZoneProps {
  selectedApis: ApiCatalogItem[];
  onRemove: (id: string) => void;
  onClear: () => void;
  maxCount: number;
}

export default function SelectedApiZone({
  selectedApis,
  onRemove,
  onClear,
  maxCount,
}: SelectedApiZoneProps) {
  if (selectedApis.length === 0) {
    return (
      <div className="rounded-lg border-2 border-dashed border-gray-300 p-6 text-center text-sm text-gray-400">
        API를 선택하세요 (최대 {maxCount}개)
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-blue-900">
          선택된 API ({selectedApis.length}/{maxCount})
        </span>
        <button type="button" onClick={onClear} className="text-xs text-blue-600 hover:underline">
          전체 해제
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {selectedApis.map((api) => (
          <span
            key={api.id}
            className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-sm text-blue-700 shadow-sm"
          >
            {api.name}
            <button
              type="button"
              onClick={() => onRemove(api.id)}
              className="ml-1 text-blue-400 hover:text-blue-600"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}
