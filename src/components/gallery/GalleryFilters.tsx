'use client';

import React, { useEffect, useRef } from 'react';
import { Search, X } from 'lucide-react';
import type { GalleryFilter } from '@/types/gallery';

interface GalleryFiltersProps {
  filter: GalleryFilter;
  onChange: (filter: GalleryFilter) => void;
}

const CATEGORIES = [
  '전체',
  '날씨',
  '지도',
  '뉴스',
  '금융',
  '교통',
  '공공데이터',
  '소셜',
  '게임',
  '기타',
];

export function GalleryFilters({ filter, onChange }: GalleryFiltersProps): React.ReactElement {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync input value when filter.search changes externally (e.g. reset)
  useEffect(() => {
    if (inputRef.current && filter.search === undefined) {
      inputRef.current.value = '';
    }
  }, [filter.search]);

  function handleSearchChange(e: React.ChangeEvent<HTMLInputElement>): void {
    const value = e.target.value;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onChange({ ...filter, search: value.trim() || undefined });
    }, 300);
  }

  function handleSearchClear(): void {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (inputRef.current) inputRef.current.value = '';
    onChange({ ...filter, search: undefined });
  }

  function handleSortChange(sortBy: 'newest' | 'popular'): void {
    onChange({ ...filter, sortBy });
  }

  function handleCategoryChange(category: string): void {
    onChange({ ...filter, category: category === '전체' ? undefined : category });
  }

  const currentSort = filter.sortBy ?? 'newest';
  const currentCategory = filter.category ?? '전체';

  return (
    <div className="flex flex-col gap-4">
      {/* Top row: search + sort */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search input */}
        <div className="relative flex-1" style={{ minWidth: '200px' }}>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
            style={{ color: 'var(--text-muted)' }}
          />
          <input
            ref={inputRef}
            type="text"
            placeholder="서비스 검색..."
            defaultValue={filter.search ?? ''}
            onChange={handleSearchChange}
            className="w-full rounded-lg py-2 pl-9 pr-9 text-sm outline-none transition-all"
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
            }}
            onFocus={(e) => {
              (e.currentTarget as HTMLInputElement).style.borderColor = 'var(--accent-primary)';
            }}
            onBlur={(e) => {
              (e.currentTarget as HTMLInputElement).style.borderColor = 'var(--border)';
            }}
          />
          {filter.search && (
            <button
              type="button"
              onClick={handleSearchClear}
              className="absolute right-3 top-1/2 -translate-y-1/2"
              style={{ color: 'var(--text-muted)' }}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Sort toggle */}
        <div
          className="flex items-center rounded-lg p-1"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
        >
          {(['newest', 'popular'] as const).map((sort) => (
            <button
              key={sort}
              type="button"
              onClick={() => handleSortChange(sort)}
              className="rounded-md px-3 py-1.5 text-xs font-medium transition-all"
              style={{
                background: currentSort === sort ? 'var(--ghost-hover-bg)' : 'transparent',
                color: currentSort === sort ? 'var(--text-primary)' : 'var(--text-secondary)',
              }}
            >
              {sort === 'newest' ? '최신순' : '인기순'}
            </button>
          ))}
        </div>
      </div>

      {/* Category chips */}
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((cat) => {
          const isActive = currentCategory === cat;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => handleCategoryChange(cat)}
              className="rounded-full px-3 py-1 text-xs font-medium transition-all"
              style={{
                background: isActive ? 'var(--accent-primary)' : 'var(--bg-surface)',
                color: isActive ? '#fff' : 'var(--text-secondary)',
                border: '1px solid',
                borderColor: isActive ? 'var(--accent-primary)' : 'var(--border)',
              }}
            >
              {cat}
            </button>
          );
        })}
      </div>
    </div>
  );
}
