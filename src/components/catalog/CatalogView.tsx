'use client';

import { useState, useMemo } from 'react';
import type { ApiCatalogItem, Category } from '@/types/api';
import { CategoryTabs } from './CategoryTabs';
import { ApiSearchBar } from './ApiSearchBar';
import { ApiCatalogGrid } from './ApiCatalogGrid';
import { ApiDetailModal } from './ApiDetailModal';

interface CatalogViewProps {
  initialApis: ApiCatalogItem[];
  categories: Category[];
  selectionMode?: boolean;
  selectedIds?: string[];
  onSelect?: (api: ApiCatalogItem) => void;
  onDeselect?: (id: string) => void;
}

export function CatalogView({
  initialApis,
  categories,
  selectionMode = false,
  selectedIds = [],
  onSelect,
  onDeselect,
}: CatalogViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [detailApi, setDetailApi] = useState<ApiCatalogItem | null>(null);

  const filteredApis = useMemo(() => {
    let result = initialApis;

    if (activeCategory !== 'all') {
      result = result.filter((api) => api.category === activeCategory);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (api) =>
          api.name.toLowerCase().includes(query) ||
          api.description.toLowerCase().includes(query) ||
          api.tags.some((tag) => tag.toLowerCase().includes(query))
      );
    }

    return result;
  }, [initialApis, activeCategory, searchQuery]);

  const handleSelect = (api: ApiCatalogItem) => {
    if (!selectionMode) return;
    if (selectedIds.includes(api.id)) {
      onDeselect?.(api.id);
    } else {
      onSelect?.(api);
    }
  };

  return (
    <div className="space-y-6">
      <ApiSearchBar value={searchQuery} onChange={setSearchQuery} />

      <CategoryTabs
        categories={categories}
        activeCategory={activeCategory}
        onCategoryChange={setActiveCategory}
      />

      <ApiCatalogGrid
        apis={filteredApis}
        selectedIds={selectedIds}
        onSelect={handleSelect}
        onDetail={setDetailApi}
      />

      <ApiDetailModal
        api={detailApi}
        isOpen={!!detailApi}
        onClose={() => setDetailApi(null)}
        onSelect={selectionMode ? (api) => handleSelect(api) : undefined}
        isSelected={detailApi ? selectedIds.includes(detailApi.id) : false}
      />
    </div>
  );
}
