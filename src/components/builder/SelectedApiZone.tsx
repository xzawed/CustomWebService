'use client';

import { memo } from 'react';
import { X } from 'lucide-react';
import type { ApiCatalogItem } from '@/types/api';

interface SelectedApiZoneProps {
  selectedApis: ApiCatalogItem[];
  onRemove: (id: string) => void;
  onClear: () => void;
  maxCount: number;
}

export default memo(function SelectedApiZone({
  selectedApis,
  onRemove,
  onClear,
  maxCount,
}: SelectedApiZoneProps) {
  if (selectedApis.length === 0) {
    return (
      <div
        className="rounded-xl border-2 border-dashed p-6 text-center text-sm"
        style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
      >
        API를 선택하세요 (최대 {maxCount}개)
      </div>
    );
  }

  return (
    <div
      className="rounded-xl border p-4"
      style={{ borderColor: 'rgba(0,212,255,0.2)', background: 'rgba(0,212,255,0.04)' }}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-cyan-400">
          선택된 API ({selectedApis.length}/{maxCount})
        </span>
        <button
          type="button"
          onClick={onClear}
          className="text-xs text-slate-400 hover:text-white transition-colors"
        >
          전체 해제
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {selectedApis.map((api) => (
          <span
            key={api.id}
            className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm"
            style={{ background: 'var(--bg-surface)', color: 'var(--text)', border: '1px solid var(--border)' }}
          >
            {api.name}
            <button
              type="button"
              onClick={() => onRemove(api.id)}
              className="ml-1 text-slate-400 hover:text-white transition-colors"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
    </div>
  );
});
